import * as XLSX from "xlsx";
import { analyzeInventoryOperations } from "../client/src/lib/inventoryEngine";
import { inspectPharmacyFile } from "../client/src/lib/pharmacyEngine";

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
console.log(JSON.stringify({ nearExpiry: operations.nearExpiry.length, suggestions: operations.suggestions.length, branches: operations.branches.map((branch) => branch.branch) }, null, 2));
