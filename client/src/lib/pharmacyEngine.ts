/**
 * Design philosophy — نبض العيادة التنفيذي:
 * هذا المحرك لا يفترض ترتيب الأعمدة؛ يقرأ مصدر الصيدلية كما هو،
 * ويعطي درجة ثقة واضحة لكل حقل قبل أن يُستخدم في أي قرار إداري.
 */
import * as XLSX from "xlsx";

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
  confidence: "عالية" | "متوسطة" | "منخفضة";
  score: number;
  reason: string;
  sample: string;
  dataColumn?: string;
  headerColumn?: string;
  adjustedForHeaderShift?: boolean;
}

export interface SheetInspection {
  name: string;
  rows: number;
  columns: number;
  headerRowIndex: number;
  headerDataOffset: number;
  layoutNote?: string;
  headers: string[];
  mappings: ColumnMapping[];
  rawRecords: RawRecord[];
  cleanRecords: CleanRecord[];
  excludedRows: number;
  quality: QualityReport;
  preview: RawRecord[];
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
  type: "مفقود" | "غير رقمي" | "تاريخ غير صالح" | "قيمة سالبة" | "تكرار" | "صف إجمالي";
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

function mapColumns(headers: string[], rawRows: unknown[][], headerDataOffset = 0): ColumnMapping[] {
  return headers.map((header, index) => {
    const result = scoreMapping(header);
    const sample = rawRows.slice(0, 5).map((row) => row[index]).find((value) => value !== undefined && value !== null && value !== "");
    return {
      sourceColumn: header,
      field: result.field,
      confidence: result.score >= 78 ? "عالية" : result.score >= 48 ? "متوسطة" : "منخفضة",
      score: result.score,
      reason: result.reason,
      sample: sample === undefined ? "—" : String(sample).slice(0, 40),
      dataColumn: XLSX.utils.encode_col(index),
      headerColumn: XLSX.utils.encode_col(index + headerDataOffset),
      adjustedForHeaderShift: headerDataOffset !== 0,
    };
  });
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
 * الجلسات المحلية قد تكون حُفظت بإصدار سابق من المحرك. لا تُستخدم مؤشرات
 * الربح أو الهامش المحفوظة معها عند الاستعادة؛ تُحسب من الأعمدة الفعلية
 * ومطابقة المصدر الحالية حتى لا تبقى قيمة قديمة أو افتراضية في القرار.
 */
export function refreshImportedInspection(inspection: ImportInspection): ImportInspection {
  return {
    ...inspection,
    detectedAt: inspection.detectedAt instanceof Date ? inspection.detectedAt : new Date(inspection.detectedAt),
    sheets: inspection.sheets.map((sheet) => {
      const mapsByField = sheet.mappings.reduce((acc, mapping) => {
        const field = mapping.field;
        if (field === "unknown") return acc;
        if (!acc[field] || mapping.score > (sheet.mappings.find((item) => item.sourceColumn === acc[field])?.score ?? 0)) acc[field] = mapping.sourceColumn;
        return acc;
      }, {} as Partial<Record<CanonicalField, string>>);
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

function inspectSheet(name: string, matrix: unknown[][]): SheetInspection {
  const headerRowIndex = getHeaderRow(matrix);
  const rawHeaders = (matrix[headerRowIndex] ?? []).map((value, index) => String(value ?? `عمود ${index + 1}`).trim() || `عمود ${index + 1}`);
  const dataRows = matrix.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== ""));
  const headerWasShifted = hasLeadingHeaderShift(rawHeaders, dataRows);
  const headerDataOffset = headerWasShifted ? 1 : 0;
  const headers = headerWasShifted
    ? [...rawHeaders.slice(1), `${rawHeaders[0]} (غير مستخدم)`]
    : rawHeaders;
  const mappings = mapColumns(headers, dataRows, headerDataOffset);
  const mapsByField = mappings.reduce((acc, mapping) => {
    const detectedField = mapping.field;
    if (detectedField !== "unknown" && (!acc[detectedField] || mapping.score > (mappings.find((item) => item.sourceColumn === acc[detectedField])?.score ?? 0))) acc[detectedField] = mapping.sourceColumn;
    return acc;
  }, {} as Partial<Record<CanonicalField, string>>);

  const rawRecords = dataRows.map((row) => headers.reduce<RawRecord>((record, header, index) => {
    record[header] = row[index] as DataValue;
    return record;
  }, {}));
  const totalRows = rawRecords.length;
  const totalRowsDetected = rawRecords.filter(looksLikeTotalRow);
  const candidateRecords = rawRecords.filter((record) => !looksLikeTotalRow(record));
  const cleanRecords = candidateRecords
    .filter((record) => Object.values(record).some((value) => value !== null && value !== undefined && String(value).trim() !== ""))
    .map<CleanRecord>((record, index) => ({ ...record, __rowIndex: headerRowIndex + 2 + index, __sheetName: name, __metrics: calculateMetrics(record, mapsByField) }));

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
  if (emptyCriticalCells) issues.push({ type: "مفقود", count: emptyCriticalCells, detail: "خلايا أساسية فارغة في الأعمدة المتاحة.", severity: emptyCriticalCells / denominator > 0.15 ? "high" : "medium" });
  if (invalidNumericValues) issues.push({ type: "غير رقمي", count: invalidNumericValues, detail: "قيم لا يمكن تحويلها إلى أرقام في حقول رقمية.", severity: "medium" });
  if (invalidDates) issues.push({ type: "تاريخ غير صالح", count: invalidDates, detail: "قيم تاريخ غير مقروءة في الحقول المعروفة كتاريخ.", severity: "medium" });
  if (negativeValues) issues.push({ type: "قيمة سالبة", count: negativeValues, detail: "قيم سالبة بحاجة لمراجعة قبل اعتبارها مبيعات أو تكلفة.", severity: "medium" });
  if (duplicates) issues.push({ type: "تكرار", count: duplicates, detail: "سجلات يحتمل تكرارها بناءً على مفاتيح التقرير المتاحة.", severity: "medium" });

  const quality: QualityReport = {
    score: Math.max(30, Math.round(100 - penalty)),
    validRecords: cleanRecords.length,
    excludedRecords: totalRowsDetected.length,
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
    columns: headers.length,
    headerRowIndex,
    headerDataOffset,
    layoutNote: headerWasShifted ? "تم التحقق من أن عناوين هذا التصدير مزاحة خانة إلى اليمين؛ لذلك رُبطت القيم بالأعمدة الفعلية المقابلة لها." : undefined,
    headers,
    mappings,
    rawRecords,
    cleanRecords,
    excludedRows: totalRowsDetected.length,
    quality,
    preview: rawRecords.slice(0, 10),
  };
}

export async function inspectPharmacyFile(file: File): Promise<ImportInspection> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
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
