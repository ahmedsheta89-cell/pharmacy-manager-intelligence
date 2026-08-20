/**
 * نبض العيادة التنفيذي — محرك المخزون والفروع.
 * يستخدم فقط الحقول التي تطابقها قراءة Excel بثقة، ولا يملأ أي نقص بتخمينات.
 */
import type { CanonicalField, CleanRecord, ColumnMapping, SheetInspection } from "./pharmacyEngine";
import { isApprovedMapping } from "./importReview";

type FieldMap = Partial<Record<CanonicalField, string>>;

export interface InventoryItem {
  id: string;
  itemName: string;
  itemCode?: string;
  company?: string;
  stock?: number;
  reorderLevel?: number;
  reorderSource?: "custom" | "file";
  targetStock?: number;
  salesQuantity?: number;
  expiryDate?: Date;
  daysToExpiry?: number;
  status: "near_expiry" | "low_stock" | "healthy" | "review";
  note: string;
}

export interface ReorderSuggestion {
  id: string;
  itemName: string;
  itemCode?: string;
  currentStock?: number;
  reorderLevel?: number;
  reorderSource?: "custom" | "file" | "sales";
  targetStock?: number;
  salesQuantity?: number;
  suggestedQuantity?: number;
  reason: string;
}

export interface BranchPerformance {
  branch: string;
  sales?: number;
  grossProfit?: number;
  quantity?: number;
  records: number;
}

export interface InventoryOperations {
  available: boolean;
  note: string;
  items: InventoryItem[];
  nearExpiry: InventoryItem[];
  lowStock: InventoryItem[];
  suggestions: ReorderSuggestion[];
  branches: BranchPerformance[];
  branchNote: string;
}

export interface ReorderRule {
  itemId: string;
  reorderLevel: number;
  targetStock?: number;
  updatedAt: string;
}

const mapFields = (mappings: ColumnMapping[]): FieldMap => mappings.reduce((result, mapping) => {
  if (mapping.field !== "unknown" && isApprovedMapping(mapping) && !result[mapping.field]) result[mapping.field] = mapping.sourceColumn;
  return result;
}, {} as FieldMap);

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).replace(/[٠-٩٫٬]/g, (char) => ({ "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," }[char] ?? char)).replace(/[ج.م|EGP|£,\s]/gi, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const dateValue = (value: unknown): Date | undefined => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (!value) return undefined;
  const raw = String(value).trim().replace(/[٠-٩]/g, (char) => ({ "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" }[char] ?? char));
  const parts = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (parts) {
    const day = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed;
};

const valueFor = (record: CleanRecord, map: FieldMap, field: CanonicalField) => map[field] ? record[map[field] as string] : undefined;
const textFor = (record: CleanRecord, map: FieldMap, field: CanonicalField) => String(valueFor(record, map, field) ?? "").trim();
const todayAtMidnight = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };

function withItemStatus(item: InventoryItem): InventoryItem {
  if (item.daysToExpiry !== undefined && item.daysToExpiry <= 90) return { ...item, status: "near_expiry", note: item.daysToExpiry < 0 ? "منتهٍ وفق تاريخ الصلاحية المسجل." : `ينتهي خلال ${item.daysToExpiry} يومًا.` };
  if (item.stock !== undefined && item.reorderLevel !== undefined && item.stock <= item.reorderLevel) return { ...item, status: "low_stock", note: `الرصيد ${item.stock} عند أو دون حد إعادة الطلب ${item.reorderLevel}.` };
  if (item.stock === undefined) return { ...item, status: "review", note: "رصيد الصنف غير مكتمل." };
  return { ...item, status: "healthy", note: "لا توجد إشارة خطر من الحقول المتاحة." };
}

