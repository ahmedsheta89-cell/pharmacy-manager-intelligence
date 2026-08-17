/**
 * Design philosophy — نبض العيادة التنفيذي:
 * كل توصية في هذا الملف تحمل دليلها العددي. لا توجد افتراضات أو قيم تقديرية
 * عندما تكون البيانات المطلوبة غير موجودة في تقرير الصيدلية.
 */
import type { CanonicalField, CleanRecord, ColumnMapping, SheetInspection } from "./pharmacyEngine";

export type Availability = "available" | "partial" | "unavailable";
export type Confidence = "عالية" | "متوسطة" | "غير متاح";
export type AlertLevel = "urgent" | "review" | "watch" | "positive";
export type MetricSource = "فعلي" | "محسوب" | "غير متاح";

export interface Metric<T> {
  value?: T;
  availability: Availability;
  confidence: Confidence;
  source: MetricSource;
  note?: string;
}

export interface ProductInsight {
  id: string;
  itemName: string;
  itemCode?: string;
  company?: string;
  category?: string;
  quantity?: number;
  sales?: number;
  cost?: number;
  profit?: number;
  margin?: number;
  salesShare?: number;
  quadrant?: "A" | "B" | "C" | "D";
}

export interface CompanyInsight {
  company: string;
  items: number;
  quantity?: number;
  sales?: number;
  cost?: number;
  profit?: number;
  margin?: number;
}

export interface TrendPoint {
  label: string;
  sales?: number;
  profit?: number;
  expenses?: number;
}

export interface ManagerAlert {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  evidence: string;
  action: string;
  relatedProduct?: string;
}

