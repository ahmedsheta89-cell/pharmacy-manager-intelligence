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
  purchasePriceSource?: "source" | "derived" | "price_file";
  publicPrice?: number;
  publicPriceSource?: "source" | "derived" | "price_file";
  margin?: number;
  marginSource?: "source" | "derived" | "price_file";
  sourceRecordCount: number;
  periods: Record<string, { sales?: number; quantity?: number; stock?: number }>;
};

export type ZeroBalanceItem = ProductMovementItem & {
  purchaseValue?: number;
  publicValue?: number;
};

export type ZeroMovementItem = ProductMovementItem & {
  purchaseValue?: number;
  publicValue?: number;
  potentialGrossProfit?: number;
};

export type StoppedProduct = ProductMovementItem & {
  baselineSales: number;
  followUpSales: number;
  baselineQuantity?: number;
  followUpQuantity?: number;
  baselinePeriod: string;
  followUpPeriod: string;
};

export type CoverageGapItem = ProductMovementItem & {
  averageHistoricalDemand: number;
  requiredQuantity: number;
  gap: number;
  monthsOfCoverage: number;
  priority: "عاجل" | "مرتفع" | "متوسط";
};

export interface ProductMovementAnalysis {
  available: boolean;
  periods: MovementPeriod[];
  sourceNote: string;
  dataGaps: string[];
  items: ProductMovementItem[];
  zeroBalance: ZeroBalanceItem[];
  zeroMovement: ZeroMovementItem[];
  zeroSales: ProductMovementItem[];
  stoppedAfterBaseline: StoppedProduct[];
  coverageGaps: CoverageGapItem[];
  metrics: {
    zeroBalanceCount: number;
    zeroBalanceRecordCount: number;
    zeroBalanceRawRecordCount: number;
    zeroBalanceUnidentifiedRecordCount: number;
    zeroMovementCount?: number;
    zeroMovementRecordCount?: number;
    zeroSalesCount?: number;
    stoppedCount?: number;
    coverageGapCount?: number;
    knownPurchaseValue?: number;
    knownPublicValue?: number;
    knownZeroMovementPurchaseValue?: number;
    knownZeroMovementPublicValue?: number;
    knownZeroMovementPotentialProfit?: number;
    matchedByCodeRecordCount: number;
    matchedByNameRecordCount: number;
  };
}

const mapFields = (mappings: ColumnMapping[]): FieldMap => mappings.reduce((result, mapping) => {
  if (mapping.field !== "unknown" && mapping.confidence !== "منخفضة" && !result[mapping.field]) result[mapping.field] = mapping.sourceColumn;
  return result;
}, {} as FieldMap);

