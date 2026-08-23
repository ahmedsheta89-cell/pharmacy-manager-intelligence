/**
 * Design philosophy — نبض العيادة التنفيذي:
 * هذا المحرك لا يفترض ترتيب الأعمدة؛ يقرأ مصدر الصيدلية كما هو،
 * ويعطي درجة ثقة واضحة لكل حقل قبل أن يُستخدم في أي قرار إداري.
 */
import * as XLSX from "xlsx";
import { assertSpreadsheetFileSafety, assertWorkbookSafety } from "./spreadsheetSafety";

export type CanonicalField =
  | "item_code"
  | "item_name"
  | "company"
  | "category"
  | "item_type"
  | "unit"
  | "quantity_sold"
  | "stock_quantity"
  | "reorder_level"
  | "expiry_date"
  | "sale_price"
  | "sales_total"
  | "sales_quantity"
  | "invoice_number"
  | "sale_date"
  | "sale_time"
  | "customer"
  | "employee"
  | "branch"
  | "cost_price"
  | "total_cost"
  | "profit"
  | "profit_margin"
  | "discount"
  | "discount_value"
  | "expense_date"
  | "expense_type"
  | "expense_amount"
  | "payment_method"
  | "user"
  | "notes"
  | "transaction_date"
  | "transaction_type"
  | "account"
  | "amount";

export type DataValue = string | number | Date | Record<string, unknown> | null | undefined;
export type RawRecord = Record<string, DataValue>;
export type CleanRecord = RawRecord & {
  __rowIndex: number;
  __sheetName: string;
  __metrics: {
    sales?: number;
    quantity?: number;
    cost?: number;
    profit?: number;
    unitSalePrice?: number;
    unitCost?: number;
    profitMargin?: number;
    discount?: number;
    date?: Date;
    priceSource?: "price_file";
  };
};

export interface ColumnMapping {
  sourceColumn: string;
  field: CanonicalField | "unknown";
  /** التفسير الآلي الأولي؛ لا يُستخدم في القرار قبل اعتماد المدير. */
  proposedField?: CanonicalField | "unknown";
  confidence: "عالية" | "متوسطة" | "منخفضة";
  score: number;
  reason: string;
  sample: string;
  approvalStatus?: "suggested" | "approved" | "overridden" | "ignored";
  approvalReason?: string;
  approvedAt?: string;
  dataColumn?: string;
  headerColumn?: string;
  adjustedForHeaderShift?: boolean;
}

/** إعدادات المدير لتحرير قراءة الشيت. الفهارس صفرية داخليًا، ولا تعدّل ملف Excel الأصلي. */
export interface SheetEditorConfig {
  headerRowIndex: number;
  dataStartRowIndex: number;
  firstDataColumnIndex: number;
  /** الحد الأخير للنطاق المقروء، بفهرس صفري داخليًا. */
  lastDataRowIndex: number;
  /** الحد الأخير للأعمدة المقروءة، بفهرس صفري داخليًا. */
  lastDataColumnIndex: number;
  /** أرقام صفوف Excel المرئية للمدير، وتبدأ من 1. */
  excludedRowNumbers: number[];
  /** تحويلات نصية محلية على نسخة المعاينة فقط، ولا تعدّل ملف المصدر. */
  textTransforms: SheetTextTransform[];
  /** تسميات يكتبها المدير في خلايا صف العناوين، مفهرسة بترقيم عمود Excel الصفري. */
  headerOverrides: Record<number, string>;
  /** قيم يصححها المدير في نسخة المعاينة فقط، ومفتاحها «رقم الصف الصفري:رقم العمود الصفري». */
  cellOverrides: Record<string, DataValue>;
  /** أعمدة اختار المدير استبعادها من القراءة والتحليل، بفهرس Excel الصفري. */
  ignoredColumnIndexes: number[];
  /** أعمدة محلية تضاف إلى المعاينة فقط؛ لا تضاف أو ترفع إلى ملف Excel الأصلي. */
  manualColumns: Array<{ id: string; title: string }>;
  /** صفوف محلية تضاف إلى نهاية المعاينة فقط؛ لا تضاف أو ترفع إلى ملف Excel الأصلي. */
  manualRows: Array<{ id: string }>;
  updatedAt?: string;
}

export type SheetTextTransform =
  | { id: string; type: "merge"; sources: string[]; target: string; separator: string }
  | { id: string; type: "split"; source: string; target: string; separator: string; parts: number };

export interface SheetInspection {
  name: string;
  rows: number;
  columns: number;
  headerRowIndex: number;
  headerDataOffset: number;
  layoutNote?: string;
  /** أعمدة ظهرت في المصدر الخام ولكن استُبعدت بقرار صريح قبل التحليل. */
  excludedColumns?: Array<{ dataColumn: string; sourceColumn: string; reason: string }>;
  /** رؤوس وهمية أزيلت من تفسير الخريطة، من دون حذف أي عمود بيانات. */
  removedHeaders?: Array<{ headerColumn: string; title: string; reason: string }>;
  headers: string[];
  mappings: ColumnMapping[];
  rawRecords: RawRecord[];
  cleanRecords: CleanRecord[];
  excludedRows: number;
  quality: QualityReport;
  preview: RawRecord[];
  /** نسخة قراءة محلية من المصدر لتمكين المحرر؛ لا تمر للتحليل بوصفها ملفًا جديدًا. */
  sourceMatrix?: DataValue[][];
  editorConfig?: SheetEditorConfig;
}

export interface ImportInspection {
  fileName: string;
  fileType: string;
  fileSize: number;
  sheets: SheetInspection[];
  fileFingerprint: string;
  detectedAt: Date;
}

export interface QualityIssue {
  type: "مفقود" | "غير رقمي" | "تاريخ غير صالح" | "قيمة سالبة" | "تكرار" | "صف إجمالي" | "صف مستبعد بقرار المدير";
  count: number;
  detail: string;
  severity: "low" | "medium" | "high";
}

