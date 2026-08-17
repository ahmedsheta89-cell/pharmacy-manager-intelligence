/**
 * نبض العيادة التنفيذي — استيراد جماعي مرن لقواعد إعادة الطلب.
 * يطابق قوالب مركز الذكاء وقوالب المخزون العربية والإنجليزية داخل المتصفح فقط.
 */
import * as XLSX from "xlsx";
import type { ReorderRule } from "./inventoryEngine";

export interface ReorderRulesImportResult {
  fileName: string;
  sheetName: string;
  templateLabel: string;
  headerRow: number;
  readRows: number;
  accepted: Array<Omit<ReorderRule, "updatedAt">>;
  rejected: Array<{ row: number; reason: string }>;
}

type ColumnMap = { itemId?: number; reorderLevel?: number; targetStock?: number; templateLabel: string };
const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("ar-EG").replace(/[\s_\-–—./\\]+/g, "");
const includesAny = (value: unknown, options: string[]) => options.map(normalize).includes(normalize(value));
const digits = (value: unknown) => String(value ?? "").replace(/[٠-٩٫٬]/g, (char) => ({ "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," }[char] ?? char)).replace(/[,\s]/g, "");
const numberValue = (value: unknown) => { const parsed = Number(digits(value)); return Number.isFinite(parsed) ? parsed : undefined; };
const itemAliases = ["معرّف الصنف", "معرف الصنف", "كود الصنف", "كود المنتج", "رقم الصنف", "رمز الصنف", "باركود", "الباركود", "الصنف", "اسم الصنف", "اسم المنتج", "sku", "item id", "item code", "product code", "product id", "item no", "barcode", "item name", "product name", "description"];
const levelAliases = ["حد إعادة الطلب", "حد الطلب", "حد المخزون", "الحد الأدنى", "نقطة إعادة الطلب", "reorder level", "reorder point", "minimum stock", "minimum level", "min stock", "min qty", "reorder qty"];
const targetAliases = ["رصيد الهدف", "المخزون الهدف", "الحد الأعلى", "المخزون المستهدف", "target stock", "target", "maximum stock", "max stock", "stock target", "desired stock"];

function templateFor(headers: unknown[]): ColumnMap {
  const find = (names: string[]) => headers.findIndex((header) => includesAny(header, names));
  const itemId = find(itemAliases); const reorderLevel = find(levelAliases); const targetStock = find(targetAliases);
  const text = headers.map(normalize).join("|");
  const templateLabel = text.includes(normalize("معرّف الصنف")) ? "قالب مركز ذكاء الصيدلية" : text.includes("sku") || text.includes("reorderpoint") ? "قالب مخزون إنجليزي" : "قالب مخزون عربي/عام";
  return { itemId: itemId >= 0 ? itemId : undefined, reorderLevel: reorderLevel >= 0 ? reorderLevel : undefined, targetStock: targetStock >= 0 ? targetStock : undefined, templateLabel };
}

function detectSheet(book: XLSX.WorkBook) {
  for (const sheetName of book.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[sheetName], { header: 1, defval: "", raw: true });
    for (let index = 0; index < Math.min(grid.length, 12); index += 1) {
      const mapping = templateFor(grid[index] ?? []);
      if (mapping.itemId !== undefined && mapping.reorderLevel !== undefined) return { sheetName, grid, headerIndex: index, mapping };
    }
  }
  return undefined;
}

export async function inspectReorderRulesFile(file: File): Promise<ReorderRulesImportResult> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("اختر ملف Excel أو CSV بصيغة XLSX أو XLS أو CSV.");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: true }); const found = detectSheet(book);
  if (!found || found.mapping.itemId === undefined || found.mapping.reorderLevel === undefined) throw new Error("لم نتعرّف على قالب القواعد. تحتاج الأعمدة إلى معرّف أو كود/اسم الصنف وإلى حد إعادة الطلب على الأقل.");
  const { sheetName, grid, headerIndex, mapping } = found; const accepted: ReorderRulesImportResult["accepted"] = []; const rejected: ReorderRulesImportResult["rejected"] = [];
  grid.slice(headerIndex + 1).forEach((row, offset) => {
    if (!row.some((value) => String(value ?? "").trim())) return;
    const rowNumber = headerIndex + offset + 2; const itemId = String(row[mapping.itemId!] ?? "").trim(); const reorderLevel = numberValue(row[mapping.reorderLevel!]); const targetCell = mapping.targetStock === undefined ? "" : row[mapping.targetStock]; const targetStock = mapping.targetStock === undefined ? undefined : numberValue(targetCell);
    if (!itemId) { rejected.push({ row: rowNumber, reason: "معرّف أو كود أو اسم الصنف فارغ." }); return; }
    if (reorderLevel === undefined || reorderLevel < 0) { rejected.push({ row: rowNumber, reason: "حد إعادة الطلب غير صالح." }); return; }
    if (mapping.targetStock !== undefined && String(targetCell ?? "").trim() !== "" && (targetStock === undefined || targetStock < reorderLevel)) { rejected.push({ row: rowNumber, reason: "رصيد الهدف يجب أن يساوي الحد أو يزيد عنه." }); return; }
    accepted.push({ itemId, reorderLevel, targetStock });
  });
  return { fileName: file.name, sheetName, templateLabel: mapping.templateLabel, headerRow: headerIndex + 1, readRows: grid.slice(headerIndex + 1).filter((row) => row.some((value) => String(value ?? "").trim())).length, accepted, rejected };
}