export interface ExecutiveSummary {
  headline: string;
  paragraphs: string[];
  positives: string[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

export interface DashboardAnalytics {
  sourceSheet: string;
  totalRows: number;
  dateRange?: { from: Date; to: Date };
  metrics: {
    sales: Metric<number>;
    cost: Metric<number>;
    grossProfit: Metric<number>;
    grossMargin: Metric<number>;
    items: Metric<number>;
    soldItems: Metric<number>;
    invoices: Metric<number>;
    averageInvoice: Metric<number>;
    discount: Metric<number>;
    expenses: Metric<number>;
    netProfit: Metric<number>;
  };
  products: ProductInsight[];
  companies: CompanyInsight[];
  trends: TrendPoint[];
  alerts: ManagerAlert[];
  focusItems: ManagerAlert[];
  summary: ExecutiveSummary;
  productQuadrants: Record<"A" | "B" | "C" | "D", ProductInsight[]>;
  availability: Record<string, Confidence>;
}

export interface DashboardFilters {
  from?: Date;
  to?: Date;
  company?: string;
  item?: string;
  category?: string;
  employee?: string;
  branch?: string;
}

const canonicalMap = (mappings: ColumnMapping[]): Partial<Record<CanonicalField, string>> =>
  mappings.reduce((acc, mapping) => {
    if (mapping.field !== "unknown" && mapping.confidence !== "منخفضة" && !acc[mapping.field]) acc[mapping.field] = mapping.sourceColumn;
    return acc;
  }, {} as Partial<Record<CanonicalField, string>>);

const numeric = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const transliteration: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," };
  const clean = value.replace(/[٠-٩٫٬]/g, (char) => transliteration[char] ?? char).replace(/[ج.م|EGP|£|,\s]/gi, "").replace(/\((.*)\)/, "-$1");
  const result = Number(clean);
  return Number.isFinite(result) ? result : undefined;
};

const asDate = (value: unknown): Date | undefined => {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (!value) return undefined;
  const translated = String(value).replace(/[٠-٩]/g, (char) => "0123456789"["٠١٢٣٤٥٦٧٨٩".indexOf(char)] ?? char);
  const split = translated.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (split) {
    const date = new Date(Number(split[3].length === 2 ? `20${split[3]}` : split[3]), Number(split[2]) - 1, Number(split[1]));
    if (!Number.isNaN(date.valueOf())) return date;
  }
  const date = new Date(translated);
  return Number.isNaN(date.valueOf()) ? undefined : date;
};

const fieldValue = (record: CleanRecord, map: Partial<Record<CanonicalField, string>>, field: CanonicalField): unknown => map[field] ? record[map[field] as string] : undefined;

const sum = (values: Array<number | undefined>): number => values.reduce<number>((total, value) => total + (Number.isFinite(value) ? (value as number) : 0), 0);
const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

function metricNumber(value: number | undefined, required: boolean, source: MetricSource, note?: string): Metric<number> {
  if (value === undefined || !Number.isFinite(value)) return { availability: "unavailable", confidence: "غير متاح", source: "غير متاح", note: note ?? "هذه البيانات غير متوفرة في الملف الحالي." };
  return { value, availability: required ? "available" : "partial", confidence: required ? "عالية" : "متوسطة", source, note };
}

function selectAnalysisSheet(sheets: SheetInspection[]): SheetInspection | undefined {
  const score = (sheet: SheetInspection) => {
    const fields = new Set(sheet.quality.recognizedFields);
    return sheet.cleanRecords.length + (fields.has("item_name") ? 1200 : 0) + (fields.has("sales_total") || fields.has("sale_price") ? 1100 : 0) + (fields.has("quantity_sold") || fields.has("sales_quantity") ? 350 : 0) + (fields.has("expense_amount") ? 200 : 0);
  };
  return [...sheets].sort((a, b) => score(b) - score(a))[0];
}

function buildProductInsights(records: CleanRecord[], map: Partial<Record<CanonicalField, string>>, totals: { sales?: number; cost?: number }): ProductInsight[] {
  const group = new Map<string, ProductInsight>();
  records.forEach((record, index) => {
    const itemName = String(fieldValue(record, map, "item_name") ?? "").trim();
    const itemCode = String(fieldValue(record, map, "item_code") ?? "").trim();
    if (!itemName && !itemCode) return;
    const key = itemCode || itemName;
    const sales = record.__metrics.sales;
    const cost = record.__metrics.cost;
    const quantity = record.__metrics.quantity;
    const existing = group.get(key) ?? { id: key || `item-${index}`, itemName: itemName || "صنف بلا اسم", itemCode: itemCode || undefined, company: String(fieldValue(record, map, "company") ?? "").trim() || undefined, category: String(fieldValue(record, map, "category") ?? "").trim() || undefined, sales: 0, cost: 0, quantity: 0, profit: 0 };
    existing.sales = (existing.sales ?? 0) + (sales ?? 0);
    existing.cost = (existing.cost ?? 0) + (cost ?? 0);
    existing.quantity = (existing.quantity ?? 0) + (quantity ?? 0);
    if (record.__metrics.profit !== undefined) existing.profit = (existing.profit ?? 0) + record.__metrics.profit;
    else if (sales !== undefined && cost !== undefined) existing.profit = (existing.profit ?? 0) + (sales - cost);
    group.set(key, existing);
  });
  return Array.from(group.values()).map((item) => {
    const sales = totals.sales !== undefined ? item.sales : undefined;
    const cost = totals.cost !== undefined ? item.cost : undefined;
    const profit = sales !== undefined && cost !== undefined ? sales - cost : (item.profit || undefined);
    return { ...item, sales, cost, profit, margin: sales && profit !== undefined ? (profit / sales) * 100 : undefined, salesShare: sales && totals.sales ? (sales / totals.sales) * 100 : undefined };
  }).sort((a, b) => (b.sales ?? -Infinity) - (a.sales ?? -Infinity));
}

function buildCompanyInsights(products: ProductInsight[]): CompanyInsight[] {
  const groups = new Map<string, CompanyInsight>();
  products.forEach((product) => {
    const company = product.company || "غير مصنف";
    const existing = groups.get(company) ?? { company, items: 0, sales: 0, cost: 0, profit: 0, quantity: 0 };
    existing.items += 1;
    existing.sales = (existing.sales ?? 0) + (product.sales ?? 0);
    existing.cost = (existing.cost ?? 0) + (product.cost ?? 0);
    existing.profit = (existing.profit ?? 0) + (product.profit ?? 0);
    existing.quantity = (existing.quantity ?? 0) + (product.quantity ?? 0);
    groups.set(company, existing);
  });
  return Array.from(groups.values()).map((company) => ({ ...company, margin: company.sales && company.profit !== undefined ? (company.profit / company.sales) * 100 : undefined })).sort((a, b) => (b.sales ?? -Infinity) - (a.sales ?? -Infinity));
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(date);
}

function buildTrend(records: CleanRecord[]): TrendPoint[] {
  const byDay = new Map<string, { date: Date; sales: number; profit: number; expenses: number }>();
  records.forEach((record) => {
    const date = record.__metrics.date;
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const existing = byDay.get(key) ?? { date, sales: 0, profit: 0, expenses: 0 };
    existing.sales += record.__metrics.sales ?? 0;
    existing.profit += record.__metrics.profit ?? (record.__metrics.sales !== undefined && record.__metrics.cost !== undefined ? record.__metrics.sales - record.__metrics.cost : 0);
    byDay.set(key, existing);
  });
  return Array.from(byDay.values()).sort((a, b) => a.date.valueOf() - b.date.valueOf()).slice(-28).map((point) => ({ label: dateLabel(point.date), sales: point.sales || undefined, profit: point.profit || undefined, expenses: point.expenses || undefined }));
}

function classifyQuadrants(products: ProductInsight[]): Record<"A" | "B" | "C" | "D", ProductInsight[]> {
  const salesValues = products.map((product) => product.sales).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  const margins = products.map((product) => product.margin).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  const median = (list: number[]) => list.length ? list[Math.floor(list.length / 2)] : 0;
  const salesCutoff = median(salesValues);
  const marginCutoff = median(margins);
  const quadrants: Record<"A" | "B" | "C" | "D", ProductInsight[]> = { A: [], B: [], C: [], D: [] };
  products.forEach((product) => {
    if (product.sales === undefined || product.margin === undefined) return;
    const quadrant = product.sales >= salesCutoff ? product.margin >= marginCutoff ? "A" : "B" : product.margin >= marginCutoff ? "C" : "D";
    product.quadrant = quadrant;
    quadrants[quadrant].push(product);
  });
  return quadrants;
}

function detectAlerts(input: { products: ProductInsight[]; companies: CompanyInsight[]; records: CleanRecord[]; grossMargin?: number; sales?: number; profit?: number; expenses?: number }): ManagerAlert[] {
  const alerts: ManagerAlert[] = [];
  const sales = input.sales;
  const margins = input.products.map((product) => product.margin).filter((value): value is number => value !== undefined);
  const averageMargin = margins.length ? sum(margins) / margins.length : undefined;
  const salesValues = input.products.map((product) => product.sales).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  const highSalesFloor = salesValues.length ? salesValues[Math.max(0, Math.floor(salesValues.length * 0.75) - 1)] : undefined;

  if (averageMargin !== undefined && highSalesFloor !== undefined) {
    input.products.filter((product) => (product.sales ?? 0) >= highSalesFloor && product.margin !== undefined && product.margin < averageMargin * 0.65).slice(0, 8).forEach((product) => {
      alerts.push({
        id: `margin-${product.id}`,
        level: product.margin! < averageMargin * 0.4 ? "urgent" : "review",
        title: `${product.itemName}: مبيعات قوية وهامش منخفض`,
        detail: `هامش ربح الصنف ${product.margin!.toFixed(1)}% رغم أن مبيعاته ضمن أعلى 25% من الأصناف المتاحة.`,
        evidence: `المتوسط المرجعي لهوامش الأصناف في التقرير هو ${averageMargin.toFixed(1)}%.`,
        action: "يوصى بمراجعة سعر البيع والتكلفة والخصومات قبل اتخاذ قرار بتعديل السعر.",
        relatedProduct: product.itemName,
      });
    });
  }

  const dominantCompany = input.companies[0];
  if (dominantCompany?.sales && sales && dominantCompany.sales / sales > 0.55) {
    alerts.push({ id: "company-concentration", level: "watch", title: "تركيز مرتفع في شركة واحدة", detail: `${dominantCompany.company} تمثل ${(dominantCompany.sales / sales * 100).toFixed(1)}% من مبيعات الشركات المصنفة.`, evidence: `مبيعات الشركة ${dominantCompany.sales.toFixed(0)} ج.م من إجمالي ${sales.toFixed(0)} ج.م.`, action: "تابع استدامة التوريد وهوامش هذه الشركة، وراجع البدائل عند تغير التكلفة أو التوفر." });
  }

  const dailySales = new Map<string, number>();
  input.records.forEach((record) => {
    if (!record.__metrics.date || record.__metrics.sales === undefined) return;
    const date = record.__metrics.date;
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    dailySales.set(key, (dailySales.get(key) ?? 0) + record.__metrics.sales);
  });
  const values = Array.from(dailySales.values());
  if (values.length >= 5) {
    const average = sum(values) / values.length;
    const stdev = Math.sqrt(sum(values.map((value) => (value - average) ** 2)) / values.length);
    Array.from(dailySales.entries()).forEach(([key, value]) => {
      if (stdev > 0 && Math.abs(value - average) > stdev * 2) {
        const above = value > average;
        alerts.push({ id: `daily-${key}`, level: above ? "positive" : "watch", title: `${above ? "ارتفاع" : "انخفاض"} غير معتاد في المبيعات اليومية`, detail: `قيمة يوم ${key} بلغت ${value.toFixed(0)} ج.م مقارنة بمتوسط يومي ${average.toFixed(0)} ج.م.`, evidence: `الانحراف عن المتوسط تجاوز درجتين معياريتين ضمن الأيام ذات التاريخ المتاح.`, action: above ? "راجع الأصناف والفواتير التي ساهمت في الارتفاع لتحديد فرصة قابلة للتكرار." : "راجع توفر الأصناف والوردية والعروض المسجلة في هذا اليوم قبل اعتبار الانخفاض اتجاهًا مستمرًا." });
      }
    });
  }

  const highProfit = input.products.filter((product) => product.profit !== undefined).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0))[0];
  if (highProfit?.profit && highProfit.profit > 0) alerts.push({ id: `profit-star-${highProfit.id}`, level: "positive", title: `${highProfit.itemName} هو أعلى مساهم في الربح`, detail: `ساهم الصنف بربح ${highProfit.profit.toFixed(0)} ج.م خلال الفترة المستوردة.`, evidence: `تم حساب الربح من التكلفة والمبيعات المتاحتين في التقرير.`, action: "تحقق من توافر الصنف وسرعة إعادة الطلب حتى لا تُفقد هذه المساهمة." });

  return alerts.sort((a, b) => ({ urgent: 0, review: 1, watch: 2, positive: 3 }[a.level] - { urgent: 0, review: 1, watch: 2, positive: 3 }[b.level]));
}