export interface QualityReport {
  score: number;
  validRecords: number;
  excludedRecords: number;
  emptyCriticalCells: number;
  invalidNumericValues: number;
  invalidDates: number;
  negativeValues: number;
  duplicates: number;
  totalRows: number;
  issues: QualityIssue[];
  recognizedFields: CanonicalField[];
  unknownColumns: string[];
}

const FIELD_DEFINITIONS: Record<CanonicalField, { labels: string[]; keywords: string[]; kind?: "number" | "date" | "text" }> = {
  item_code: { labels: ["كود الصنف", "كود", "رمز الصنف", "item code", "product code", "code", "sku", "barcode"], keywords: ["كود", "رمز", "code", "sku", "barcode"], kind: "text" },
  item_name: { labels: ["اسم الصنف", "الاسم", "الإسم", "الصنف", "اسم المنتج", "المنتج", "item name", "product", "description", "item"], keywords: ["اسم", "اسـم", "صنف", "منتج", "item", "product", "description"], kind: "text" },
  company: { labels: ["الشركة", "اسم الشركة", "manufacturer", "company", "supplier", "المورد"], keywords: ["شركة", "company", "manufacturer", "supplier", "مورد"], kind: "text" },
  category: { labels: ["التصنيف", "الفئة", "القسم", "category", "classification", "group"], keywords: ["تصنيف", "فئة", "قسم", "category", "class", "group"], kind: "text" },
  item_type: { labels: ["نوع الصنف", "النوع", "item type", "type"], keywords: ["نوع", "type"], kind: "text" },
  unit: { labels: ["الوحدة", "unit", "uom"], keywords: ["وحدة", "unit", "uom"], kind: "text" },
  quantity_sold: { labels: ["الكمية المباعة", "الكمية", "عدد الوحدات", "sold quantity", "sales quantity", "qty", "quantity"], keywords: ["كمية", "quantity", "qty", "وحدات"], kind: "number" },
  stock_quantity: { labels: ["رصيد المخزون", "المخزون", "الرصيد", "stock quantity", "stock", "balance"], keywords: ["مخزون", "stock", "رصيد", "balance"], kind: "number" },
  reorder_level: { labels: ["حد إعادة الطلب", "الحد الأدنى", "reorder level", "min stock", "minimum stock"], keywords: ["إعادة الطلب", "حد أدنى", "reorder", "min stock"], kind: "number" },
  expiry_date: { labels: ["تاريخ الانتهاء", "تاريخ الصلاحية", "انتهاء الصلاحية", "expiry date", "expiration date", "expiry", "exp date"], keywords: ["انتهاء", "صلاحيه", "expiry", "expiration", "exp date"], kind: "date" },
  sale_price: { labels: ["سعر البيع", "سعر الجمهور", "سعر المستهلك", "سعر التجزئة", "سعر", "unit sale price", "sale price", "selling price", "public price", "retail price"], keywords: ["سعر البيع", "سعر الجمهور", "سعر المستهلك", "سعر التجزئة", "selling", "sale price", "public price", "retail price"], kind: "number" },
  sales_total: { labels: ["إجمالي المبيعات", "قيمة المبيعات", "إجمالي البيع", "إجمالى س.بيع", "إجمالي س.بيع", "صافي البيع", "sales total", "total sales", "net sales", "amount sold"], keywords: ["إجمالي المبيعات", "قيمة المبيعات", "إجمالى س.بيع", "اجمالي س بيع", "total sales", "net sales", "مبيعات"], kind: "number" },
  sales_quantity: { labels: ["كمية البيع", "كمية المبيعات", "sales qty", "sales quantity"], keywords: ["بيع", "sales"], kind: "number" },
  invoice_number: { labels: ["رقم الفاتورة", "الفاتورة", "invoice number", "invoice", "bill no"], keywords: ["فاتورة", "invoice", "bill"], kind: "text" },
  sale_date: { labels: ["تاريخ البيع", "التاريخ", "sale date", "sales date", "date"], keywords: ["تاريخ", "date"], kind: "date" },
  sale_time: { labels: ["وقت البيع", "الوقت", "sale time", "time"], keywords: ["وقت", "time"], kind: "text" },
  customer: { labels: ["العميل", "اسم العميل", "customer", "patient"], keywords: ["عميل", "customer", "patient"], kind: "text" },
  employee: { labels: ["الموظف", "البائع", "employee", "salesperson", "cashier"], keywords: ["موظف", "بائع", "employee", "cashier"], kind: "text" },
  branch: { labels: ["الفرع", "branch", "store"], keywords: ["فرع", "branch", "store"], kind: "text" },
  cost_price: { labels: ["سعر التكلفة", "سعر الشراء", "ثمن الشراء", "التكلفة للوحدة", "unit cost", "cost price", "purchase price"], keywords: ["سعر التكلفة", "سعر الشراء", "ثمن الشراء", "unit cost", "cost price", "purchase"], kind: "number" },
  total_cost: { labels: ["إجمالي التكلفة", "قيمة التكلفة", "total cost", "cost total"], keywords: ["إجمالي التكلفة", "total cost", "قيمة التكلفة"], kind: "number" },
  profit: { labels: ["الربح", "إجمالي الربح", "profit", "gross profit"], keywords: ["ربح", "profit"], kind: "number" },
  profit_margin: { labels: ["هامش الربح", "نسبة الربح", "profit margin", "margin"], keywords: ["هامش", "margin", "نسبة الربح"], kind: "number" },
  discount: { labels: ["نسبة الخصم", "خصم %", "discount percent", "discount %"], keywords: ["نسبة الخصم", "discount percent"], kind: "number" },
  discount_value: { labels: ["قيمة الخصم", "الخصم", "discount value", "discount amount", "discount"], keywords: ["قيمة الخصم", "discount value", "discount amount"], kind: "number" },
  expense_date: { labels: ["تاريخ المصروف", "expense date"], keywords: ["مصروف", "expense"], kind: "date" },
  expense_type: { labels: ["نوع المصروف", "بند المصروف", "expense type", "expense category"], keywords: ["نوع المصروف", "expense type", "بند"], kind: "text" },
  expense_amount: { labels: ["قيمة المصروف", "مبلغ المصروف", "expense amount", "expense value"], keywords: ["قيمة المصروف", "expense amount", "مبلغ"], kind: "number" },
  payment_method: { labels: ["طريقة الدفع", "وسيلة الدفع", "payment method", "payment type"], keywords: ["دفع", "payment"], kind: "text" },
  user: { labels: ["المستخدم", "user", "created by"], keywords: ["مستخدم", "user"], kind: "text" },
  notes: { labels: ["ملاحظات", "ملاحظة", "notes", "note", "remark"], keywords: ["ملاحظة", "notes", "remark"], kind: "text" },
  transaction_date: { labels: ["تاريخ الحركة", "transaction date"], keywords: ["حركة", "transaction"], kind: "date" },
  transaction_type: { labels: ["نوع الحركة", "transaction type"], keywords: ["نوع الحركة", "transaction type"], kind: "text" },
  account: { labels: ["الحساب", "اسم الحساب", "account", "account name"], keywords: ["حساب", "account"], kind: "text" },
  amount: { labels: ["المبلغ", "القيمة", "amount", "value"], keywords: ["مبلغ", "القيمة", "amount", "value"], kind: "number" },
};

