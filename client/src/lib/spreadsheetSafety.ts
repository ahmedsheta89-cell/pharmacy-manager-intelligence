import * as XLSX from "xlsx";

export const MAX_SPREADSHEET_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_SPREADSHEET_SHEETS = 24;
export const MAX_SPREADSHEET_CELLS_PER_SHEET = 250_000;
export const MAX_SPREADSHEET_CELLS_TOTAL = 500_000;

export function assertSpreadsheetFileSafety(file: Pick<File, "name" | "size">) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("اختر ملف Excel أو CSV بصيغة XLSX أو XLS أو CSV.");
  if (file.size <= 0) throw new Error("الملف فارغ ولا يمكن مراجعته.");
  if (file.size > MAX_SPREADSHEET_FILE_BYTES) throw new Error("حجم الملف يتجاوز 20 ميجابايت. قسّم التصدير إلى ملفات أصغر ثم أعد المحاولة.");
}

export function assertWorkbookSafety(workbook: Pick<XLSX.WorkBook, "SheetNames" | "Sheets">) {
  if (workbook.SheetNames.length === 0) throw new Error("لم نعثر على أي شيت قابل للمراجعة داخل الملف.");
  if (workbook.SheetNames.length > MAX_SPREADSHEET_SHEETS) throw new Error("يحتوي الملف على عدد كبير من الشيتات. اختر ملفًا لا يتجاوز 24 شيتًا.");
  let totalCells = 0;
  for (const name of workbook.SheetNames) {
    const rangeRef = workbook.Sheets[name]?.["!ref"];
    if (!rangeRef) continue;
    const range = XLSX.utils.decode_range(rangeRef);
    const cells = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (cells > MAX_SPREADSHEET_CELLS_PER_SHEET) throw new Error(`الشيت «${name}» يتجاوز حد 250,000 خلية للمراجعة الآمنة.`);
    totalCells += cells;
    if (totalCells > MAX_SPREADSHEET_CELLS_TOTAL) throw new Error("إجمالي خلايا الملف يتجاوز 500,000 خلية. قسّم التصدير إلى ملفات أصغر ثم أعد المحاولة.");
  }
}