function buildSummary(analytics: { sales?: number; profit?: number; margin?: number; expenses?: number; products: ProductInsight[]; alerts: ManagerAlert[]; quadrants: Record<"A" | "B" | "C" | "D", ProductInsight[]> }): ExecutiveSummary {
  const risks = analytics.alerts.filter((alert) => alert.level === "urgent" || alert.level === "review").slice(0, 3).map((alert) => alert.title);
  const positives = analytics.alerts.filter((alert) => alert.level === "positive").slice(0, 3).map((alert) => alert.title);
  const opportunities = analytics.quadrants.C.slice(0, 3).map((product) => `${product.itemName}: هامش جيد مع مبيعات أقل من المتوسط.`);
  const reviewed = analytics.quadrants.B.length;
  const headline = risks[0] ?? positives[0] ?? "تم تحليل البيانات المتاحة وتحديد أولويات المراجعة.";
  const paragraphs: string[] = [];
  if (analytics.sales !== undefined) paragraphs.push(`بلغت المبيعات خلال الفترة المستوردة ${analytics.sales.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م.`);
  if (analytics.margin !== undefined) paragraphs.push(`هامش الربح الإجمالي ${analytics.margin.toFixed(1)}%، مع ${reviewed} صنفًا في مجموعة المبيعات المرتفعة والربحية المنخفضة.`);
  else paragraphs.push("تحليل الربحية غير متاح بالكامل لأن بيانات التكلفة أو الربح غير موجودة في التقرير الحالي.");
  if (analytics.expenses !== undefined) paragraphs.push(`بلغت المصروفات المرصودة ${analytics.expenses.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م؛ يعرض صافي الربح فقط عندما تتوفر بيانات المبيعات والتكلفة والمصروفات معًا.`);
  const recommendations = risks.length ? ["ابدأ بالمخاطر الأعلى أدناه؛ كل تنبيه يعرض السبب والقيمة والإجراء المقترح.", "استخدم الفلاتر لعزل الشركة أو الصنف قبل اتخاذ قرار تشغيلي.", "راجع مطابقة الأعمدة عند ظهور أي قيمة لا تعكس التقرير الأصلي."] : ["راجع الأصناف ذات هامش الربح المرتفع ومبيعاتها المنخفضة لاكتشاف فرص نمو عملية.", "تابع أعلى الأصناف ربحًا وتأكد من توافرها وفق حركة الطلب.", "استورد تقريرًا لفترة سابقة لإثراء المقارنات الزمنية."];
  return { headline, paragraphs, positives, risks, opportunities, recommendations };
}

