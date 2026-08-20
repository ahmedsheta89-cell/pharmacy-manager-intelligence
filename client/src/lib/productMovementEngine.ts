import { toNumber, type CanonicalField, type CleanRecord, type ColumnMapping, type SheetInspection } from "./pharmacyEngine";

type FieldMap = Partial<Record<CanonicalField, string>>;

export type MovementPeriod = {
  key: string;
  label: string;
  order: number;
};

export type ProductMovementItem = {
  id: string;
  itemName: string;
  itemCode?: string;
  company?: string;
  stock?: number;
  sales?: number;
  quantity?: number;
  purchasePrice?: number;
  publicPrice?: number;
  margin?: number;
  periods: Record<string, { sales?: number; quantity?: number; stock?: number }>;
};

export type ZeroBalanceItem = ProductMovementItem & {
  purchaseValue?: number;
  publicValue?: number;
};

export type StoppedProduct = ProductMovementItem & {
  baselineSales: number;
  followUpSales: number;
  baselinePeriod: string;
  followUpPeriod: string;
};

export type CoverageGapItem = ProductMovementItem & {
  averageHistoricalDemand: number;
  requiredQuantity: number;
  gap: number;
};

export interface ProductMovementAnalysis {
  available: boolean;
  periods: MovementPeriod[];
  sourceNote: string;
  dataGaps: string[];
  items: ProductMovementItem[];
  zeroBalance: ZeroBalanceItem[];
  zeroSales: ProductMovementItem[];
  stoppedAfterBaseline: StoppedProduct[];
  coverageGaps: CoverageGapItem[];
  metrics: {
    zeroBalanceCount: number;
    zeroSalesCount?: number;
    stoppedCount?: number;
    coverageGapCount?: number;
    knownPurchaseValue?: number;
    knownPublicValue?: number;
  };
}

const mapFields = (mappings: ColumnMapping[]): FieldMap => mappings.reduce((result, mapping) => {
  if (mapping.field !== "unknown" && mapping.confidence !== "منخفضة" && !result[mapping.field]) result[mapping.field] = mapping.sourceColumn;
  return result;
}, {} as FieldMap);

const valueFor = (record: CleanRecord, fields: FieldMap, field: CanonicalField) => fields[field] ? record[fields[field] as string] : undefined;
const textFor = (record: CleanRecord, fields: FieldMap, field: CanonicalField) => String(valueFor(record, fields, field) ?? "").trim();
const numberFor = (record: CleanRecord, fields: FieldMap, field: CanonicalField) => toNumber(valueFor(record, fields, field) as never);

const arabicMonthNumbers: Record<string, number> = {
  "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "أبريل": 4, "مايو": 5, "يونيو": 6,
  "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10,
  "نوفمبر": 11, "ديسمبر": 12,
};

const englishMonthNumbers: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function periodFromSheetName(name: string): MovementPeriod | undefined {
  const title = name.trim().toLowerCase();
  const numeric = title.match(/^(?:شهر\s*)?(0?[1-9]|1[0-2])$/);
  const month = numeric ? Number(numeric[1]) : arabicMonthNumbers[name.trim()] ?? englishMonthNumbers[title];
  if (!month) return undefined;
  return { key: `sheet-month-${month}`, label: `الشهر ${month}`, order: month };
}

