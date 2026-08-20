import * as XLSX from "xlsx";
import type { InventoryFlowAnalysis } from "@/lib/inventoryFlowEngine";

function value(value?: number) { return value === undefined ? "غير متاح" : value; }

/** يبني التقرير الموحد محليًا فقط، ولا يرفع أي سطر من بيانات الصيدلية. */
export function buildInventoryFlowWorkbook(analysis: InventoryFlowAnalysis) {
  const workbook = XLSX.utils.book_new();
  const summary = [
    ["المؤشر", "القيمة"],
    ["قيمة المخزون الشرائية", value(analysis.metrics.currentStockPurchaseValue)],
    ["قيمة المخزون بسعر الجمهور", value(analysis.metrics.currentStockPublicValue)],
    ["الربح الإجمالي المحتمل للمخزون", value(analysis.metrics.currentStockPotentialGrossProfit)],
    ["قيمة أصناف الحركة الصفرية - شراء", value(analysis.metrics.zeroMovementPurchaseValue)],
    ["قيمة أصناف الحركة الصفرية - جمهور", value(analysis.metrics.zeroMovementPublicValue)],
    ["رصيد صفر حاليًا", analysis.metrics.currentZeroBalanceCount],
    ["أولوية طلب مرتفعة", analysis.metrics.highPriorityCount],
    ["إجمالي التعويض المستنتج (وحدات)", value(analysis.metrics.inferredReplenishmentUnits)],
    ["فرصة مبيعات غير متحققة (حسابية)", value(analysis.metrics.unreplenishedOpportunitySales)],
    ["فرصة ربح غير متحققة (حسابية)", value(analysis.metrics.unreplenishedOpportunityGrossProfit)],
  ];
  const monthly = [["الشهر", "رصيد افتتاحي", "رصيد ختامي", "قيمة المبيعات", "خارج (وحدات)", "تعويض مستنتج", "رصيد صفر", "فرصة مبيعات غير متحققة", "فرصة ربح غير متحققة"], ...analysis.months.map((month) => [month.label, value(month.openingStock), value(month.closingStock), value(month.salesValue), value(month.outboundUnits), value(month.inferredReplenishmentUnits), month.zeroBalanceItems, value(month.unreplenishedOpportunitySales), value(month.unreplenishedOpportunityGrossProfit)])];
  const missing = [["الصنف", "الكود", "من شهر", "إلى شهر", "الطلب السابق", "الرصيد الحالي", "التعويض المستنتج", "فرصة المبيعات (حسابية)", "فرصة الربح (حسابية)"], ...analysis.unreplenishedItems.map((item) => [item.itemName, item.id, item.previousPeriodLabel, item.periodLabel, item.historicalDemand, item.closingStock, item.inferredReplenishmentUnits, value(item.opportunitySales), value(item.opportunityGrossProfit)])];
  const notes = [["ملاحظات وحدود القراءة"], ...[...analysis.notes, ...analysis.dataGaps].map((note) => [note])];
  for (const [name, rows] of [["ملخص القرار", summary], ["الوتيرة الشهرية", monthly], ["غير معوض", missing], ["حدود القراءة", notes]] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = Array.from({ length: Math.max(...rows.map((row) => row.length)) }, (_, index) => ({ wch: index === 0 ? 30 : 21 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return workbook;
}

/** ينزّل التقرير الموحد محليًا فقط، ولا يرفع أي سطر من بيانات الصيدلية. */
export function exportInventoryFlowWorkbook(analysis: InventoryFlowAnalysis) {
  const workbook = buildInventoryFlowWorkbook(analysis);
  XLSX.writeFile(workbook, `تقرير_تدفق_المخزون_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}