export function analyzePharmacyData(sheets: SheetInspection[], filters: DashboardFilters = {}): DashboardAnalytics | undefined {
  const sheet = selectAnalysisSheet(sheets);
  if (!sheet) return undefined;
  const map = canonicalMap(sheet.mappings);
  const records = sheet.cleanRecords.filter((record) => {
    const date = record.__metrics.date;
    if (filters.from && (!date || date < filters.from)) return false;
    if (filters.to && (!date || date > filters.to)) return false;
    if (filters.company && String(fieldValue(record, map, "company") ?? "") !== filters.company) return false;
    if (filters.item && !String(fieldValue(record, map, "item_name") ?? "").toLowerCase().includes(filters.item.toLowerCase())) return false;
    if (filters.category && String(fieldValue(record, map, "category") ?? "") !== filters.category) return false;
    if (filters.employee && String(fieldValue(record, map, "employee") ?? "") !== filters.employee) return false;
    if (filters.branch && String(fieldValue(record, map, "branch") ?? "") !== filters.branch) return false;
    return true;
  });
  const hasSales = Boolean(map.sales_total || (map.sale_price && (map.quantity_sold || map.sales_quantity)));
  const hasCost = Boolean(map.total_cost || (map.cost_price && (map.quantity_sold || map.sales_quantity)));
  const hasDirectProfit = Boolean(map.profit);
  const hasExpense = Boolean(map.expense_amount);
  const totalSales = hasSales ? sum(records.map((record) => record.__metrics.sales)) : undefined;
  const totalCost = hasCost ? sum(records.map((record) => record.__metrics.cost)) : undefined;
  const totalProfit = hasDirectProfit ? sum(records.map((record) => record.__metrics.profit)) : totalSales !== undefined && totalCost !== undefined ? totalSales - totalCost : undefined;
  const grossMargin = totalSales && totalProfit !== undefined ? totalProfit / totalSales * 100 : undefined;
  const totalDiscount = map.discount_value ? sum(records.map((record) => record.__metrics.discount)) : undefined;
  const totalExpenses = hasExpense ? sum(records.map((record) => numeric(fieldValue(record, map, "expense_amount")))) : undefined;
  const netProfit = totalProfit !== undefined && totalExpenses !== undefined ? totalProfit - totalExpenses : undefined;
  const products = buildProductInsights(records, map, { sales: totalSales, cost: totalCost });
  const companies = map.company ? buildCompanyInsights(products) : [];
  const productQuadrants = classifyQuadrants(products);
  const dates = records.map((record) => record.__metrics.date).filter((value): value is Date => value !== undefined).sort((a, b) => a.valueOf() - b.valueOf());
  const invoices = map.invoice_number ? unique(records.map((record) => String(fieldValue(record, map, "invoice_number") ?? "").trim()).filter(Boolean)).length : undefined;
  const alerts = detectAlerts({ products, companies, records, grossMargin, sales: totalSales, profit: totalProfit, expenses: totalExpenses });
  const summary = buildSummary({ sales: totalSales, profit: totalProfit, margin: grossMargin, expenses: totalExpenses, products, alerts, quadrants: productQuadrants });
  const metrics = {
    sales: metricNumber(totalSales, hasSales, hasSales ? (map.sales_total ? "فعلي" : "محسوب") : "غير متاح", hasSales ? (map.sales_total ? "مجموع مباشر من حقل المبيعات في التقرير." : "محسوب من سعر البيع × الكمية.") : "إجمالي المبيعات غير متاح لأن حقل المبيعات أو سعر البيع والكمية غير مكتملين."),
    cost: metricNumber(totalCost, hasCost, hasCost ? (map.total_cost ? "فعلي" : "محسوب") : "غير متاح", hasCost ? (map.total_cost ? "مجموع مباشر من حقل التكلفة في التقرير." : "محسوب من سعر التكلفة × الكمية.") : "إجمالي التكلفة غير متاح في التقرير الحالي."),
    grossProfit: metricNumber(totalProfit, Boolean(hasDirectProfit || (hasSales && hasCost)), hasDirectProfit ? "فعلي" : hasSales && hasCost ? "محسوب" : "غير متاح", totalProfit === undefined ? "تحليل الربحية غير متاح بالكامل لأن بيانات التكلفة أو الربح غير موجودة." : undefined),
    grossMargin: metricNumber(grossMargin, Boolean(totalSales && totalProfit !== undefined), totalProfit !== undefined ? "محسوب" : "غير متاح", grossMargin === undefined ? "يلزم وجود مبيعات وربح لحساب هامش الربح." : "هامش الربح = الربح الإجمالي ÷ المبيعات × 100."),
    items: metricNumber(unique(products.map((product) => product.id)).length, Boolean(map.item_name || map.item_code), "فعلي", map.item_name || map.item_code ? "عدد الأصناف الفريدة في السجلات المحللة." : "لا يوجد اسم صنف أو كود صنف معروف."),
    soldItems: metricNumber(products.filter((product) => (product.sales ?? 0) > 0).length, hasSales && Boolean(map.item_name || map.item_code), "محسوب", hasSales ? "أصناف لها مبيعات موجبة ضمن الفترة." : "يلزم وجود مبيعات وربط الصنف."),
    invoices: metricNumber(invoices, Boolean(map.invoice_number), "فعلي", invoices === undefined ? "رقم الفاتورة غير متاح في التقرير الحالي." : "عدد أرقام الفواتير المختلفة."),
    averageInvoice: metricNumber(invoices && totalSales !== undefined ? totalSales / invoices : undefined, Boolean(invoices && totalSales !== undefined), "محسوب", invoices && totalSales !== undefined ? "إجمالي المبيعات ÷ عدد الفواتير المختلفة." : "يلزم وجود إجمالي مبيعات ورقم فاتورة."),
    discount: metricNumber(totalDiscount, Boolean(map.discount_value), "فعلي", totalDiscount === undefined ? "قيمة الخصم غير متاحة في التقرير الحالي." : "مجموع قيم الخصم كما وردت في الملف."),
    expenses: metricNumber(totalExpenses, hasExpense, "فعلي", totalExpenses === undefined ? "تحليل المصروفات غير متاح لأن الملف لا يحتوي على مبلغ مصروف." : "مجموع مبالغ المصروفات المتاحة."),
    netProfit: metricNumber(netProfit, Boolean(totalProfit !== undefined && totalExpenses !== undefined), "محسوب", netProfit === undefined ? "صافي الربح غير متاح لأنه يتطلب بيانات الربح الإجمالي والمصروفات معًا." : "الربح الإجمالي − المصروفات."),
  };
  const availability = Object.fromEntries(Object.entries(metrics).map(([key, metric]) => [key, metric.confidence]));
  return { sourceSheet: sheet.name, totalRows: records.length, dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : undefined, metrics, products, companies, trends: buildTrend(records), alerts, focusItems: alerts.slice(0, 8), summary, productQuadrants, availability };
}