const arabicNumbers: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," };

export const fieldArabicName: Record<CanonicalField, string> = {
  item_code: "كود الصنف", item_name: "اسم الصنف", company: "الشركة", category: "التصنيف", item_type: "نوع الصنف", unit: "الوحدة",
  quantity_sold: "الكمية المباعة", stock_quantity: "رصيد المخزون", reorder_level: "حد إعادة الطلب", expiry_date: "تاريخ الانتهاء", sale_price: "سعر البيع", sales_total: "إجمالي المبيعات",
  sales_quantity: "كمية المبيعات", invoice_number: "رقم الفاتورة", sale_date: "تاريخ البيع", sale_time: "وقت البيع", customer: "العميل", employee: "الموظف", branch: "الفرع",
  cost_price: "سعر التكلفة", total_cost: "إجمالي التكلفة", profit: "الربح", profit_margin: "هامش الربح", discount: "نسبة الخصم", discount_value: "قيمة الخصم",
  expense_date: "تاريخ المصروف", expense_type: "نوع المصروف", expense_amount: "قيمة المصروف", payment_method: "طريقة الدفع", user: "المستخدم", notes: "ملاحظات",
  transaction_date: "تاريخ الحركة", transaction_type: "نوع الحركة", account: "الحساب", amount: "المبلغ",
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/[٠-٩٫٬]/g, (char) => arabicNumbers[char] ?? char)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s_\-\/()]+/g, " ")
    .replace(/[^a-zA-Z0-9\u0621-\u064A%. ]/g, "")
    .trim();
}

export function toNumber(value: DataValue): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = String(value)
    .replace(/[٠-٩٫٬]/g, (char) => arabicNumbers[char] ?? char)
    .replace(/[ج.م|EGP|£|,\s]/gi, "")
    .replace(/\((.*)\)/, "-$1");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : undefined;
}

export function toDate(value: DataValue): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number" && value > 1000 && value < 100000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  if (!value) return undefined;
  const text = String(value).replace(/[٠-٩]/g, (char) => arabicNumbers[char] ?? char).trim();
  const arabicMatch = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (arabicMatch) {
    const [, day, month, year] = arabicMatch;
    const normalizedYear = year.length === 2 ? `20${year}` : year;
    const date = new Date(Number(normalizedYear), Number(month) - 1, Number(day));
    if (date.getFullYear() === Number(normalizedYear) && date.getMonth() === Number(month) - 1) return date;
  }
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function headerScore(row: unknown[]): number {
  const labels = row.map(normalizeText).filter(Boolean);
  if (!labels.length) return -1;
  let matches = 0;
  for (const label of labels) {
    if (Object.values(FIELD_DEFINITIONS).some((definition) => definition.labels.map(normalizeText).includes(label) || definition.keywords.some((word) => label.includes(normalizeText(word))))) matches += 1;
  }
  const uniqueBonus = new Set(labels).size / labels.length;
  return matches * 4 + uniqueBonus - Math.max(0, labels.length - 30) * 0.05;
}

