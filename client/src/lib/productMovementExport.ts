/**
 * تصدير محلي لتقرير حركة الأصناف. لا تُرسل أي بيانات خارج المتصفح.
 */
import * as XLSX from "xlsx";
import type { ProductMovementAnalysis, ProductMovementItem } from "./productMovementEngine";

function fitColumns(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  return headers.map((header) => ({ wch: Math.min(42, Math.max(12, header.length + 3, ...rows.map((row) => String(row[header] ?? "").length + 2))) }));
}

function appendSheet(book: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const displayRows = rows.length ? rows : [{ "لا توجد بيانات": "لا توجد صفوف مطابقة في جلسة التحليل الحالية." }];
  const worksheet = XLSX.utils.json_to_sheet(displayRows);
  worksheet["!cols"] = fitColumns(displayRows);
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(worksheet["!ref"] ?? "A1")) };
  XLSX.utils.book_append_sheet(book, worksheet, name);
}

function priceSource(source: ProductMovementItem["publicPriceSource"] | ProductMovementItem["purchasePriceSource"]) {
  return source === "source" ? "من عمود المصدر" : source === "derived" ? "مشتق من الإجمالي والكمية" : "غير متاح";
}

function itemColumns(item: ProductMovementItem) {
  return {
    "الصنف": item.itemName,
    "الكود": item.itemCode ?? "",
    "الشركة": item.company ?? "",
    "الرصيد الحالي": item.stock ?? "",
    "إجمالي البيع المسجل": item.sales ?? "",
    "كمية الحركة": item.quantity ?? "",
    "سعر الشراء": item.purchasePrice ?? "",
    "مصدر سعر الشراء": priceSource(item.purchasePriceSource),
    "سعر البيع/الوحدة": item.publicPrice ?? "",
    "مصدر سعر البيع": priceSource(item.publicPriceSource),
    "هامش الربح %": item.margin ?? "",
    "مصدر الهامش": item.marginSource === "source" ? "من عمود المصدر" : item.marginSource === "derived" ? "مشتق من القيم المتاحة" : "غير متاح",
  };
}

export function buildProductMovementWorkbook(analysis: ProductMovementAnalysis) {
  const book = XLSX.utils.book_new();
  const createdAt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  appendSheet(book, "ملخص حركة الأصناف", [
    { "المؤشر": "وقت إنشاء الملف", "القيمة": createdAt },
    { "المؤشر": "عدد الأصناف محل التحليل", "القيمة": analysis.items.length },
    { "المؤشر": "الفترات المكتشفة", "القيمة": analysis.periods.length ? analysis.periods.map((period) => period.label).join(" ← ") : "لا توجد فترات قابلة للمقارنة" },
    { "المؤشر": "أصناف الرصيد الصفري", "القيمة": analysis.metrics.zeroBalanceCount },
    { "المؤشر": "سجلات الرصيد الصفري في المصدر", "القيمة": analysis.metrics.zeroBalanceRecordCount },
    { "المؤشر": "إجمالي إشارات الرصيد الصفري الخام", "القيمة": analysis.metrics.zeroBalanceRawRecordCount },
    { "المؤشر": "إشارات رصيد صفري بلا اسم صنف", "القيمة": analysis.metrics.zeroBalanceUnidentifiedRecordCount },
    { "المؤشر": "أصناف الحركة الصفرية", "القيمة": analysis.metrics.zeroMovementCount ?? "غير متاح" },
    { "المؤشر": "سجلات الحركة الصفرية في المصدر", "القيمة": analysis.metrics.zeroMovementRecordCount ?? "غير متاح" },
    { "المؤشر": "قيمة شراء مخزون الحركة الصفرية", "القيمة": analysis.metrics.knownZeroMovementPurchaseValue ?? "غير متاح" },
    { "المؤشر": "قيمة بيع مخزون الحركة الصفرية", "القيمة": analysis.metrics.knownZeroMovementPublicValue ?? "غير متاح" },
    { "المؤشر": "ربح إجمالي محتمل للحركة الصفرية", "القيمة": analysis.metrics.knownZeroMovementPotentialProfit ?? "غير متاح" },
    { "المؤشر": "أصناف توقفت بعد الفترة المرجعية", "القيمة": analysis.metrics.stoppedCount ?? "غير متاح" },
    { "المؤشر": "فجوات تغطية قابلة للقياس", "القيمة": analysis.metrics.coverageGapCount ?? "غير متاح" },
    { "المؤشر": "منهج التقرير", "القيمة": analysis.sourceNote },
  ]);
  appendSheet(book, "حركة صفرية", analysis.zeroMovement.map((item) => ({
    ...itemColumns(item),
    "قيمة المخزون بسعر الشراء": item.purchaseValue ?? "",
    "قيمة المخزون بسعر البيع": item.publicValue ?? "",
    "الربح الإجمالي المحتمل": item.potentialGrossProfit ?? "",
  })));
  appendSheet(book, "رصيد صفري", analysis.zeroBalance.map((item) => ({
    ...itemColumns(item),
    "قيمة المخزون بسعر الشراء": item.purchaseValue ?? "",
    "قيمة المخزون بسعر البيع": item.publicValue ?? "",
  })));
  appendSheet(book, "أصناف متوقفة", analysis.stoppedAfterBaseline.map((item) => ({
    ...itemColumns(item),
    "الفترة المرجعية": item.baselinePeriod,
    "مبيعات الفترة المرجعية": item.baselineSales,
    "كمية الفترة المرجعية": item.baselineQuantity ?? "",
    "آخر فترة متابعة": item.followUpPeriod,
    "مبيعات المتابعة": item.followUpSales,
    "كمية المتابعة": item.followUpQuantity ?? "",
  })));
  appendSheet(book, "أولوية الطلب", analysis.coverageGaps.map((item) => ({
    ...itemColumns(item),
    "متوسط الطلب التاريخي": item.averageHistoricalDemand,
    "التغطية بالشهور": item.monthsOfCoverage,
    "الكمية اللازمة لمعدل شهر": item.requiredQuantity,
    "الفجوة": item.gap,
    "أولوية الطلب": item.priority,
  })));
  appendSheet(book, "حدود المصدر", analysis.dataGaps.map((gap) => ({ "قيد أو توضيح": gap })));
  return book;
}

export function exportProductMovementWorkbook(analysis: ProductMovementAnalysis) {
  const book = buildProductMovementWorkbook(analysis);
  XLSX.writeFile(book, `تقرير_حركة_الأصناف_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