function periodFromDate(date: Date): MovementPeriod {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return {
    key: `date-${year}-${String(month).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(date),
    order: year * 100 + month,
  };
}

function resolvePeriod(sheet: SheetInspection, record: CleanRecord): MovementPeriod | undefined {
  if (record.__metrics.date) return periodFromDate(record.__metrics.date);
  return periodFromSheetName(sheet.name);
}

function sumKnown(a: number | undefined, b: number | undefined) {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
}

export function analyzeProductMovement(sheets: SheetInspection[]): ProductMovementAnalysis {
  const itemMap = new Map<string, ProductMovementItem>();
  const periodMap = new Map<string, MovementPeriod>();
  let hasSales = false;
  let hasQuantity = false;
  let hasStock = false;
  let hasPurchasePrice = false;
  let hasPublicPrice = false;
  let hasMargin = false;

  for (const sheet of sheets) {
    const fields = mapFields(sheet.mappings);
    if (!fields.item_name) continue;
    for (const record of sheet.cleanRecords) {
      const itemName = textFor(record, fields, "item_name");
      if (!itemName) continue;
      const itemCode = textFor(record, fields, "item_code") || undefined;
      const id = itemCode || itemName;
      const period = resolvePeriod(sheet, record);
      if (period) periodMap.set(period.key, period);

      const stock = numberFor(record, fields, "stock_quantity");
      const sales = record.__metrics.sales ?? numberFor(record, fields, "sales_total");
      const quantity = record.__metrics.quantity ?? numberFor(record, fields, "quantity_sold") ?? numberFor(record, fields, "sales_quantity");
      const purchasePrice = numberFor(record, fields, "cost_price");
      const publicPrice = numberFor(record, fields, "sale_price");
      const margin = numberFor(record, fields, "profit_margin");
      hasStock ||= stock !== undefined;
      hasSales ||= sales !== undefined;
      hasQuantity ||= quantity !== undefined;
      hasPurchasePrice ||= purchasePrice !== undefined;
      hasPublicPrice ||= publicPrice !== undefined;
      hasMargin ||= margin !== undefined;

      const existing = itemMap.get(id);
      const next: ProductMovementItem = existing ?? {
        id,
        itemName,
        itemCode,
        company: textFor(record, fields, "company") || undefined,
        periods: {},
      };
      next.itemName = next.itemName || itemName;
      next.itemCode ??= itemCode;
      next.company ??= textFor(record, fields, "company") || undefined;
      next.stock = stock ?? next.stock;
      next.sales = sumKnown(next.sales, sales);
      next.quantity = sumKnown(next.quantity, quantity);
      next.purchasePrice = purchasePrice ?? next.purchasePrice;
      next.publicPrice = publicPrice ?? next.publicPrice;
      next.margin = margin ?? next.margin;
      if (period) {
        const prior = next.periods[period.key] ?? {};
        next.periods[period.key] = {
          stock: stock ?? prior.stock,
          sales: sumKnown(prior.sales, sales),
          quantity: sumKnown(prior.quantity, quantity),
        };
      }
      itemMap.set(id, next);
    }
  }

  const periods = Array.from(periodMap.values()).sort((a, b) => a.order - b.order);
  const items = Array.from(itemMap.values()).sort((a, b) => a.itemName.localeCompare(b.itemName, "ar"));
  const dataGaps: string[] = [];
  if (!hasStock) dataGaps.push("لا يحتوي الملف على رصيد مخزون صالح، لذلك لا يمكن تحديد الأصناف ذات الرصيد الصفري أو فجوة التغطية.");
  if (!hasSales) dataGaps.push("لا يحتوي الملف على قيمة مبيعات صالحة، لذلك لا يمكن تصنيف أصناف صفر المبيعات أو الأصناف التي توقفت مبيعاتها.");
  if (periods.length < 2) dataGaps.push("لا توجد فترتان زمنيتان قابلتان للمقارنة. أضف عمود «تاريخ البيع» أو شيتًا مستقلًا لكل شهر بعنوان الشهر فقط (مثل 6، 7، 8). ");
  if (!hasQuantity) dataGaps.push("لا توجد كمية حركة صالحة عبر فترات متعددة، لذلك لا يمكن تقدير الاحتياج للوصول إلى معدل الطلب السابق.");
  if (!hasPurchasePrice) dataGaps.push("سعر الشراء غير موجود في الملف؛ ستظهر قيمته وهامش الربح كغير متاحين بدل تقديرهما.");
  if (!hasPublicPrice) dataGaps.push("سعر الجمهور/البيع غير موجود في الملف؛ ستظهر قيمته كغير متاحة بدل تقديرها.");
  if (!hasMargin) dataGaps.push("نسبة الربح غير موجودة في الملف؛ لا يمكن احتسابها دون سعر شراء وسعر بيع موثوقين.");

  const zeroBalance = hasStock ? items
    .filter((item) => item.stock !== undefined && item.stock <= 0)
    .map<ZeroBalanceItem>((item) => ({
      ...item,
      purchaseValue: item.purchasePrice !== undefined ? item.purchasePrice * Math.max(item.stock ?? 0, 0) : undefined,
      publicValue: item.publicPrice !== undefined ? item.publicPrice * Math.max(item.stock ?? 0, 0) : undefined,
    }))
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)) : [];

  const currentPeriod = periods.at(-1);
  const baselinePeriod = periods.at(0);
  const zeroSales = hasSales && currentPeriod ? items.filter((item) => (item.periods[currentPeriod.key]?.sales ?? 0) === 0) : [];
  const stoppedAfterBaseline = hasSales && periods.length >= 2 && baselinePeriod && currentPeriod ? items
    .map<StoppedProduct | undefined>((item) => {
      const baselineSales = item.periods[baselinePeriod.key]?.sales ?? 0;
      const followUpSales = periods.slice(1).reduce((sum, period) => sum + (item.periods[period.key]?.sales ?? 0), 0);
      return baselineSales > 0 && followUpSales === 0 ? {
        ...item, baselineSales, followUpSales, baselinePeriod: baselinePeriod.label, followUpPeriod: currentPeriod.label,
      } : undefined;
    })
    .filter((item): item is StoppedProduct => Boolean(item))
    .sort((a, b) => b.baselineSales - a.baselineSales) : [];

  const coverageGaps = hasStock && hasQuantity && periods.length >= 2 && currentPeriod ? items
    .map<CoverageGapItem | undefined>((item) => {
      const stock = item.periods[currentPeriod.key]?.stock ?? item.stock;
      const historicPeriods = periods.slice(0, -1);
      const quantities = historicPeriods.map((period) => item.periods[period.key]?.quantity).filter((value): value is number => value !== undefined);
      if (stock === undefined || !quantities.length) return undefined;
      const averageHistoricalDemand = quantities.reduce((sum, value) => sum + value, 0) / quantities.length;
      const requiredQuantity = Math.ceil(averageHistoricalDemand);
      const gap = Math.max(0, requiredQuantity - stock);
      return gap > 0 ? { ...item, stock, averageHistoricalDemand, requiredQuantity, gap } : undefined;
    })
    .filter((item): item is CoverageGapItem => Boolean(item))
    .sort((a, b) => b.gap - a.gap) : [];

  const knownPurchaseValue = zeroBalance.reduce<number | undefined>((sum, item) => sumKnown(sum, item.purchaseValue), undefined);
  const knownPublicValue = zeroBalance.reduce<number | undefined>((sum, item) => sumKnown(sum, item.publicValue), undefined);
  const sourceNote = periods.length >= 2
    ? `المقارنة مبنية على ${periods.length} فترات مكتشفة من تاريخ السجل أو عنوان الشيت، دون دمج أو افتراض لفترات مفقودة.`
    : "هذه لقطة تشغيلية من الملف الحالي؛ تُعرض أرصدة الأصناف والقيم المتاحة فقط دون اختراع تاريخ حركة غير موجود.";

  return {
    available: items.length > 0,
    periods,
    sourceNote,
    dataGaps,
    items,
    zeroBalance,
    zeroSales,
    stoppedAfterBaseline,
    coverageGaps,
    metrics: {
      zeroBalanceCount: zeroBalance.length,
      zeroSalesCount: hasSales && currentPeriod ? zeroSales.length : undefined,
      stoppedCount: periods.length >= 2 && hasSales ? stoppedAfterBaseline.length : undefined,
      coverageGapCount: coverageGaps.length || (hasStock && hasQuantity && periods.length >= 2 ? 0 : undefined),
      knownPurchaseValue,
      knownPublicValue,
    },
  };
}