function getHeaderRow(matrix: unknown[][]): number {
  const candidates = matrix.slice(0, Math.min(25, matrix.length));
  let best = 0;
  let bestScore = -Infinity;
  candidates.forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

function scoreMapping(header: string): { field: CanonicalField | "unknown"; score: number; reason: string } {
  const normalizedHeader = normalizeText(header);
  if (!normalizedHeader) return { field: "unknown", score: 0, reason: "عنوان فارغ" };
  let winner: CanonicalField | "unknown" = "unknown";
  let topScore = 0;
  let reason = "لم تظهر دلالة كافية على معنى الحقل";
  for (const [field, definition] of Object.entries(FIELD_DEFINITIONS) as [CanonicalField, (typeof FIELD_DEFINITIONS)[CanonicalField]][]) {
    const exact = definition.labels.map(normalizeText).includes(normalizedHeader);
    const keywordMatches = definition.keywords.filter((keyword) => normalizedHeader.includes(normalizeText(keyword))).length;
    const labelPartial = definition.labels.some((label) => normalizedHeader.includes(normalizeText(label)) || normalizeText(label).includes(normalizedHeader));
    const score = exact ? 100 : labelPartial ? 78 : keywordMatches ? Math.min(70, keywordMatches * 38) : 0;
    if (score > topScore) {
      winner = field;
      topScore = score;
      reason = exact ? "تطابق مباشر مع اسم حقل معروف" : labelPartial ? "تطابق قوي مع اسم مشابه" : "تطابق بالكلمات الدلالية";
    }
  }
  return { field: topScore >= 38 ? winner : "unknown", score: topScore, reason };
}

function mapColumns(headers: string[], rawRows: unknown[][], headerColumns?: Array<string | undefined>, dataColumnOffset = 0, dataColumns?: Array<string | undefined>): ColumnMapping[] {
  return headers.map((header, index) => {
    const result = scoreMapping(header);
    const sample = rawRows.slice(0, 5).map((row) => row[index]).find((value) => value !== undefined && value !== null && value !== "");
    const headerColumn = headerColumns ? headerColumns[index] : XLSX.utils.encode_col(index);
    return {
      sourceColumn: header,
      field: result.field,
      proposedField: result.field,
      confidence: result.score >= 78 ? "عالية" : result.score >= 48 ? "متوسطة" : "منخفضة",
      score: result.score,
      reason: result.reason,
      sample: sample === undefined ? "—" : String(sample).slice(0, 40),
      approvalStatus: "suggested",
      dataColumn: dataColumns?.[index] ?? XLSX.utils.encode_col(index + dataColumnOffset),
      headerColumn,
      adjustedForHeaderShift: headerColumn !== (dataColumns?.[index] ?? XLSX.utils.encode_col(index + dataColumnOffset)),
    };
  });
}

function normalizeEditorConfig(matrix: DataValue[][], requested?: Partial<SheetEditorConfig>): SheetEditorConfig {
  const manualRows = (requested?.manualRows ?? []).flatMap((row, index) => {
    const id = String(row?.id ?? `manual-row-${index + 1}`).trim().slice(0, 80);
    return id ? [{ id }] : [];
  }).slice(0, 50);
  const maxRow = Math.max(matrix.length + manualRows.length - 1, 0);
  const sourceColumnCount = Math.max(matrix.reduce((max, row) => Math.max(max, row.length), 0), 1);
  const manualColumns = (requested?.manualColumns ?? []).flatMap((column, index) => {
    const id = String(column?.id ?? `manual-${index + 1}`).trim().slice(0, 80);
    const title = String(column?.title ?? "عمود محلي").trim().slice(0, 120);
    return id && title ? [{ id, title }] : [];
  }).slice(0, 12);
  const maxColumn = sourceColumnCount + manualColumns.length - 1;
  const headerRowIndex = Math.min(Math.max(Math.trunc(requested?.headerRowIndex ?? getHeaderRow(matrix)), 0), maxRow);
  const dataStartRowIndex = Math.min(Math.max(Math.trunc(requested?.dataStartRowIndex ?? headerRowIndex + 1), headerRowIndex + 1), matrix.length);
  const firstDataColumnIndex = Math.min(Math.max(Math.trunc(requested?.firstDataColumnIndex ?? 0), 0), maxColumn);
  const lastDataRowIndex = Math.min(Math.max(Math.trunc(requested?.lastDataRowIndex ?? maxRow), dataStartRowIndex), maxRow);
  const lastDataColumnIndex = Math.min(Math.max(Math.trunc(requested?.lastDataColumnIndex ?? maxColumn), firstDataColumnIndex), maxColumn);
  const excludedRowNumbers = Array.from(new Set((requested?.excludedRowNumbers ?? [])
    .map((item) => Math.trunc(item))
    .filter((item) => item > dataStartRowIndex && item <= lastDataRowIndex + 1))).sort((a, b) => a - b);
  const textTransforms = (requested?.textTransforms ?? []).flatMap((transform, index): SheetTextTransform[] => {
    const id = String(transform?.id ?? `transform-${index + 1}`).trim();
    const target = String(transform?.target ?? "").trim().slice(0, 80);
    const separator = String(transform?.separator ?? " ").slice(0, 20);
    if (!id || !target) return [];
    if (transform.type === "merge") {
      const sources = Array.from(new Set((transform.sources ?? []).map((source) => String(source).trim()).filter(Boolean))).slice(0, 6);
      return sources.length >= 2 ? [{ id, type: "merge", sources, target, separator }] : [];
    }
    const source = String(transform.source ?? "").trim();
    const parts = Math.min(6, Math.max(2, Math.trunc(transform.parts ?? 2)));
    return source ? [{ id, type: "split", source, target, separator, parts }] : [];
  });
  const headerOverrides = Object.entries(requested?.headerOverrides ?? {}).reduce<Record<number, string>>((next, [column, value]) => {
    const columnIndex = Number(column);
    const title = String(value ?? "").trim().slice(0, 120);
    if (Number.isInteger(columnIndex) && columnIndex >= 0 && columnIndex <= maxColumn && title) next[columnIndex] = title;
    return next;
  }, {});
  const cellOverrides = Object.entries(requested?.cellOverrides ?? {}).reduce<Record<string, DataValue>>((next, [key, value]) => {
    const match = /^(\d+):(\d+)$/.exec(key);
    if (!match) return next;
    const rowIndex = Number(match[1]);
    const columnIndex = Number(match[2]);
    if (rowIndex >= dataStartRowIndex && rowIndex <= lastDataRowIndex && columnIndex >= firstDataColumnIndex && columnIndex <= lastDataColumnIndex) next[key] = value;
    return next;
  }, {});
  const ignoredColumnIndexes = Array.from(new Set((requested?.ignoredColumnIndexes ?? [])
    .map((item) => Math.trunc(item))
    .filter((item) => item >= firstDataColumnIndex && item <= lastDataColumnIndex))).sort((a, b) => a - b);
  return { headerRowIndex, dataStartRowIndex, firstDataColumnIndex, lastDataRowIndex, lastDataColumnIndex, excludedRowNumbers, textTransforms, headerOverrides, cellOverrides, ignoredColumnIndexes, manualColumns, manualRows, updatedAt: requested?.updatedAt };
}

/** يبني سطح معاينة قابلًا للتحرير؛ تظل مصفوفة Excel الأصلية محفوظة بلا تغيير. */
function buildEditablePreviewMatrix(matrix: DataValue[][], editorConfig: SheetEditorConfig): DataValue[][] {
  const sourceColumnCount = Math.max(matrix.reduce((max, row) => Math.max(max, row.length), 0), 1);
  const preview = matrix.map((row) => [...row, ...editorConfig.manualColumns.map(() => null)]);
  editorConfig.manualRows.forEach(() => preview.push(Array.from({ length: sourceColumnCount + editorConfig.manualColumns.length }, () => null)));
  preview[editorConfig.headerRowIndex] ??= [];
  editorConfig.manualColumns.forEach((column, index) => {
    preview[editorConfig.headerRowIndex][sourceColumnCount + index] = column.title;
  });
  Object.entries(editorConfig.headerOverrides).forEach(([column, value]) => {
    const columnIndex = Number(column);
    preview[editorConfig.headerRowIndex] ??= [];
    preview[editorConfig.headerRowIndex][columnIndex] = value;
  });
  Object.entries(editorConfig.cellOverrides).forEach(([key, value]) => {
    const [rowIndex, columnIndex] = key.split(":").map(Number);
    preview[rowIndex] ??= [];
    preview[rowIndex][columnIndex] = value;
  });
  return preview;
}

function splitTargetName(target: string, index: number) {
  return `${target} ${index + 1}`;
}

function editorTransformMappings(transforms: SheetTextTransform[]): ColumnMapping[] {
  return transforms.flatMap((transform) => {
    const sourceColumns = transform.type === "merge"
      ? [transform.target]
      : Array.from({ length: transform.parts }, (_, index) => splitTargetName(transform.target, index));
    return sourceColumns.map((sourceColumn) => ({
      sourceColumn,
      field: "unknown" as const,
      proposedField: "unknown" as const,
      confidence: "منخفضة" as const,
      score: 0,
      reason: transform.type === "merge"
        ? `عمود نصي ناتج من دمج: ${transform.sources.join(" + ")}.`
        : `عمود نصي ناتج من تقسيم «${transform.source}» بالفاصل المحدد.` ,
      sample: "—",
      approvalStatus: "suggested" as const,
    }));
  });
}

function applyTextTransforms(record: RawRecord, transforms: SheetTextTransform[]): RawRecord {
  return transforms.reduce<RawRecord>((next, transform) => {
    if (transform.type === "merge") {
      next[transform.target] = transform.sources.map((source) => valueToText(next[source])).filter(Boolean).join(transform.separator);
      return next;
    }
    const sourceText = valueToText(next[transform.source]);
    const parts = transform.separator ? sourceText.split(transform.separator) : Array.from(sourceText);
    Array.from({ length: transform.parts }, (_, index) => {
      next[splitTargetName(transform.target, index)] = parts[index]?.trim() ?? "";
    });
    return next;
  }, { ...record });
}

function valueToText(value: DataValue): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function offsetColumn(column: string | undefined, offset: number): string | undefined {
  if (!column) return column;
  const base = column.toUpperCase().split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  return XLSX.utils.encode_col(base + offset);
}

/**
 * بعض إصدارات برنامج الصيدلية تضع رأس الجدول مزاحًا خانة إلى اليمين:
 * تبدأ القيم تحت «إجمالي س.بيع» بينما يظهر «الموظف» في عمود فارغ آخر الصف.
 * لا يعمل التصحيح إلا عند تحقق علامات الرأس والقيم معًا.
 */
function hasLeadingHeaderShift(headers: string[], dataRows: unknown[][]): boolean {
  if (headers.length < 4 || dataRows.length < 2) return false;
  if (scoreMapping(headers[0]).field !== "employee" || scoreMapping(headers[1]).field !== "sales_total") return false;
  const sample = dataRows.slice(0, Math.min(20, dataRows.length));
  const numericAtStart = sample.filter((row) => toNumber(row[0] as DataValue) !== undefined).length;
  const blankAtEnd = sample.filter((row) => row[headers.length - 1] === null || row[headers.length - 1] === undefined || String(row[headers.length - 1]).trim() === "").length;
  return numericAtStart / sample.length >= 0.8 && blankAtEnd / sample.length >= 0.8;
}

function looksLikeTotalRow(record: RawRecord): boolean {
  const values = Object.values(record).map((value) => normalizeText(value)).join(" ");
  return /(اجمالي|المجموع|total|grand total|subtotal)/.test(values);
}

function calculateMetrics(record: RawRecord, mapsByField: Partial<Record<CanonicalField, string>>): CleanRecord["__metrics"] {
  const get = (field: CanonicalField) => record[mapsByField[field] ?? ""];
  const quantity = toNumber(get("quantity_sold")) ?? toNumber(get("sales_quantity"));
  const directSales = toNumber(get("sales_total"));
  const externalSalePrice = toNumber(record.__priceFilePublic);
  const externalCostPrice = toNumber(record.__priceFilePurchase);
  const salePrice = toNumber(get("sale_price")) ?? externalSalePrice;
  const sales = directSales ?? (salePrice !== undefined && quantity !== undefined ? salePrice * quantity : undefined);
  const directCost = toNumber(get("total_cost"));
  const costPrice = toNumber(get("cost_price")) ?? externalCostPrice;
  const cost = directCost ?? (costPrice !== undefined && quantity !== undefined ? costPrice * quantity : undefined);
  const directProfit = toNumber(get("profit"));
  const profit = directProfit ?? (sales !== undefined && cost !== undefined ? sales - cost : undefined);
  const directMargin = toNumber(get("profit_margin"));
  const unitSalePrice = salePrice ?? (sales !== undefined && quantity !== undefined && quantity > 0 ? sales / quantity : undefined);
  const unitCost = costPrice ?? (cost !== undefined && quantity !== undefined && quantity > 0 ? cost / quantity : undefined);
  const profitMargin = directMargin ?? (profit !== undefined && sales !== undefined && sales > 0 ? (profit / sales) * 100 : undefined);
  const discount = toNumber(get("discount_value"));
  const date = toDate(get("sale_date")) ?? toDate(get("expense_date")) ?? toDate(get("transaction_date"));
  return { sales, quantity, cost, profit, unitSalePrice, unitCost, profitMargin, discount, date, priceSource: externalSalePrice !== undefined || externalCostPrice !== undefined ? "price_file" : undefined };
}

/**
 * مدخلات حقول التحرير في المتصفح نصية دائمًا. عند تسمية المدير للعمود باسم
 * حقل رقمي، تُطبَّع القيمة القابلة للقراءة في نسخة السجل المصححة فقط. أما
 * القيمة غير القابلة للتحويل فتظل كما كتبها المدير حتى تظهر ضمن تقرير الجودة.
 */
function coerceEditedNumericValues(record: RawRecord, mappings: ColumnMapping[]): RawRecord {
  return mappings.reduce<RawRecord>((next, mapping) => {
    if (mapping.field === "unknown" || FIELD_DEFINITIONS[mapping.field].kind !== "number") return next;
    const value = next[mapping.sourceColumn];
    if (value === "" || value === null || value === undefined) return next;
    const numericValue = toNumber(value);
    if (numericValue !== undefined) next[mapping.sourceColumn] = numericValue;
    return next;
  }, { ...record });
}

/** تحفظ الجلسات القديمة التي لا تحمل حالة اعتماد، أما الفحوص الجديدة فلا تمرر إلا ما اعتمده المدير صراحة. */
function approvedFieldMap(mappings: ColumnMapping[]): Partial<Record<CanonicalField, string>> {
  return mappings.reduce((acc, mapping) => {
    const approved = mapping.approvalStatus === undefined || mapping.approvalStatus === "approved" || mapping.approvalStatus === "overridden";
    const field = mapping.field;
    if (!approved || field === "unknown") return acc;
    if (!acc[field] || mapping.score > (mappings.find((item) => item.sourceColumn === acc[field])?.score ?? 0)) acc[field] = mapping.sourceColumn;
    return acc;
  }, {} as Partial<Record<CanonicalField, string>>);
}

/**
 * الجلسات المحلية قد تكون حُفظت بإصدار سابق من المحرك. لا تُستخدم مؤشرات
 * الربح أو الهامش المحفوظة معها عند الاستعادة؛ تُحسب من الأعمدة الفعلية
 * ومطابقة المصدر الحالية حتى لا تبقى قيمة قديمة أو افتراضية في القرار.
 */
export function refreshImportedInspection(inspection: ImportInspection): ImportInspection {
  return {
    ...inspection,
    detectedAt: inspection.detectedAt instanceof Date ? inspection.detectedAt : new Date(inspection.detectedAt),
    sheets: inspection.sheets.map((sheet) => {
      const mapsByField = approvedFieldMap(sheet.mappings);
      const cleanRecords = sheet.cleanRecords.map((savedRecord, index) => {
        const { __metrics: _savedMetrics, __rowIndex, __sheetName: _savedSheetName, ...raw } = savedRecord;
        const record = raw as RawRecord;
        return {
          ...record,
          __rowIndex: typeof __rowIndex === "number" ? __rowIndex : sheet.headerRowIndex + 2 + index,
          __sheetName: sheet.name,
          __metrics: calculateMetrics(record, mapsByField),
        };
      });
      return { ...sheet, cleanRecords };
    }),
  };
}

function inspectSheet(name: string, matrix: DataValue[][], requestedEditorConfig?: Partial<SheetEditorConfig>): SheetInspection {
  const editorConfig = normalizeEditorConfig(matrix, requestedEditorConfig);
  const previewMatrix = buildEditablePreviewMatrix(matrix, editorConfig);
  const { headerRowIndex, dataStartRowIndex, firstDataColumnIndex, lastDataRowIndex, lastDataColumnIndex } = editorConfig;
  const rawHeaders = (previewMatrix[headerRowIndex] ?? []).slice(firstDataColumnIndex, lastDataColumnIndex + 1).map((value, index) => String(value ?? `عمود ${firstDataColumnIndex + index + 1}`).trim() || `عمود ${firstDataColumnIndex + index + 1}`);
  const dataRowEntries = previewMatrix.slice(dataStartRowIndex, lastDataRowIndex + 1).map((row, index) => ({ row: row.slice(firstDataColumnIndex, lastDataColumnIndex + 1), rowNumber: dataStartRowIndex + index + 1 }))
    .filter((item) => !editorConfig.excludedRowNumbers.includes(item.rowNumber))
    .filter((item) => item.row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""));
  const dataRows = dataRowEntries.map((item) => item.row);
  const headerWasShifted = hasLeadingHeaderShift(rawHeaders, dataRows);
  const headerDataOffset = headerWasShifted ? 1 : 0;
  const codeHeaderIndex = headerWasShifted ? rawHeaders.findIndex((header) => scoreMapping(header).field === "item_code") : -1;
  const headerEntries = (headerWasShifted
    ? (codeHeaderIndex >= 1 ? rawHeaders.slice(1, codeHeaderIndex + 1) : rawHeaders.slice(1)).map((title, index) => ({ title, headerIndex: firstDataColumnIndex + index + 1, dataIndex: firstDataColumnIndex + index }))
    : rawHeaders.map((title, index) => ({ title, headerIndex: firstDataColumnIndex + index, dataIndex: firstDataColumnIndex + index })))
    .filter((entry) => !editorConfig.ignoredColumnIndexes.includes(entry.dataIndex));
  // قرار المدير: «الموظف» رأس زائد في A وليس عمود بيانات.
  // كل عنوان تالٍ يصف قيم العمود الذي يسبقه؛ لذلك تبقى قيم A محفوظة وتُسمى «إجمالي البيع».
  // تنتهي الخريطة عند «الكود» (I ← H) ولا تدخل قيم I الفارغة في التحليل.
  const headers = headerEntries.map((entry) => entry.title);
  const headerColumns = headerEntries.map((entry) => XLSX.utils.encode_col(entry.headerIndex));
  const dataColumns = headerEntries.map((entry) => XLSX.utils.encode_col(entry.dataIndex));
  const readableRows = dataRows.map((row) => headerEntries.map((entry) => row[entry.dataIndex - firstDataColumnIndex]));
  const excludedColumns = (headerWasShifted
    ? (codeHeaderIndex >= 1 ? rawHeaders.slice(1, codeHeaderIndex + 1) : rawHeaders.slice(1)).map((title, index) => ({ title, dataIndex: firstDataColumnIndex + index }))
    : rawHeaders.map((title, index) => ({ title, dataIndex: firstDataColumnIndex + index })))
    .filter((entry) => editorConfig.ignoredColumnIndexes.includes(entry.dataIndex))
    .map((entry) => ({ dataColumn: XLSX.utils.encode_col(entry.dataIndex), sourceColumn: entry.title, reason: "قرار المدير: استبعاد العمود من القراءة والتحليل في النسخة المحلية." }));
  const removedHeaders = headerWasShifted
    ? [{
        headerColumn: "A",
        title: rawHeaders[0] ?? "الموظف",
        reason: "قرار المدير: إزالة رأس «الموظف» الوهمي فقط. قيم العمود A محفوظة وتُفسر بعنوان B «إجمالي البيع».",
      }]
    : [];
  const suggestedMappings = mapColumns(headers, readableRows, headerColumns, firstDataColumnIndex, dataColumns).map((mapping) => {
    const headerLetter = mapping.headerColumn ?? mapping.dataColumn;
    const headerIndex = headerLetter ? XLSX.utils.decode_col(headerLetter) : -1;
    const hasManagerHeader = headerIndex >= 0 && Boolean(editorConfig.headerOverrides[headerIndex]?.trim());
    if (!hasManagerHeader || mapping.field === "unknown") return mapping;
    return {
      ...mapping,
      confidence: "عالية" as const,
      score: 100,
      approvalStatus: "overridden" as const,
      reason: "تسمية مدير الصيدلية في صف العناوين العلوي",
    };
  });
  const mappings = (headerWasShifted
    ? suggestedMappings.map((mapping) => mapping.headerColumn
      ? {
          ...mapping,
          reason: `قاعدة الانزياح المعتمدة: عنوان ${mapping.headerColumn} «${mapping.sourceColumn}» يصف قيم العمود ${mapping.dataColumn}، وليس قيم العمود الذي تحته.`,
        }
      : mapping)
    : suggestedMappings).concat(editorTransformMappings(editorConfig.textTransforms));
  const mapsByField = approvedFieldMap(mappings);

  const rawRecordEntries = dataRowEntries.map(({ rowNumber }, rowIndex) => ({
    rowNumber,
    record: applyTextTransforms(headers.reduce<RawRecord>((record, header, index) => {
      record[header] = readableRows[rowIndex]?.[index] as DataValue;
      return record;
    }, {}), editorConfig.textTransforms),
  }));
  const rawRecords = rawRecordEntries.map((item) => item.record);
  const totalRows = rawRecords.length;
  const totalRowsDetected = rawRecordEntries.filter((item) => looksLikeTotalRow(item.record));
  const candidateRecords = rawRecordEntries.filter((item) => !looksLikeTotalRow(item.record));
  const cleanRecords = candidateRecords
    .filter((item) => Object.values(item.record).some((value) => value !== null && value !== undefined && String(value).trim() !== ""))
    .map<CleanRecord>(({ record, rowNumber }) => {
      const coercedRecord = coerceEditedNumericValues(record, mappings);
      return { ...coercedRecord, __rowIndex: rowNumber, __sheetName: name, __metrics: calculateMetrics(coercedRecord, mapsByField) };
    });

  const criticalFields = ["item_name", "sales_total", "quantity_sold", "sale_date"] as CanonicalField[];
  const emptyCriticalCells = criticalFields.reduce((count, field) => {
    const column = mapsByField[field];
    return count + (column ? cleanRecords.filter((record) => !String(record[column] ?? "").trim()).length : 0);
  }, 0);
  const numericMappings = mappings.filter((mapping) => mapping.field !== "unknown" && FIELD_DEFINITIONS[mapping.field].kind === "number");
  const invalidNumericValues = numericMappings.reduce((count, mapping) => count + cleanRecords.filter((record) => record[mapping.sourceColumn] !== "" && record[mapping.sourceColumn] !== null && record[mapping.sourceColumn] !== undefined && toNumber(record[mapping.sourceColumn]) === undefined).length, 0);
  const dateMappings = mappings.filter((mapping) => mapping.field !== "unknown" && FIELD_DEFINITIONS[mapping.field].kind === "date");
  const invalidDates = dateMappings.reduce((count, mapping) => count + cleanRecords.filter((record) => record[mapping.sourceColumn] !== "" && record[mapping.sourceColumn] !== null && record[mapping.sourceColumn] !== undefined && !toDate(record[mapping.sourceColumn])).length, 0);
  const nonNegativeFields = ["sales_total", "sale_price", "total_cost", "cost_price", "quantity_sold", "stock_quantity", "expense_amount", "amount"] as CanonicalField[];
  const negativeValues = nonNegativeFields.reduce((count, field) => {
    const column = mapsByField[field];
    return count + (column ? cleanRecords.filter((record) => (toNumber(record[column]) ?? 0) < 0).length : 0);
  }, 0);
  const dedupeKeyFields = [mapsByField.invoice_number, mapsByField.item_code, mapsByField.sale_date].filter(Boolean) as string[];
  const seen = new Set<string>();
  let duplicates = 0;
  if (dedupeKeyFields.length) {
    cleanRecords.forEach((record) => {
      const key = dedupeKeyFields.map((field) => String(record[field] ?? "").trim()).join("|");
      if (key && key !== "|".repeat(dedupeKeyFields.length - 1)) {
        if (seen.has(key)) duplicates += 1;
        seen.add(key);
      }
    });
  }
  const denominator = Math.max(cleanRecords.length, 1);
  const penalty = Math.min(70, (emptyCriticalCells / denominator) * 20 + (invalidNumericValues / denominator) * 15 + (invalidDates / denominator) * 20 + (negativeValues / denominator) * 8 + (duplicates / denominator) * 12 + (totalRowsDetected.length / Math.max(totalRows, 1)) * 10);
  const issues: QualityIssue[] = [];
  if (totalRowsDetected.length) issues.push({ type: "صف إجمالي", count: totalRowsDetected.length, detail: "تم استبعاد صفوف الإجمالي من التحليل حتى لا تتكرر القيم.", severity: "low" });
  if (editorConfig.excludedRowNumbers.length) issues.push({ type: "صف مستبعد بقرار المدير", count: editorConfig.excludedRowNumbers.length, detail: "صفوف اختار المدير تجاهلها في محرر الشيت قبل التحليل.", severity: "low" });
  if (emptyCriticalCells) issues.push({ type: "مفقود", count: emptyCriticalCells, detail: "خلايا أساسية فارغة في الأعمدة المتاحة.", severity: emptyCriticalCells / denominator > 0.15 ? "high" : "medium" });
  if (invalidNumericValues) issues.push({ type: "غير رقمي", count: invalidNumericValues, detail: "قيم لا يمكن تحويلها إلى أرقام في حقول رقمية.", severity: "medium" });
  if (invalidDates) issues.push({ type: "تاريخ غير صالح", count: invalidDates, detail: "قيم تاريخ غير مقروءة في الحقول المعروفة كتاريخ.", severity: "medium" });
  if (negativeValues) issues.push({ type: "قيمة سالبة", count: negativeValues, detail: "قيم سالبة بحاجة لمراجعة قبل اعتبارها مبيعات أو تكلفة.", severity: "medium" });
  if (duplicates) issues.push({ type: "تكرار", count: duplicates, detail: "سجلات يحتمل تكرارها بناءً على مفاتيح التقرير المتاحة.", severity: "medium" });

  const quality: QualityReport = {
    score: Math.max(30, Math.round(100 - penalty)),
    validRecords: cleanRecords.length,
    excludedRecords: totalRowsDetected.length + editorConfig.excludedRowNumbers.length,
    emptyCriticalCells,
    invalidNumericValues,
    invalidDates,
    negativeValues,
    duplicates,
    totalRows,
    issues,
    recognizedFields: mappings.filter((mapping) => mapping.field !== "unknown").map((mapping) => mapping.field as CanonicalField),
    unknownColumns: mappings.filter((mapping) => mapping.field === "unknown").map((mapping) => mapping.sourceColumn),
  };
  return {
    name,
    rows: matrix.length,
    columns: Math.max(...matrix.map((row) => row.length), 0),
    headerRowIndex,
    headerDataOffset,
    layoutNote: headerWasShifted
      ? "قرار المدير المثبت: إزالة رأس A «الموظف» الوهمي فقط، وليس بيانات A. بعده تُرحّل العناوين هكذا: عنوان B «إجمالي البيع» يصف قيم A، عنوان C «الرصيد» يصف B، عنوان D «الوحدة» يصف C، عنوان E «الكمية» يصف D، عنوان F «المنشأ» يصف E، عنوان G «الشركة» يصف F، عنوان H «الاسم» يصف G، وعنوان I «الكود» يصف قيم H. لا تدخل قيم I الفارغة في الخريطة أو التحليل."
      : undefined,
    excludedColumns,
    removedHeaders: removedHeaders.map((header) => ({ ...header, headerColumn: offsetColumn(header.headerColumn, firstDataColumnIndex) ?? header.headerColumn })),
    headers,
    mappings,
    rawRecords,
    cleanRecords,
    excludedRows: totalRowsDetected.length + editorConfig.excludedRowNumbers.length,
    quality,
    preview: rawRecords.slice(0, 10),
    sourceMatrix: matrix,
    editorConfig,
  };
}

