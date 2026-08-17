/**
 * نبض العيادة التنفيذي — تصدير قابل للمشاركة لمركز المخزون والطلبات.
 * يولّد ملف Excel محليًا من النتائج الحالية فقط ولا يرسل أي بيانات للخارج.
 */
import * as XLSX from "xlsx";
import type { InventoryOperations } from "./inventoryEngine";
import type { ReorderRules } from "./reorderRules";

function fitColumns(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  return headers.map((header) => ({ wch: Math.min(38, Math.max(12, header.length + 3, ...rows.map((row) => String(row[header] ?? "").length + 2))) }));
}

function appendSheet(book: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "لا توجد بيانات": "لا توجد صفوف مطابقة في الجلسة الحالية." }]);
  worksheet["!cols"] = fitColumns(rows.length ? rows : [{ "لا توجد بيانات": "لا توجد صفوف مطابقة في الجلسة الحالية." }]);
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(worksheet["!ref"] ?? "A1")) };
  XLSX.utils.book_append_sheet(book, worksheet, name);
}

export function buildInventoryOperationsWorkbook(operations: InventoryOperations, rules: ReorderRules) {
  const book = XLSX.utils.book_new();
  const createdAt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const overview = [
    { "المؤشر": "وقت إنشاء الملف", "القيمة": createdAt },
    { "المؤشر": "حالة مصدر المخزون", "القيمة": operations.available ? "بيانات متاحة" : "بيانات غير مكتملة" },
    { "المؤشر": "أصناف قرب الانتهاء", "القيمة": operations.nearExpiry.length },
    { "المؤشر": "أصناف عند حد الطلب", "القيمة": operations.lowStock.length },
    { "المؤشر": "طلبات مقترحة", "القيمة": operations.suggestions.length },
    { "المؤشر": "قواعد فردية مفعلة", "القيمة": Object.keys(rules).length },
    { "المؤشر": "منهج الحساب", "القيمة": "الحد المخصص أولًا، ثم حد الملف، ثم مبيعات الفترة عند غياب الحد." },
  ];
  appendSheet(book, "ملخص العمليات", overview);
  appendSheet(book, "تنبيهات المخزون", [...operations.nearExpiry, ...operations.lowStock].map((item) => ({
    "نوع التنبيه": item.status === "near_expiry" ? "قرب انتهاء" : "رصيد عند حد الطلب",
    "الصنف": item.itemName,
    "الكود": item.itemCode ?? "",
    "الشركة": item.company ?? "",
    "الرصيد الحالي": item.stock ?? "",
    "حد إعادة الطلب": item.reorderLevel ?? "",
    "مصدر الحد": item.reorderSource === "custom" ? "قاعدة مخصصة" : item.reorderSource === "file" ? "ملف المصدر" : "غير متاح",
    "رصيد الهدف": item.targetStock ?? "",
    "تاريخ الانتهاء": item.expiryDate ? new Intl.DateTimeFormat("ar-EG").format(item.expiryDate) : "",
    "الأيام للانتهاء": item.daysToExpiry ?? "",
    "الملاحظة": item.note,
  })));
  appendSheet(book, "طلبات مقترحة", operations.suggestions.map((item) => ({
    "الصنف": item.itemName,
    "الكود": item.itemCode ?? "",
    "الرصيد الحالي": item.currentStock ?? "",
    "حد إعادة الطلب": item.reorderLevel ?? "",
    "رصيد الهدف": item.targetStock ?? "",
    "الكمية المقترحة": item.suggestedQuantity ?? "",
    "مصدر القاعدة": item.reorderSource === "custom" ? "قاعدة مخصصة" : item.reorderSource === "file" ? "ملف المصدر" : "مبيعات الفترة",
    "سبب الاقتراح": item.reason,
  })));
  appendSheet(book, "قواعد مخصصة", Object.values(rules).map((rule) => ({
    "معرّف الصنف": rule.itemId,
    "حد إعادة الطلب": rule.reorderLevel,
    "رصيد الهدف": rule.targetStock ?? "",
    "آخر تعديل": new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(rule.updatedAt)),
  })));
  return book;
}

export function exportInventoryOperationsWorkbook(operations: InventoryOperations, rules: ReorderRules) {
  const book = buildInventoryOperationsWorkbook(operations, rules);
  XLSX.writeFile(book, `عمليات_المخزون_والطلبات_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