export function answerDataQuestion(question: string, analytics: DashboardAnalytics): string {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return "اكتب سؤالك عن المبيعات أو الربحية أو الأصناف، وسأجيب من البيانات المستوردة فقط.";
  const topProducts = analytics.products.slice(0, 5);
  const topProfit = [...analytics.products].filter((product) => product.profit !== undefined).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)).slice(0, 5);
  const topCompany = analytics.companies[0];
  if (/(اجمالي|إجمالي).*(مبيعات|بيع)|مبيعات.*(كم|قد ايه)/.test(normalized)) return analytics.metrics.sales.value !== undefined ? `إجمالي المبيعات في البيانات المعروضة هو ${analytics.metrics.sales.value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م.` : "إجمالي المبيعات غير متاح؛ لا يوجد حقل مبيعات مباشر أو سعر بيع وكمية كافيان للحساب.";
  if (/(ربح|هامش)/.test(normalized) && /(اجمالي|إجمالي|كم|قد ايه)/.test(normalized)) return analytics.metrics.grossProfit.value !== undefined ? `الربح الإجمالي ${analytics.metrics.grossProfit.value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م، وهامش الربح ${analytics.metrics.grossMargin.value?.toFixed(1) ?? "غير متاح"}%.` : "تحليل الربحية غير متاح بالكامل لأن بيانات التكلفة أو الربح غير موجودة.";
  if (/(اكثر|أكثر|أعلى|اعلى|افضل|أفضل).*(مبيع|بيع)/.test(normalized)) return topProducts.length ? `أعلى الأصناف مبيعًا: ${topProducts.map((product, index) => `${index + 1}) ${product.itemName} (${product.sales?.toLocaleString("ar-EG", { maximumFractionDigits: 0 }) ?? "غير متاح"} ج.م)`).join(" — ")}.` : "لا توجد بيانات كافية لتحديد الأصناف الأعلى مبيعًا.";
  if (/(اكثر|أكثر|أعلى|اعلى|افضل|أفضل).*(ربح)/.test(normalized)) return topProfit.length ? `أعلى الأصناف تحقيقًا للربح: ${topProfit.map((product, index) => `${index + 1}) ${product.itemName} (${product.profit?.toLocaleString("ar-EG", { maximumFractionDigits: 0 }) ?? "غير متاح"} ج.م)`).join(" — ")}.` : "لا توجد بيانات ربح كافية لتحديد الأصناف الأعلى ربحًا.";
  if (/(شركة|شركه).*(أعلى|اعلى|اكثر|أكثر|افضل|أفضل)/.test(normalized)) return topCompany?.sales !== undefined ? `أعلى شركة في المبيعات هي ${topCompany.company} بقيمة ${topCompany.sales.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م.` : "تحليل الشركات غير متاح لأن حقل الشركة أو المبيعات غير موجود.";
  if (/(تحتاج|مراجعة|مراجعه|خطر)/.test(normalized)) {
    const relevant = analytics.alerts.filter((alert) => alert.level === "urgent" || alert.level === "review").slice(0, 4);
    return relevant.length ? `أهم ما يحتاج مراجعة: ${relevant.map((alert) => alert.title).join(" — ")}.` : "لم يتم رصد تنبيهات عالية الأولوية وفق القواعد المتاحة في البيانات الحالية.";
  }
  return "يمكنني الإجابة عن إجمالي المبيعات أو الربح، أعلى الأصناف مبيعًا أو ربحًا، الأصناف التي تحتاج مراجعة، وأعلى الشركات من البيانات المستوردة فقط.";
}
