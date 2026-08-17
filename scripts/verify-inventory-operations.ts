import * as XLSX from "xlsx";
import { analyzeInventoryOperations } from "../client/src/lib/inventoryEngine";
import { inspectPharmacyFile } from "../client/src/lib/pharmacyEngine";
import { buildInventoryOperationsWorkbook } from "../client/src/lib/inventoryExport";

const rows = [
  ["اسم الصنف", "كود الصنف", "رصيد المخزون", "حد إعادة الطلب", "تاريخ الانتهاء", "الفرع", "إجمالي المبيعات", "الربح", "الكمية المباعة"],
  ["باراسيتامول 500", "P-001", 5, 15, "15/10/2026", "فرع النيل", 1200, 420, 24],
  ["مضاد حيوي", "A-022", 10, 5, "31/12/2026", "فرع المركز", 800, 210, 8],
  ["فيتامين د", "V-041", 20, 8, "30/06/2027", "فرع النيل", 600, 180, 5],
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "مخزون الفروع");
const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
const file = new File([bytes], "مخزون_وفروع.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const inspection = await inspectPharmacyFile(file);
const operations = analyzeInventoryOperations(inspection.sheets);

if (!operations.available) throw new Error(`لوحة المخزون غير متاحة: ${operations.note}`);
if (!operations.nearExpiry.some((item) => item.itemCode === "P-001")) throw new Error("لم يُكتشف الصنف القريب من الانتهاء.");
if (!operations.suggestions.some((item) => item.itemCode === "P-001" && (item.suggestedQuantity ?? 0) > 0)) throw new Error("لم تُقترح كمية طلب للصنف دون الحد.");
if (operations.branches.length !== 2) throw new Error(`توقعنا فرعين، ووجدنا ${operations.branches.length}.`);
if (operations.branches[0]?.branch !== "فرع النيل") throw new Error("ترتيب مقارنة الفروع لا يتبع المبيعات الفعلية.");

const customRules = { "P-001": { itemId: "P-001", reorderLevel: 30, targetStock: 45, updatedAt: "2026-08-17T00:00:00.000Z" } };
const customized = analyzeInventoryOperations(inspection.sheets, customRules);
const customItem = customized.items.find((item) => item.id === "P-001");
const customSuggestion = customized.suggestions.find((item) => item.id === "P-001");
if (customItem?.reorderLevel !== 30 || customItem.reorderSource !== "custom") throw new Error("لم تتقدم قاعدة إعادة الطلب الفردية على حد الملف.");
if (customSuggestion?.suggestedQuantity !== 40 || customSuggestion.targetStock !== 45) throw new Error("لم تُحسب كمية الطلب المخصصة من رصيد الهدف.");

const exportBook = buildInventoryOperationsWorkbook(customized, customRules);
const requiredSheets = ["ملخص العمليات", "تنبيهات المخزون", "طلبات مقترحة", "قواعد مخصصة"];
if (!requiredSheets.every((name) => exportBook.SheetNames.includes(name))) throw new Error("مصنف التصدير لا يتضمن جميع أوراق العمليات المطلوبة.");

console.log(JSON.stringify({ nearExpiry: operations.nearExpiry.length, suggestions: operations.suggestions.length, customSuggestion: customSuggestion?.suggestedQuantity, sheets: exportBook.SheetNames, branches: operations.branches.map((branch) => branch.branch) }, null, 2));
