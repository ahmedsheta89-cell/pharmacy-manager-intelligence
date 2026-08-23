import type { DashboardAnalytics, ManagerAlert } from "./analyticsEngine";
import type { InventoryOperations } from "./inventoryEngine";
import type { InvoiceSettlementRecord } from "./invoiceReconciliation";
import { isApprovedMapping } from "./mappingApproval";
import type { CanonicalField, CleanRecord, ColumnMapping, SheetInspection } from "./pharmacyEngine";

export type OperatingPriority = {
  id: string;
  level: "urgent" | "review" | "watch" | "positive";
  title: string;
  evidence: string;
  action: string;
  source: "alert" | "inventory" | "invoice";
};

export type SupplierLedgerEntry = {
  supplierName: string;
  settlements: number;
  suppliedLines: number;
  acceptedQuantity: number;
  shortQuantity?: number;
  exactMatches: number;
  reviewMatches: number;
  latestSettlementAt: number;
  note: string;
};

export type SupplierLedger = {
  available: boolean;
  note: string;
  entries: SupplierLedgerEntry[];
  totals: { suppliers: number; settlements: number; acceptedQuantity: number; shortQuantity?: number };
};

export type BranchTransferSuggestion = {
  id: string;
  productName: string;
  productCode?: string;
  fromBranch: string;
  toBranch: string;
  suggestedQuantity: number;
  evidence: string;
  action: string;
};

export type BranchIntelligence = {
  available: boolean;
  note: string;
  suggestions: BranchTransferSuggestion[];
};

const levelWeight: Record<OperatingPriority["level"], number> = { urgent: 0, review: 1, watch: 2, positive: 3 };

const numeric = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = String(value)
    .replace(/[٠-٩٫٬]/g, (character) => ({ "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," }[character] ?? character))
    .replace(/[ج.م|EGP|£,\s]/gi, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const mapping = (mappings: ColumnMapping[]) => mappings.reduce((result, entry) => {
  if (entry.field !== "unknown" && isApprovedMapping(entry) && !result[entry.field]) result[entry.field] = entry.sourceColumn;
  return result;
}, {} as Partial<Record<CanonicalField, string>>);

const field = (record: CleanRecord, fields: Partial<Record<CanonicalField, string>>, name: CanonicalField) => fields[name] ? record[fields[name] as string] : undefined;
const text = (record: CleanRecord, fields: Partial<Record<CanonicalField, string>>, name: CanonicalField) => String(field(record, fields, name) ?? "").trim();

function alertPriority(alert: ManagerAlert): OperatingPriority {
  return { id: `alert:${alert.id}`, level: alert.level, title: alert.title, evidence: alert.evidence || alert.detail, action: alert.action, source: "alert" };
}

export function deriveOperatingPriorities(analytics: DashboardAnalytics, inventory: InventoryOperations, settlements: InvoiceSettlementRecord[]): OperatingPriority[] {
  const candidates: OperatingPriority[] = analytics.alerts.map(alertPriority);
  const firstLowStock = inventory.lowStock[0];
  if (firstLowStock) candidates.push({
    id: `stock:${firstLowStock.id}`,
    level: "urgent",
    title: `رصيد منخفض: ${firstLowStock.itemName}`,
    evidence: firstLowStock.note,
    action: "افتح الطلبات والمخزون، راجع الكمية المقترحة، ثم اعتمد الطلب يدويًا إن كانت البيانات صحيحة.",
    source: "inventory",
  });
  const firstExpiry = inventory.nearExpiry[0];
  if (firstExpiry) candidates.push({
    id: `expiry:${firstExpiry.id}`,
    level: firstExpiry.daysToExpiry !== undefined && firstExpiry.daysToExpiry < 0 ? "urgent" : "review",
    title: `صلاحية تحتاج قرارًا: ${firstExpiry.itemName}`,
    evidence: firstExpiry.note,
    action: "راجع الصلاحية والكمية مع الفرع قبل اتخاذ قرار نقل أو إيقاف أو تصريف يدوي.",
    source: "inventory",
  });
  const latestPartial = settlements.flatMap((record) => record.lines.map((line) => ({ record, line })))
    .find(({ line }) => (line.quantity ?? 0) > (line.proposedDeduction ?? 0));
  if (latestPartial) candidates.push({
    id: `invoice:${latestPartial.record.id}:${latestPartial.line.orderId ?? latestPartial.line.itemCode ?? latestPartial.line.itemName}`,
    level: "review",
    title: `توريد جزئي لدى ${latestPartial.record.supplierName}`,
    evidence: `الكمية الواردة ${latestPartial.line.quantity ?? "غير موثقة"}، والكمية المعتمدة ${latestPartial.line.proposedDeduction ?? 0} للصنف ${latestPartial.line.itemName}.`,
    action: "راجع المتبقي في الطلب قبل إنشاء طلب متابعة أو اعتماد كمية إضافية يدويًا.",
    source: "invoice",
  });
  const unique = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values());
  return unique.sort((first, second) => levelWeight[first.level] - levelWeight[second.level]).slice(0, 3);
}

