/**
 * نبض العيادة التنفيذي — تصدير سجل تغييرات قواعد إعادة الطلب إلى Excel.
 * يولّد الملف محليًا من سجل التدقيق الفعلي ولا يرسل أي بيانات للخارج.
 */
import * as XLSX from "xlsx";
import type { ReorderRuleHistoryEntry } from "./reorderRules";

const actionLabels: Record<ReorderRuleHistoryEntry["action"], string> = {
  created: "إضافة قاعدة جديدة",
  updated: "تعديل قاعدة",
  removed: "إزالة قاعدة",
  imported: "استيراد من Excel",
  restored: "استعادة من نسخة محلية",
};

function fitColumns(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  return headers.map((header) => ({ wch: Math.min(42, Math.max(12, header.length + 3, ...rows.map((row) => String(row[header] ?? "").length + 2))) }));
}

export function buildAuditWorkbook(history: ReorderRuleHistoryEntry[]) {
  const book = XLSX.utils.book_new();
  const createdAt = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const overview = [
    { "المؤشر": "وقت إنشاء الملف", "القيمة": createdAt },
    { "المؤشر": "إجمالي الأحداث المسجلة", "القيمة": history.length },
    { "المؤشر": "المصدر", "القيمة": "سجل التغييرات المحلي على هذا المتصفح" },
    { "المؤشر": "التغطية", "القيمة": "آخر 300 حدث بحد أقصى، الأحدث أولًا." },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(overview);
  summarySheet["!cols"] = fitColumns(overview);
  XLSX.utils.book_append_sheet(book, summarySheet, "ملخص السجل");

  const rows = history.map((entry) => ({
    "الوقت": new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.at)),
    "نوع التغيير": actionLabels[entry.action] ?? entry.action,
    "معرّف الصنف": entry.itemId,
    "حد إعادة الطلب السابق": entry.before?.reorderLevel ?? "",
    "رصيد الهدف السابق": entry.before?.targetStock ?? "",
    "حد إعادة الطلب الجديد": entry.after?.reorderLevel ?? "",
    "رصيد الهدف الجديد": entry.after?.targetStock ?? "",
    "المصدر": entry.source,
  }));
  const detailSheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "سجل التغييرات": "لا توجد أحداث مسجلة بعد." }]);
  detailSheet["!cols"] = fitColumns(rows.length ? rows : [{ "سجل التغييرات": "لا توجد أحداث مسجلة بعد." }]);
  detailSheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(detailSheet["!ref"] ?? "A1")) };
  XLSX.utils.book_append_sheet(book, detailSheet, "تفاصيل الأحداث");
  return book;
}

export function exportAuditWorkbook(history: ReorderRuleHistoryEntry[]) {
  const book = buildAuditWorkbook(history);
  XLSX.writeFile(book, `سجل_تغييرات_قواعد_إعادة_الطلب_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
