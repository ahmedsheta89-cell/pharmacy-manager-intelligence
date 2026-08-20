/**
 * طبقة فحص خام لملفات Excel/CSV. لا تطبق هذه الطبقة أي تحويل على البيانات،
 * بل تصف البنية كما وجدتها كي يراجع المديرها قبل بناء خريطة التحليل.
 */
import * as XLSX from "xlsx";
import { toDate, toNumber } from "./pharmacyEngine";

export type StructuralWarningKind = "merged_cells" | "hidden_rows" | "hidden_columns" | "multiple_header_rows" | "offset_header" | "numeric_header" | "duplicate_header" | "empty_column" | "mixed_values";

export type StructuralWarning = {
  kind: StructuralWarningKind;
  severity: "info" | "review" | "attention";
  message: string;
};

export type HeaderCandidate = { rowIndex: number; score: number; nonEmptyCells: number; textCells: number; matchedLikeHeaders: number };

export type ColumnProfile = {
  index: number;
  letter: string;
  displayHeader: string;
  rawHeader: string;
  samples: string[];
  nonEmptyCount: number;
  nullRate: number;
  typeDistribution: { text: number; numeric: number; date: number; boolean: number; mixed: boolean };
  isHidden: boolean;
  isNumericHeader: boolean;
  isDuplicateHeader: boolean;
};

export type SheetStructureReview = {
  name: string;
  visibility: "visible" | "hidden" | "veryHidden";
  dimensions: { rows: number; columns: number };
  headerCandidates: HeaderCandidate[];
  selectedHeaderRow: number;
  suggestedHeaderRows: number[];
  mergedRanges: string[];
  hiddenRows: number[];
  hiddenColumns: string[];
  columns: ColumnProfile[];
  warnings: StructuralWarning[];
  rawPreview: unknown[][];
};

export type WorkbookStructureReview = {
  fileName: string;
  fileFingerprintHint: string;
  inspectedAt: string;
  sheets: SheetStructureReview[];
  warnings: StructuralWarning[];
};

const isPresent = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== "";

function asText(value: unknown): string {
  if (value instanceof Date) return value.toLocaleDateString("ar-EG");
  return String(value ?? "").trim();
}

function candidateForRow(row: unknown[], rowIndex: number): HeaderCandidate {
  const values = row.filter(isPresent);
  const labels = values.map(asText);
  const textCells = values.filter((value) => typeof value === "string" && toNumber(value as never) === undefined && !toDate(value as never)).length;
  const distinct = new Set(labels.map((value) => value.toLowerCase())).size;
  const headerTerms = /(اسم|صنف|كود|رمز|رصيد|مخزون|كمية|سعر|بيع|شراء|تكلفة|تاريخ|شركة|فرع|فاتورة|sales|stock|item|price|cost|date|code|quantity|balance|product)/i;
  const matchedLikeHeaders = labels.filter((value) => headerTerms.test(value)).length;
  // العنصر النصي والاختلاف بين العناوين يرجحان الرأس. وجود قيم رقمية كثيرة يخفض الاحتمال.
  const score = Math.round(Math.min(100, (textCells * 13) + (matchedLikeHeaders * 18) + (distinct / Math.max(labels.length, 1)) * 14 - Math.max(0, labels.length - 32) * 1.5));
  return { rowIndex, score, nonEmptyCells: values.length, textCells, matchedLikeHeaders };
}

function getSheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: true });
}

function warning(kind: StructuralWarningKind, severity: StructuralWarning["severity"], message: string): StructuralWarning {
  return { kind, severity, message };
}