/** يعيد بناء شيت واحد من المصدر الذي قرئ محليًا وفق قرارات المدير، من دون تعديل ملف Excel أو تطبيق موافقات ضمنية. */
export function applySheetEditorConfig(inspection: ImportInspection, sheetName: string, requested: Partial<SheetEditorConfig>): ImportInspection {
  return {
    ...inspection,
    sheets: inspection.sheets.map((sheet) => {
      if (sheet.name !== sheetName || !sheet.sourceMatrix?.length) return sheet;
      return inspectSheet(sheet.name, sheet.sourceMatrix, { ...sheet.editorConfig, ...requested, updatedAt: new Date().toISOString() });
    }),
  };
}

export async function inspectPharmacyFile(file: File): Promise<ImportInspection> {
  assertSpreadsheetFileSafety(file);
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  assertWorkbookSafety(workbook);
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<DataValue[]>(sheet, { header: 1, defval: null, raw: true });
    return inspectSheet(name, matrix);
  });
  const text = `${file.name}|${file.size}|${file.lastModified}|${sheets.map((sheet) => `${sheet.name}:${sheet.rows}:${sheet.columns}`).join(";")}`;
  let fileFingerprint = "";
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    fileFingerprint = Array.from(new Uint8Array(hash)).map((item) => item.toString(16).padStart(2, "0")).join("").slice(0, 24);
  } else fileFingerprint = btoa(text).slice(0, 24);
  return { fileName: file.name, fileType: file.type || file.name.split(".").pop() || "unknown", fileSize: file.size, sheets, fileFingerprint, detectedAt: new Date() };
}

export function formatEGP(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "غير متاح";
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 2 }).format(value);
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "غير متاح";
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(value);
}