const valueFor = (record: CleanRecord, fields: FieldMap, field: CanonicalField) => fields[field] ? record[fields[field] as string] : undefined;
const textFor = (record: CleanRecord, fields: FieldMap, field: CanonicalField) => String(valueFor(record, fields, field) ?? "").trim();
const numberFor = (record: CleanRecord, fields: FieldMap, field: CanonicalField) => toNumber(valueFor(record, fields, field) as never);
const normalizedItemKey = (value: string) => value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^a-z0-9\u0621-\u064a]+/g, "").trim();

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
  let hasDirectPurchasePrice = false;
  let hasDirectPublicPrice = false;
  let hasDirectMargin = false;
  let hasPriceFilePrice = false;
  let zeroBalanceRawRecordCount = 0;
  let matchedByCodeRecordCount = 0;
  let matchedByNameRecordCount = 0;

  for (const sheet of sheets) {
    const fields = mapFields(sheet.mappings);
    if (!fields.item_name) continue;
    for (const record of sheet.cleanRecords) {
      const stock = numberFor(record, fields, "stock_quantity");
      if (stock !== undefined && stock <= 0) zeroBalanceRawRecordCount += 1;
      const itemName = textFor(record, fields, "item_name");
      if (!itemName) continue;
      const itemCode = textFor(record, fields, "item_code") || undefined;
      const normalizedCode = normalizedItemKey(itemCode ?? "");
      const normalizedName = normalizedItemKey(itemName);
      const linkedByCode = Boolean(normalizedCode);
      const id = linkedByCode ? `code:${normalizedCode}` : `name:${normalizedName}`;
      if (linkedByCode) matchedByCodeRecordCount += 1;
      else matchedByNameRecordCount += 1;
      const period = resolvePeriod(sheet, record);
      if (period) periodMap.set(period.key, period);

      const sales = record.__metrics.sales ?? numberFor(record, fields, "sales_total");
      const quantity = record.__metrics.quantity ?? numberFor(record, fields, "quantity_sold") ?? numberFor(record, fields, "sales_quantity");
      const directPurchasePrice = numberFor(record, fields, "cost_price");
      const directPublicPrice = numberFor(record, fields, "sale_price");
      const directMargin = numberFor(record, fields, "profit_margin");
      const purchasePrice = directPurchasePrice ?? record.__metrics.unitCost;
      const publicPrice = directPublicPrice ?? record.__metrics.unitSalePrice;
      const margin = directMargin ?? record.__metrics.profitMargin;
      hasStock ||= stock !== undefined;
      hasSales ||= sales !== undefined;
      hasQuantity ||= quantity !== undefined;
      hasPurchasePrice ||= purchasePrice !== undefined;
      hasPublicPrice ||= publicPrice !== undefined;
      hasMargin ||= margin !== undefined;
      hasDirectPurchasePrice ||= directPurchasePrice !== undefined;
      hasDirectPublicPrice ||= directPublicPrice !== undefined;
      hasDirectMargin ||= directMargin !== undefined;
      hasPriceFilePrice ||= record.__metrics.priceSource === "price_file";

      const existing = itemMap.get(id);
      const next: ProductMovementItem = existing ?? {
        id,
        itemName,
        itemCode,
        company: textFor(record, fields, "company") || undefined,
        sourceRecordCount: 0,
        periods: {},
      };
      next.itemName = next.itemName || itemName;
      next.itemCode ??= itemCode;
      next.company ??= textFor(record, fields, "company") || undefined;
      next.stock = stock ?? next.stock;
      next.sales = sumKnown(next.sales, sales);
      next.quantity = sumKnown(next.quantity, quantity);
      next.purchasePrice = purchasePrice ?? next.purchasePrice;
      next.purchasePriceSource ??= directPurchasePrice !== undefined ? "source" : record.__metrics.priceSource === "price_file" && purchasePrice !== undefined ? "price_file" : purchasePrice !== undefined ? "derived" : undefined;
      next.publicPrice = publicPrice ?? next.publicPrice;
      next.publicPriceSource ??= directPublicPrice !== undefined ? "source" : record.__metrics.priceSource === "price_file" && publicPrice !== undefined ? "price_file" : publicPrice !== undefined ? "derived" : undefined;
      next.margin = margin ?? next.margin;
      next.marginSource ??= directMargin !== undefined ? "source" : record.__metrics.priceSource === "price_file" && margin !== undefined ? "price_file" : margin !== undefined ? "derived" : undefined;
      next.sourceRecordCount += 1;
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
  if (!hasPurchasePrice) dataGaps.push("سعر الشراء غير موجود في الملف؛ ستظهر قيمته وقيمة المخزون بالتكلفة وهامش الربح كغير متاحين بدل تقديرها.");
  else if (hasPriceFilePrice) dataGaps.push("تمت مطابقة أسعار الشراء أو الجمهور من ملف الأسعار الإضافي؛ تُستخدم فقط في الأصناف التي نجحت مطابقتها.");
  else if (!hasDirectPurchasePrice) dataGaps.push("سعر الشراء المعروض مشتق من إجمالي تكلفة مقسومًا على الكمية؛ لا يوجد عمود سعر شراء مباشر في المصدر.");
  if (!hasPublicPrice) dataGaps.push("سعر الجمهور/البيع غير موجود في الملف؛ ستظهر قيمته كغير متاحة بدل تقديرها.");
  else if (!hasDirectPublicPrice) dataGaps.push("لا يوجد عمود مستقل لسعر الجمهور؛ سعر الوحدة المعروض مشتق من إجمالي البيع ÷ كمية الحركة، وليس سعر قائمة رسميًا.");
  if (!hasMargin) dataGaps.push("نسبة الربح غير موجودة في الملف؛ لا يمكن احتسابها دون سعر شراء وسعر بيع موثوقين.");
  else if (!hasDirectMargin) dataGaps.push("نسبة الربح المعروضة مشتقة من القيم المتاحة في المصدر وليست حقل هامش مباشرًا.");

  const zeroBalance = hasStock ? items
    .filter((item) => item.stock !== undefined && item.stock <= 0)
    .map<ZeroBalanceItem>((item) => ({
      ...item,
      purchaseValue: item.purchasePrice !== undefined ? item.purchasePrice * Math.max(item.stock ?? 0, 0) : undefined,
      publicValue: item.publicPrice !== undefined ? item.publicPrice * Math.max(item.stock ?? 0, 0) : undefined,
    }))
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)) : [];

  const zeroMovement = hasQuantity ? items
    .filter((item) => item.quantity !== undefined && item.quantity <= 0)
    .map<ZeroMovementItem>((item) => {
      const stock = Math.max(item.stock ?? 0, 0);
      const purchaseValue = item.purchasePrice !== undefined ? item.purchasePrice * stock : undefined;
      const publicValue = item.publicPrice !== undefined ? item.publicPrice * stock : undefined;
      return {
        ...item,
        purchaseValue,
        publicValue,
        potentialGrossProfit: purchaseValue !== undefined && publicValue !== undefined ? publicValue - purchaseValue : undefined,
      };
    })
    .sort((a, b) => (b.publicValue ?? b.sales ?? 0) - (a.publicValue ?? a.sales ?? 0)) : [];

  const currentPeriod = periods.at(-1);
  const baselinePeriod = periods.at(0);
  const zeroSales = hasSales && currentPeriod ? items.filter((item) => (item.periods[currentPeriod.key]?.sales ?? 0) === 0) : [];
  const stoppedAfterBaseline = hasSales && periods.length >= 2 && baselinePeriod && currentPeriod ? items
    .map<StoppedProduct | undefined>((item) => {
      const baselineSales = item.periods[baselinePeriod.key]?.sales ?? 0;
      const followUpSales = periods.slice(1).reduce((sum, period) => sum + (item.periods[period.key]?.sales ?? 0), 0);
      const baselineQuantity = item.periods[baselinePeriod.key]?.quantity;
      const followUpQuantity = periods.slice(1).reduce<number | undefined>((sum, period) => sumKnown(sum, item.periods[period.key]?.quantity), undefined);
      const observedInEveryPeriod = periods.every((period) => Boolean(item.periods[period.key]));
      const hadBaselineMovement = baselineSales > 0 || (baselineQuantity ?? 0) > 0;
      const hadNoFollowUpMovement = followUpSales === 0 && (followUpQuantity === undefined || followUpQuantity === 0);
      return observedInEveryPeriod && hadBaselineMovement && hadNoFollowUpMovement ? {
        ...item, baselineSales, followUpSales, baselineQuantity, followUpQuantity, baselinePeriod: baselinePeriod.label, followUpPeriod: currentPeriod.label,
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
      const monthsOfCoverage = averageHistoricalDemand > 0 ? stock / averageHistoricalDemand : Infinity;
      const priority = stock <= 0 || monthsOfCoverage < 0.5 ? "عاجل" : monthsOfCoverage < 1 ? "مرتفع" : "متوسط";
      return gap > 0 ? { ...item, stock, averageHistoricalDemand, requiredQuantity, gap, monthsOfCoverage, priority } : undefined;
    })
    .filter((item): item is CoverageGapItem => Boolean(item))
    .sort((a, b) => (a.priority === b.priority ? b.gap - a.gap : a.priority === "عاجل" ? -1 : b.priority === "عاجل" ? 1 : a.priority === "مرتفع" ? -1 : 1)) : [];

  const knownPurchaseValue = zeroBalance.reduce<number | undefined>((sum, item) => sumKnown(sum, item.purchaseValue), undefined);
  const knownPublicValue = zeroBalance.reduce<number | undefined>((sum, item) => sumKnown(sum, item.publicValue), undefined);
  const zeroBalanceRecordCount = zeroBalance.reduce((sum, item) => sum + item.sourceRecordCount, 0);
  const zeroMovementRecordCount = zeroMovement.reduce((sum, item) => sum + item.sourceRecordCount, 0);
  const knownZeroMovementPurchaseValue = zeroMovement.reduce<number | undefined>((sum, item) => sumKnown(sum, item.purchaseValue), undefined);
  const knownZeroMovementPublicValue = zeroMovement.reduce<number | undefined>((sum, item) => sumKnown(sum, item.publicValue), undefined);
  const knownZeroMovementPotentialProfit = zeroMovement.reduce<number | undefined>((sum, item) => sumKnown(sum, item.potentialGrossProfit), undefined);
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
    zeroMovement,
    zeroSales,
    stoppedAfterBaseline,
    coverageGaps,
    metrics: {
      zeroBalanceCount: zeroBalance.length,
      zeroBalanceRecordCount,
      zeroBalanceRawRecordCount,
      zeroBalanceUnidentifiedRecordCount: Math.max(0, zeroBalanceRawRecordCount - zeroBalanceRecordCount),
      zeroMovementCount: hasQuantity ? zeroMovement.length : undefined,
      zeroMovementRecordCount: hasQuantity ? zeroMovementRecordCount : undefined,
      zeroSalesCount: hasSales && currentPeriod ? zeroSales.length : undefined,
      stoppedCount: periods.length >= 2 && hasSales ? stoppedAfterBaseline.length : undefined,
      coverageGapCount: coverageGaps.length || (hasStock && hasQuantity && periods.length >= 2 ? 0 : undefined),
      knownPurchaseValue,
      knownPublicValue,
      knownZeroMovementPurchaseValue,
      knownZeroMovementPublicValue,
      knownZeroMovementPotentialProfit,
      matchedByCodeRecordCount,
      matchedByNameRecordCount,
    },
  };
}