export function analyzeInventoryOperations(sheets: SheetInspection[], rules: Record<string, ReorderRule> = {}): InventoryOperations {
  const stockSheet = [...sheets].sort((a, b) => {
    const score = (sheet: SheetInspection) => {
      const fields = new Set(sheet.quality.recognizedFields);
      return (fields.has("item_name") ? 1000 : 0) + (fields.has("stock_quantity") ? 900 : 0) + (fields.has("reorder_level") ? 300 : 0) + (fields.has("expiry_date") ? 200 : 0) + sheet.cleanRecords.length;
    };
    return score(b) - score(a);
  })[0];
  const branchMap = new Map<string, BranchPerformance>();
  for (const sheet of sheets) {
    const fields = mapFields(sheet.mappings);
    if (!fields.branch) continue;
    for (const record of sheet.cleanRecords) {
      const branch = textFor(record, fields, "branch");
      if (!branch) continue;
      const current = branchMap.get(branch) ?? { branch, records: 0, sales: 0, grossProfit: 0, quantity: 0 };
      const sales = record.__metrics.sales ?? numberValue(valueFor(record, fields, "sales_total"));
      const profit = record.__metrics.profit ?? numberValue(valueFor(record, fields, "profit"));
      const quantity = record.__metrics.quantity ?? numberValue(valueFor(record, fields, "quantity_sold")) ?? numberValue(valueFor(record, fields, "sales_quantity"));
      current.records += 1;
      current.sales = (current.sales ?? 0) + (sales ?? 0);
      current.grossProfit = (current.grossProfit ?? 0) + (profit ?? 0);
      current.quantity = (current.quantity ?? 0) + (quantity ?? 0);
      branchMap.set(branch, current);
    }
  }
  const branches = Array.from(branchMap.values()).sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0));
  if (!stockSheet) return { available: false, note: "لا توجد شيتات قابلة للتحليل.", items: [], nearExpiry: [], lowStock: [], suggestions: [], branches, branchNote: branches.length > 1 ? "مقارنة الفروع مبنية على السجلات المطابقة لحقل الفرع." : "أضف عمود «الفرع» إلى بيانات أكثر من فرع لإظهار المقارنة." };
  const fields = mapFields(stockSheet.mappings);
  if (!fields.item_name || !fields.stock_quantity) return { available: false, note: "تحتاج لوحة المخزون إلى اسم الصنف ورصيد المخزون على الأقل. أضف أعمدة «اسم الصنف» و«المخزون» إلى الملف.", items: [], nearExpiry: [], lowStock: [], suggestions: [], branches, branchNote: branches.length > 1 ? "مقارنة الفروع مبنية على السجلات المطابقة لحقل الفرع." : "أضف عمود «الفرع» إلى بيانات أكثر من فرع لإظهار المقارنة." };
  const now = todayAtMidnight();
  const itemMap = new Map<string, InventoryItem>();
  for (const record of stockSheet.cleanRecords) {
    const itemName = textFor(record, fields, "item_name");
    const itemCode = textFor(record, fields, "item_code") || undefined;
    if (!itemName) continue;
    const key = itemCode || itemName;
    const stock = numberValue(valueFor(record, fields, "stock_quantity"));
    const reorder = numberValue(valueFor(record, fields, "reorder_level"));
    const salesQuantity = numberValue(valueFor(record, fields, "quantity_sold")) ?? numberValue(valueFor(record, fields, "sales_quantity"));
    const expiryDate = dateValue(valueFor(record, fields, "expiry_date"));
    const daysToExpiry = expiryDate ? Math.ceil((new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate()).valueOf() - now.valueOf()) / 86400000) : undefined;
    const existing = itemMap.get(key);
    const next: InventoryItem = {
      id: key,
      itemName,
      itemCode,
      company: textFor(record, fields, "company") || undefined,
      stock: stock ?? existing?.stock,
      reorderLevel: reorder ?? existing?.reorderLevel,
      reorderSource: reorder !== undefined ? "file" : existing?.reorderSource,
      salesQuantity: (existing?.salesQuantity ?? 0) + (salesQuantity ?? 0),
      expiryDate: expiryDate ?? existing?.expiryDate,
      daysToExpiry: daysToExpiry ?? existing?.daysToExpiry,
      status: "healthy",
      note: "",
    };
    itemMap.set(key, withItemStatus(next));
  }
  const items = Array.from(itemMap.values()).map((item) => {
    const rule = rules[item.id];
    if (!rule) return item;
    return withItemStatus({ ...item, reorderLevel: rule.reorderLevel, reorderSource: "custom", targetStock: rule.targetStock });
  });
  const nearExpiry = items.filter((item) => item.status === "near_expiry").sort((a, b) => (a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity));
  const lowStock = items.filter((item) => item.status === "low_stock").sort((a, b) => ((a.stock ?? Infinity) - (a.reorderLevel ?? 0)) - ((b.stock ?? Infinity) - (b.reorderLevel ?? 0)));
  const suggestions = items.filter((item) => item.stock !== undefined && (item.reorderLevel !== undefined || item.salesQuantity)).map((item) => {
    const target = item.targetStock ?? Math.max((item.reorderLevel ?? 0) * 2, item.salesQuantity ?? 0);
    const suggestedQuantity = Math.max(0, Math.ceil(target - (item.stock ?? 0)));
    const reason = item.targetStock !== undefined ? `للوصول إلى رصيد الهدف المخصص (${item.targetStock}).` : item.reorderLevel !== undefined ? `للوصول إلى تغطية ضعف حد إعادة الطلب (${item.reorderLevel * 2}).` : "للوصول إلى تغطية مبيعات الفترة المتاحة.";
    const reorderSource: ReorderSuggestion["reorderSource"] = item.reorderSource ?? (item.salesQuantity ? "sales" : undefined);
    return { id: item.id, itemName: item.itemName, itemCode: item.itemCode, currentStock: item.stock, reorderLevel: item.reorderLevel, reorderSource, targetStock: item.targetStock, salesQuantity: item.salesQuantity, suggestedQuantity, reason };
  }).filter((item) => (item.suggestedQuantity ?? 0) > 0).sort((a, b) => (b.suggestedQuantity ?? 0) - (a.suggestedQuantity ?? 0));
  return { available: true, note: `مبني على شيت «${stockSheet.name}» والحقول التي تعرف عليها النظام بثقة.`, items, nearExpiry, lowStock, suggestions, branches, branchNote: branches.length > 1 ? "المبيعات والأرباح المقارنة تحسب من سجلات كل فرع داخل الملف، دون دمج تقديري." : "أضف عمود «الفرع» لسجلين أو أكثر لإظهار مقارنة الأداء بين الفروع." };
}
