/**
 * نبض العيادة التنفيذي — استيراد جماعي لقواعد إعادة الطلب.
 * يقبل ورقة «قواعد مخصصة» المصدّرة من النظام أو أعمدة عربية/إنجليزية متكافئة، محليًا فقط.
 */
import * as XLSX from "xlsx";
import type { ReorderRule } from "./inventoryEngine";

export interface ReorderRulesImportResult {
  fileName: string;
  sheetName: string;
  readRows: number;
  accepted: Array<Omit<ReorderRule, "updatedAt">>;
  rejected: Array<{ row: number; reason: string }>;
}

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("ar-EG").replace(/[\s_\-–—]+/g, "");
const isAny = (value: string, options: string[]) => options.map(normalize).includes(normalize(value));
const digits = (value: unknown) => String(value ?? "").replace(/[٠-٩٫٬]/g, (char) => ({ "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," }[char] ?? char)).replace(/[,\s]/g, "");
const numberValue = (value: unknown) => { const parsed = Number(digits(value)); return Number.isFinite(parsed) ? parsed : undefined; };

function findColumn(headers: string[], names: string[]) { return headers.find((header) => isAny(header, names)); }

export async function inspectReorderRulesFile(file: File): Promise<ReorderRulesImportResult> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("اختر ملف Excel أو CSV بصيغة XLSX أو XLS أو CSV.");
  const data = await file.arrayBuffer();
  const book = XLSX.read(data, { type: "array", cellDates: true, raw: true });
  const sheetName = book.SheetNames.find((name) => normalize(name).includes(normalize("قواعد مخصصة"))) ?? book.SheetNames[0];
  if (!sheetName) throw new Error("لم نعثر على ورقة بيانات داخل الملف.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[sheetName], { defval: "", raw: true });
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const idColumn = findColumn(headers, ["معرّف الصنف", "معرف الصنف", "كود الصنف", "الكود", "الصنف", "item id", "item code", "item", "sku"]);
  const levelColumn = findColumn(headers, ["حد إعادة الطلب", "حد الطلب", "reorder level", "reorder point", "minimum stock"]);
  const targetColumn = findColumn(headers, ["رصيد الهدف", "المخزون الهدف", "target stock", "target"]);
  if (!idColumn || !levelColumn) throw new Error("يحتاج الملف عمود «معرّف الصنف» أو «الكود» وعمود «حد إعادة الطلب» على الأقل.");
  const accepted: ReorderRulesImportResult["accepted"] = [];
  const rejected: ReorderRulesImportResult["rejected"] = [];
  rows.forEach((row, index) => {
    const itemId = String(row[idColumn] ?? "").trim();
    const reorderLevel = numberValue(row[levelColumn]);
    const targetStock = targetColumn ? numberValue(row[targetColumn]) : undefined;
    if (!itemId) { rejected.push({ row: index + 2, reason: "معرّف الصنف فارغ." }); return; }
    if (reorderLevel === undefined || reorderLevel < 0) { rejected.push({ row: index + 2, reason: "حد إعادة الطلب غير صالح." }); return; }
    if (targetColumn && row[targetColumn] !== "" && (targetStock === undefined || targetStock < reorderLevel)) { rejected.push({ row: index + 2, reason: "رصيد الهدف يجب أن يساوي الحد أو يزيد عنه." }); return; }
    accepted.push({ itemId, reorderLevel, targetStock });
  });
  return { fileName: file.name, sheetName, readRows: rows.length, accepted, rejected };
}