export function deriveSupplierLedger(records: InvoiceSettlementRecord[]): SupplierLedger {
  if (!records.length) return { available: false, note: "لا توجد قرارات تسوية فواتير معتمدة بعد. سيظهر دفتر الموردين بعد اعتماد تسوية واحدة على الأقل.", entries: [], totals: { suppliers: 0, settlements: 0, acceptedQuantity: 0 } };
  const suppliers = new Map<string, SupplierLedgerEntry>();
  for (const record of records) {
    const supplierName = record.supplierName.trim() || "مورد غير مسمى";
    const current = suppliers.get(supplierName) ?? { supplierName, settlements: 0, suppliedLines: 0, acceptedQuantity: 0, shortQuantity: 0, exactMatches: 0, reviewMatches: 0, latestSettlementAt: 0, note: "يقيس الدفتر كميات التسويات المعتمدة فقط؛ لا يحسب التأخير أو فرق السعر ما لم يتوفر تاريخ وعد أو سعر موثق." };
    current.settlements += 1;
    current.latestSettlementAt = Math.max(current.latestSettlementAt, record.settledAt);
    for (const line of record.lines) {
      current.suppliedLines += 1;
      current.acceptedQuantity += line.proposedDeduction ?? 0;
      const requested = line.quantity;
      if (requested !== undefined && (line.proposedDeduction ?? 0) < requested) current.shortQuantity = (current.shortQuantity ?? 0) + (requested - (line.proposedDeduction ?? 0));
      if (line.matchMethod === "code" || line.matchMethod === "name") current.exactMatches += 1;
      else current.reviewMatches += 1;
    }
    suppliers.set(supplierName, current);
  }
  const entries = Array.from(suppliers.values()).sort((first, second) => second.latestSettlementAt - first.latestSettlementAt);
  const acceptedQuantity = entries.reduce((sum, entry) => sum + entry.acceptedQuantity, 0);
  const shortQuantity = entries.reduce((sum, entry) => sum + (entry.shortQuantity ?? 0), 0);
  return { available: true, note: "تُبنى المؤشرات من قرارات التسوية المعتمدة والكميات التي راجعها المدير. لا تُخزّن صور الفواتير أو نصوص OCR.", entries, totals: { suppliers: entries.length, settlements: records.length, acceptedQuantity, ...(shortQuantity > 0 ? { shortQuantity } : {}) } };
}

type BranchProduct = { branch: string; productName: string; productCode?: string; stock: number; reorderLevel?: number; salesQuantity?: number };

export function deriveBranchIntelligence(sheets: SheetInspection[]): BranchIntelligence {
  const rows: BranchProduct[] = [];
  for (const sheet of sheets) {
    const fields = mapping(sheet.mappings);
    if (!fields.branch || !fields.item_name || !fields.stock_quantity) continue;
    for (const record of sheet.cleanRecords) {
      const branch = text(record, fields, "branch");
      const productName = text(record, fields, "item_name");
      const stock = numeric(field(record, fields, "stock_quantity"));
      if (!branch || !productName || stock === undefined) continue;
      rows.push({
        branch,
        productName,
        productCode: text(record, fields, "item_code") || undefined,
        stock,
        reorderLevel: numeric(field(record, fields, "reorder_level")),
        salesQuantity: numeric(field(record, fields, "quantity_sold")) ?? numeric(field(record, fields, "sales_quantity")),
      });
    }
  }
  const branches = new Set(rows.map((row) => row.branch));
  if (branches.size < 2) return { available: false, note: "لا توجد أرصدة للصنف مفصولة حسب فرعين على الأقل؛ لذلك لم يُنشأ اقتراح نقل.", suggestions: [] };
  const grouped = new Map<string, BranchProduct[]>();
  for (const row of rows) {
    const key = row.productCode || row.productName;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const suggestions: BranchTransferSuggestion[] = [];
  for (const items of Array.from(grouped.values())) {
    for (const destination of items) {
      const destinationFloor = Math.max(destination.reorderLevel ?? 0, destination.salesQuantity ?? 0);
      const need = Math.max(0, Math.ceil(destinationFloor - destination.stock));
      if (!need) continue;
      const donor = items.filter((candidate) => candidate.branch !== destination.branch).map((candidate) => ({ candidate, available: Math.max(0, Math.floor(candidate.stock - Math.max(candidate.reorderLevel ?? 0, candidate.salesQuantity ?? 0)) ) })).sort((first, second) => second.available - first.available)[0];
      if (!donor || donor.available <= 0) continue;
      const suggestedQuantity = Math.min(need, donor.available);
      suggestions.push({
        id: `transfer:${destination.productCode ?? destination.productName}:${donor.candidate.branch}:${destination.branch}`,
        productName: destination.productName,
        productCode: destination.productCode,
        fromBranch: donor.candidate.branch,
        toBranch: destination.branch,
        suggestedQuantity,
        evidence: `رصيد ${destination.branch} هو ${destination.stock} مقابل حد/مبيعات موثقة ${destinationFloor}، بينما يظل في ${donor.candidate.branch} فائض محافظ قدره ${donor.available} بعد ترك حدّه الأدنى.`,
        action: "راجع الصنف والرصيد الفعلي في الفرعين، ثم اعتمد النقل يدويًا خارج الأداة عند صحة البيانات.",
      });
    }
  }
  if (!suggestions.length) return { available: true, note: "تتوفر بيانات فروع وأرصدة، لكن لا يوجد فائض محافظ موثق يقابل احتياج فرع آخر ضمن البيانات الحالية.", suggestions: [] };
  return { available: true, note: "هذه توصيات نقل يدوية مبنية على رصيد وحد إعادة طلب أو مبيعات موثقة لكل فرع. لا تُنفّذ أي حركة تلقائيًا.", suggestions: suggestions.sort((first, second) => second.suggestedQuantity - first.suggestedQuantity).slice(0, 12) };
}
