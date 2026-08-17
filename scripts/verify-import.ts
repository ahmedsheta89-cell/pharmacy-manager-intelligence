import * as XLSX from "xlsx";
import { inspectPharmacyFile } from "../client/src/lib/pharmacyEngine";
import { analyzePharmacyData, answerDataQuestion, compareWithPreviousPeriod } from "../client/src/lib/analyticsEngine";

const workbook = XLSX.utils.book_new();
const sales = [
  ["تقرير مبيعات الصيدلية — اختبار تشغيلي"],
  ["رقم الفاتورة", "تاريخ البيع", "اسم الصنف", "كود الصنف", "الشركة", "التصنيف", "الكمية", "إجمالي المبيعات", "إجمالي التكلفة", "قيمة الخصم"],
  ["INV-0901", "24/07/2026", "باراسيتامول 500", "P-001", "شركة الشفاء", "مسكنات", 15, 375, 195, 0],
  ["INV-0902", "25/07/2026", "فيتامين د", "V-011", "شركة النور", "فيتامينات", 6, 480, 180, 0],
  ["INV-0903", "26/07/2026", "مضاد حيوي", "A-043", "شركة النور", "مضادات", 8, 1040, 832, 0],
  ["INV-0904", "27/07/2026", "بخاخ أنف", "N-092", "شركة الأمان", "برد وحساسية", 7, 420, 196, 0],
  ["INV-0905", "28/07/2026", "شراب سعال", "C-055", "شركة الأمان", "برد وحساسية", 4, 280, 140, 0],
  ["INV-0906", "29/07/2026", "مضاد حموضة", "G-015", "شركة الشفاء", "هضم", 6, 420, 168, 0],
  ["INV-1001", "01/08/2026", "باراسيتامول 500", "P-001", "شركة الشفاء", "مسكنات", 20, 500, 260, 0],
  ["INV-1002", "02/08/2026", "باراسيتامول 500", "P-001", "شركة الشفاء", "مسكنات", 18, 450, 234, 5],
  ["INV-1003", "03/08/2026", "فيتامين د", "V-011", "شركة النور", "فيتامينات", 8, 640, 240, 0],
  ["INV-1004", "04/08/2026", "مضاد حيوي", "A-043", "شركة النور", "مضادات", 12, 1600, 1280, 0],
  ["INV-1005", "05/08/2026", "بخاخ أنف", "N-092", "شركة الأمان", "برد وحساسية", 9, 540, 252, 0],
  ["INV-1006", "06/08/2026", "شراب سعال", "C-055", "شركة الأمان", "برد وحساسية", 5, 350, 175, 0],
  ["INV-1007", "07/08/2026", "مضاد حموضة", "G-015", "شركة الشفاء", "هضم", 7, 490, 196, 0],
  ["INV-1008", "08/08/2026", "فيتامين د", "V-011", "شركة النور", "فيتامينات", 10, 800, 300, 0],
  ["إجمالي", "", "", "", "", "", 89, 5370, 2937, 5],
];
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sales), "مبيعات أغسطس");
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["نوع المصروف", "مبلغ المصروف"], ["كهرباء", 1200], ["نقل", 300]]), "مصروفات");
const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
const file = new File([buffer], "test-pharmacy-report.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

const inspection = await inspectPharmacyFile(file);
const analytics = analyzePharmacyData(inspection.sheets);
if (!analytics) throw new Error("لم يتم إنشاء تحليل من ملف الاختبار.");
if (analytics.metrics.sales.value !== 8385) throw new Error(`إجمالي المبيعات غير صحيح: ${analytics.metrics.sales.value}`);
if (analytics.metrics.grossProfit.value !== 3737) throw new Error(`إجمالي الربح غير صحيح: ${analytics.metrics.grossProfit.value}`);
if (analytics.metrics.invoices.value !== 14) throw new Error(`عدد الفواتير غير صحيح: ${analytics.metrics.invoices.value}`);
if (!analytics.products.length || !analytics.companies.length || !analytics.alerts.length) throw new Error("التحليل لم يولد المنتجات أو الشركات أو التنبيهات المتوقعة.");
const answer = answerDataQuestion("ما أكثر الأصناف مبيعًا؟", analytics);
if (!answer.includes("باراسيتامول")) throw new Error(`إجابة السؤال الذكي غير متوقعة: ${answer}`);
const comparison = compareWithPreviousPeriod(inspection.sheets);
const salesComparison = comparison.metrics.find((metric) => metric.id === "sales");
if (!comparison.available || salesComparison?.current !== 5370 || salesComparison.previous !== 3015 || !salesComparison.isPositive) throw new Error(`المقارنة الشهرية غير صحيحة: ${JSON.stringify(comparison)}`);
console.log(JSON.stringify({ status: "ok", rows: analytics.totalRows, sales: analytics.metrics.sales.value, profit: analytics.metrics.grossProfit.value, invoices: analytics.metrics.invoices.value, alerts: analytics.alerts.length, comparison: { current: salesComparison.current, previous: salesComparison.previous, changePercent: salesComparison.changePercent }, answer }, null, 2));