function inspectSheet(name: string, sheet: XLSX.WorkSheet, visibility: SheetStructureReview["visibility"]): SheetStructureReview {
  const matrix = getSheetMatrix(sheet);
  const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"] as string) : { e: { r: Math.max(matrix.length - 1, 0), c: Math.max(...matrix.map((row) => row.length), 1) - 1 } };
  const columnsCount = Math.max(range.e.c + 1, ...matrix.map((row) => row.length), 0);
  const candidates = matrix.slice(0, Math.min(60, matrix.length)).map((row, rowIndex) => candidateForRow(row, rowIndex)).filter((candidate) => candidate.nonEmptyCells > 0).sort((a, b) => b.score - a.score || b.nonEmptyCells - a.nonEmptyCells);
  const selected = candidates[0] ?? { rowIndex: 0, score: 0, nonEmptyCells: 0, textCells: 0, matchedLikeHeaders: 0 };
  const suggestedHeaderRows = [selected.rowIndex];
  const previous = matrix[selected.rowIndex - 1] ?? [];
  if (selected.rowIndex > 0 && previous.filter(isPresent).length >= 2 && previous.filter(isPresent).length < selected.nonEmptyCells) suggestedHeaderRows.unshift(selected.rowIndex - 1);
  const rawHeaders = Array.from({ length: columnsCount }, (_, index) => asText(matrix[selected.rowIndex]?.[index]) || `عمود ${index + 1}`);
  const normalizedHeaderCounts = new Map<string, number>();
  rawHeaders.forEach((header) => normalizedHeaderCounts.set(header.toLowerCase(), (normalizedHeaderCounts.get(header.toLowerCase()) ?? 0) + 1));
  const hiddenRows = (sheet["!rows"] as Array<{ hidden?: boolean }> | undefined)?.flatMap((row, index) => row?.hidden ? [index + 1] : []) ?? [];
  const hiddenColumns = (sheet["!cols"] as Array<{ hidden?: boolean }> | undefined)?.flatMap((column, index) => column?.hidden ? [XLSX.utils.encode_col(index)] : []) ?? [];
  const columns = Array.from({ length: columnsCount }, (_, index): ColumnProfile => {
    const values = matrix.slice(selected.rowIndex + 1).map((row) => row[index]).filter(isPresent);
    let text = 0; let numeric = 0; let date = 0; let boolean = 0;
    values.forEach((value) => {
      if (typeof value === "boolean") boolean += 1;
      else if (value instanceof Date || (typeof value === "number" && value > 1000 && value < 100000 && toDate(value as never))) date += 1;
      else if (toNumber(value as never) !== undefined) numeric += 1;
      else text += 1;
    });
    const nonZeroKinds = [text, numeric, date, boolean].filter((count) => count > 0).length;
    const rawHeader = rawHeaders[index];
    return {
      index,
      letter: XLSX.utils.encode_col(index),
      displayHeader: rawHeader,
      rawHeader,
      samples: values.slice(0, 5).map(asText).map((value) => value.slice(0, 65)),
      nonEmptyCount: values.length,
      nullRate: matrix.length > selected.rowIndex + 1 ? Math.round(((matrix.length - selected.rowIndex - 1 - values.length) / Math.max(matrix.length - selected.rowIndex - 1, 1)) * 100) : 100,
      typeDistribution: { text, numeric, date, boolean, mixed: nonZeroKinds > 1 },
      isHidden: hiddenColumns.includes(XLSX.utils.encode_col(index)),
      isNumericHeader: toNumber(rawHeader as never) !== undefined,
      isDuplicateHeader: (normalizedHeaderCounts.get(rawHeader.toLowerCase()) ?? 0) > 1,
    };
  });
  const mergedRanges = ((sheet["!merges"] as XLSX.Range[] | undefined) ?? []).map((merge) => XLSX.utils.encode_range(merge));
  const warnings: StructuralWarning[] = [];
  if (mergedRanges.length) warnings.push(warning("merged_cells", "review", `تم العثور على ${mergedRanges.length} نطاق دمج. ستظل القيم الأصلية معروضة، ولا يُفك الدمج أو يُنسخ تلقائياً.`));
  if (hiddenRows.length) warnings.push(warning("hidden_rows", "review", `يوجد ${hiddenRows.length} صف مخفي؛ يعرضه المركز كجزء من فحص البنية ولا يستبعده تلقائياً.`));
  if (hiddenColumns.length) warnings.push(warning("hidden_columns", "review", `يوجد ${hiddenColumns.length} عمود مخفي؛ لا يُستخدم في التحليل إلا إذا قرر المدير ذلك.`));
  if (suggestedHeaderRows.length > 1) warnings.push(warning("multiple_header_rows", "attention", "تم رصد رأس محتمل متعدد الصفوف. لا يتم دمج العناوين تلقائياً؛ راجع العناوين ومطابقة الأعمدة."));
  if (columns.some((column) => column.isNumericHeader)) warnings.push(warning("numeric_header", "attention", "هناك عنوان رقمي؛ تم اعتباره مشبوهاً ولم يُمنح دلالة تلقائية."));
  if (columns.some((column) => column.isDuplicateHeader)) warnings.push(warning("duplicate_header", "review", "هناك عناوين أعمدة متكررة. يستعمل المركز حرف العمود لتمييز كل عمود عند الاعتماد."));
  if (columns.some((column) => column.nonEmptyCount === 0)) warnings.push(warning("empty_column", "info", "تم رصد أعمدة فارغة بالكامل بعد صف الرأس."));
  if (columns.some((column) => column.typeDistribution.mixed)) warnings.push(warning("mixed_values", "review", "بعض الأعمدة تحوي أكثر من نوع قيمة؛ راجع العينة قبل اعتماد نوع الحقل."));
  return {
    name,
    visibility,
    dimensions: { rows: Math.max(matrix.length, range.e.r + 1), columns: columnsCount },
    headerCandidates: candidates.slice(0, 5),
    selectedHeaderRow: selected.rowIndex,
    suggestedHeaderRows,
    mergedRanges,
    hiddenRows,
    hiddenColumns,
    columns,
    warnings,
    rawPreview: matrix.slice(0, Math.min(75, matrix.length)).map((row) => Array.from({ length: columnsCount }, (_, index) => row[index] ?? null)),
  };
}

export async function inspectWorkbookStructure(file: File): Promise<WorkbookStructureReview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, raw: true, cellStyles: true });
  const sheets = workbook.SheetNames.map((name) => {
    const state = workbook.Workbook?.Sheets?.[workbook.SheetNames.indexOf(name)]?.Hidden;
    const visibility: SheetStructureReview["visibility"] = state === 2 ? "veryHidden" : state === 1 ? "hidden" : "visible";
    return inspectSheet(name, workbook.Sheets[name], visibility);
  });
  const warnings = sheets.flatMap((sheet) => sheet.warnings.map((item) => ({ ...item, message: `${sheet.name}: ${item.message}` })));
  return {
    fileName: file.name,
    fileFingerprintHint: `${file.name}|${file.size}|${file.lastModified}`,
    inspectedAt: new Date().toISOString(),
    sheets,
    warnings,
  };
}
