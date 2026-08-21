import { useLayoutEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, ChevronLeft, Download, Eye, FileSpreadsheet, LockKeyhole, MousePointer2, Redo2, Save, ShieldCheck, SlidersHorizontal, Split, TableProperties, Trash2, Undo2, X } from "lucide-react";
import {
  approveAllSuggestions,
  approveSheetSuggestions,
  getImportReadiness,
  mappingLabel,
  setColumnMapping,
  type MappingChoice,
} from "@/lib/importReview";
import { applySheetEditorConfig, fieldArabicName, formatNumber, type CanonicalField, type ImportInspection, type SheetEditorConfig, type SheetInspection } from "@/lib/pharmacyEngine";
import type { WorkbookStructureReview } from "@/lib/excelInspector";
import { createImportAuditRecord, exportImportAuditMap, loadImportAuditLog, type ImportAuditRecord } from "@/lib/importAuditLog";
import type { PriceMatchReport } from "@/lib/multiPeriodImport";
import type { ColumnMapTemplate } from "@/lib/columnMapTemplates";

const ALL_FIELDS = Object.entries(fieldArabicName) as Array<[CanonicalField, string]>;

type Props = {
  inspection: ImportInspection;
  structure?: WorkbookStructureReview | null;
  selectedSheetIndex: number;
  onSheet: (index: number) => void;
  onChange: (inspection: ImportInspection) => void;
  onCancel: () => void;
  onConfirm: (audit: ImportAuditRecord) => void;
  onRequestPriceReview?: (file?: File) => Promise<void>;
  priceMatchReport?: PriceMatchReport | null;
  reviewKind?: "analysis" | "prices";
  columnMapTemplates?: ColumnMapTemplate[];
  onSaveColumnMapTemplate?: (name: string) => void;
  onDeleteColumnMapTemplate?: (id: string) => void;
};

function confidenceStyle(score: number) {
  if (score >= 85) return { label: "مرتفعة", className: "border-[#b9dfcd] bg-[#e9f7ef] text-[#207059]" };
  if (score >= 55) return { label: "متوسطة", className: "border-[#ecd99f] bg-[#fff8e5] text-[#8a6618]" };
  return { label: "منخفضة", className: "border-[#eccbc4] bg-[#fff2ef] text-[#a44c3e]" };
}

function decisionStyle(status?: string) {
  if (status === "approved") return "bg-[#e8f5ef] text-[#257059]";
  if (status === "overridden") return "bg-[#fff4dc] text-[#8c6312]";
  if (status === "ignored") return "bg-[#f1f3f1] text-[#697a74]";
  return "bg-[#fff0eb] text-[#a94d3e]";
}

function decisionLabel(status?: string) {
  return status === "approved" ? "معتمد" : status === "overridden" ? "تعديل مدير" : status === "ignored" ? "مستبعد" : "بانتظار القرار";
}

function uniqueKey(mapping: SheetInspection["mappings"][number]) {
  return mapping.dataColumn ?? `${mapping.sourceColumn}-${mapping.headerColumn ?? ""}`;
}

function columnIndex(column?: string) {
  if (!column) return -1;
  return column.toUpperCase().split("").reduce((result, letter) => (result * 26) + letter.charCodeAt(0) - 64, 0) - 1;
}

function valueText(value: unknown) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

type CellRange = { startRow: number; startColumn: number; endRow: number; endColumn: number };
type EditorHistoryEntry = { sheetName: string; config: SheetEditorConfig; description: string };

function snapshotEditorConfig(config: SheetEditorConfig): SheetEditorConfig {
  return {
    ...config,
    excludedRowNumbers: [...config.excludedRowNumbers],
    textTransforms: config.textTransforms.map((transform) => structuredClone(transform)),
    headerOverrides: { ...config.headerOverrides },
    cellOverrides: { ...config.cellOverrides },
    ignoredColumnIndexes: [...config.ignoredColumnIndexes],
    manualColumns: config.manualColumns.map((column) => ({ ...column })),
    manualRows: config.manualRows.map((row) => ({ ...row })),
  };
}

function excelColumnLetter(index: number) {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function normalizeRange(selection: CellRange) {
  return {
    firstRow: Math.min(selection.startRow, selection.endRow),
    lastRow: Math.max(selection.startRow, selection.endRow),
    firstColumn: Math.min(selection.startColumn, selection.endColumn),
    lastColumn: Math.max(selection.startColumn, selection.endColumn),
  };
}

export function ImportReviewCenter({ inspection, structure, selectedSheetIndex, onSheet, onChange, onCancel, onConfirm, onRequestPriceReview, priceMatchReport, reviewKind = "analysis", columnMapTemplates = [], onSaveColumnMapTemplate, onDeleteColumnMapTemplate }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [previewRows, setPreviewRows] = useState(30);
  const [auditHistory] = useState(() => loadImportAuditLog());
  const [reviewedSheets, setReviewedSheets] = useState<Record<string, boolean>>({});
  const [columnTemplateName, setColumnTemplateName] = useState("برنامج الصيدلية");
  const [templateSavedName, setTemplateSavedName] = useState("");
  const [rowToToggle, setRowToToggle] = useState("");
  const [cellRange, setCellRange] = useState<CellRange | null>(null);
  const [rangeDragging, setRangeDragging] = useState(false);
  const [mergeSources, setMergeSources] = useState<string[]>([]);
  const [mergeTarget, setMergeTarget] = useState("عمود مدمج");
  const [mergeSeparator, setMergeSeparator] = useState(" ");
  const [splitSource, setSplitSource] = useState("");
  const [splitTarget, setSplitTarget] = useState("أجزاء العمود");
  const [splitSeparator, setSplitSeparator] = useState("-");
  const [splitParts, setSplitParts] = useState(2);
  const [editorHistory, setEditorHistory] = useState<EditorHistoryEntry[]>([]);
  const [editorFuture, setEditorFuture] = useState<EditorHistoryEntry[]>([]);
  const sheet = inspection.sheets[selectedSheetIndex] ?? inspection.sheets[0];
  const structural = structure?.sheets.find((item) => item.name === sheet?.name);
  const readiness = useMemo(() => getImportReadiness(inspection), [inspection]);
  if (!sheet) return null;

  const applyChoice = (mapping: SheetInspection["mappings"][number], value: string) => {
    applyInspectionChange(setColumnMapping(inspection, sheet.name, mapping.dataColumn, mapping.sourceColumn, value as MappingChoice));
  };
  const exportMap = () => exportImportAuditMap(createImportAuditRecord(inspection, structure));
  const rawRows = structural?.rawPreview ?? [];
  const visibleRawRows = rawRows.slice(0, previewRows);
  const headerRow = structural?.selectedHeaderRow ?? sheet.headerRowIndex;
  const originalColumns = structural?.columns ?? sheet.headers.map((header, index) => ({ letter: String(index + 1), rawHeader: header, displayHeader: header, isHidden: false, samples: [], nullRate: 0, typeDistribution: { text: 0, numeric: 0, date: 0, boolean: 0, mixed: false }, index, nonEmptyCount: 0, isNumericHeader: false, isDuplicateHeader: false }));
  const comparedSheets = inspection.sheets.filter((item) => item.mappings.length > 0).map((item) => item.name);
  const currentSheetReviewed = Boolean(reviewedSheets[sheet.name]);
  const allSheetsReviewed = comparedSheets.length > 0 && comparedSheets.every((name) => reviewedSheets[name]);
  const canConfirm = readiness.ready && allSheetsReviewed;
  const sourceMatrix = sheet.sourceMatrix ?? rawRows;
  const sourceColumnCount = Math.max(...sourceMatrix.map((row) => row.length), 1);
  const editorConfig: SheetEditorConfig = sheet.editorConfig ?? {
    headerRowIndex: headerRow,
    dataStartRowIndex: headerRow + 1,
    firstDataColumnIndex: 0,
    lastDataRowIndex: Math.max(sourceMatrix.length - 1, headerRow + 1),
    lastDataColumnIndex: Math.max(...sourceMatrix.map((row) => row.length), 1) - 1,
    excludedRowNumbers: [],
    textTransforms: [],
    headerOverrides: {},
    cellOverrides: {},
    ignoredColumnIndexes: [],
    manualColumns: [],
    manualRows: [],
  };
  const comparisonStart = Math.min(Math.max(editorConfig.dataStartRowIndex, 0), sourceMatrix.length);
  const comparisonSourceRows = sourceMatrix.slice(comparisonStart).map((row, index) => ({ values: row, rowNumber: comparisonStart + index + 1 }))
    .filter((item) => !editorConfig.excludedRowNumbers.includes(item.rowNumber)).slice(0, 5);
  const mappedFields = sheet.mappings.filter((mapping) => mapping.field !== "unknown" && mapping.approvalStatus !== "ignored" && columnIndex(mapping.dataColumn) >= 0);
  const applyInspectionChange = (next: ImportInspection, resetAll = false) => {
    setReviewedSheets((current) => resetAll ? {} : { ...current, [sheet.name]: false });
    setTemplateSavedName("");
    onChange(next);
  };
  const applyEditorConfig = (patch: Partial<SheetEditorConfig>) => {
    applyInspectionChange(applySheetEditorConfig(inspection, sheet.name, patch), true);
  };
  const updateEditor = (patch: Partial<SheetEditorConfig>, description = "تعديل إعدادات قراءة الشيت") => {
    setEditorHistory((current) => [...current, { sheetName: sheet.name, config: snapshotEditorConfig(editorConfig), description }].slice(-40));
    setEditorFuture([]);
    applyEditorConfig(patch);
  };
  const undoEditor = () => {
    const previous = [...editorHistory].reverse().find((entry) => entry.sheetName === sheet.name);
    if (!previous) return;
    setEditorHistory((current) => {
      const index = current.map((entry) => entry.sheetName).lastIndexOf(sheet.name);
      return index < 0 ? current : current.filter((_, entryIndex) => entryIndex !== index);
    });
    setEditorFuture((current) => [{ sheetName: sheet.name, config: snapshotEditorConfig(editorConfig), description: previous.description }, ...current].slice(0, 40));
    applyEditorConfig(snapshotEditorConfig(previous.config));
  };
  const redoEditor = () => {
    const next = editorFuture.find((entry) => entry.sheetName === sheet.name);
    if (!next) return;
    setEditorFuture((current) => current.filter((entry, index) => !(entry.sheetName === sheet.name && index === current.findIndex((candidate) => candidate.sheetName === sheet.name))));
    setEditorHistory((current) => [...current, { sheetName: sheet.name, config: snapshotEditorConfig(editorConfig), description: next.description }].slice(-40));
    applyEditorConfig(snapshotEditorConfig(next.config));
  };
  const editorSources = Array.from(new Set(sheet.mappings.map((mapping) => mapping.sourceColumn).filter(Boolean)));
  const activeRange = cellRange ? normalizeRange(cellRange) : null;
  const previewRangeRows = Math.min(sourceMatrix.length, 18);
  const previewRowIndexes = [
    ...Array.from({ length: previewRangeRows }, (_, rowIndex) => rowIndex),
    ...editorConfig.manualRows.map((_, index) => sourceMatrix.length + index),
  ];
  const previewRangeColumns = Math.min(sourceColumnCount + editorConfig.manualColumns.length, 12);
  const columnLetter = (index: number) => originalColumns[index]?.letter ?? excelColumnLetter(index);
  const rangeReference = activeRange
    ? `${originalColumns[activeRange.firstColumn]?.letter ?? activeRange.firstColumn + 1}${activeRange.firstRow + 1}:${originalColumns[activeRange.lastColumn]?.letter ?? activeRange.lastColumn + 1}${activeRange.lastRow + 1}`
    : "لم يحدد نطاق بعد";
  const historyForSheet = editorHistory.filter((entry) => entry.sheetName === sheet.name);
  const futureForSheet = editorFuture.filter((entry) => entry.sheetName === sheet.name);
  const editableHeaderValue = (columnIndex: number) => String(editorConfig.headerOverrides[columnIndex] ?? editorConfig.manualColumns[columnIndex - sourceColumnCount]?.title ?? sourceMatrix[editorConfig.headerRowIndex]?.[columnIndex] ?? "");
  const editableCellValue = (rowIndex: number, columnIndex: number) => String(editorConfig.cellOverrides[`${rowIndex}:${columnIndex}`] ?? sourceMatrix[rowIndex]?.[columnIndex] ?? "");
  const commitHeaderOverride = (columnIndex: number, value: string) => {
    const cleanValue = value.trim();
    const originalValue = String(editorConfig.manualColumns[columnIndex - sourceColumnCount]?.title ?? sourceMatrix[editorConfig.headerRowIndex]?.[columnIndex] ?? "").trim();
    const nextValue = !cleanValue || cleanValue === originalValue ? undefined : cleanValue;
    if (editorConfig.headerOverrides[columnIndex] === nextValue) return;
    const headerOverrides = { ...editorConfig.headerOverrides };
    if (nextValue === undefined) delete headerOverrides[columnIndex];
    else headerOverrides[columnIndex] = nextValue;
    updateEditor({ headerOverrides }, `تعديل عنوان العمود ${columnLetter(columnIndex)} إلى «${cleanValue || originalValue}»`);
  };
  const commitCellOverride = (rowIndex: number, columnIndex: number, value: string) => {
    const originalValue = valueText(sourceMatrix[rowIndex]?.[columnIndex]);
    const cellOverrides = { ...editorConfig.cellOverrides };
    const key = `${rowIndex}:${columnIndex}`;
    const nextValue = value === originalValue ? undefined : value;
    if (editorConfig.cellOverrides[key] === nextValue) return;
    if (nextValue === undefined) delete cellOverrides[key];
    else cellOverrides[key] = nextValue;
    updateEditor({ cellOverrides }, `تعديل الخلية ${columnLetter(columnIndex)}${rowIndex + 1}`);
  };
  const addManualColumn = () => {
    const columnIndex = sourceColumnCount + editorConfig.manualColumns.length;
    const title = `عمود محلي ${editorConfig.manualColumns.length + 1}`;
    updateEditor({
      manualColumns: [...editorConfig.manualColumns, { id: `manual-${Date.now()}`, title }],
      lastDataColumnIndex: Math.max(editorConfig.lastDataColumnIndex, columnIndex),
    }, `إضافة ${title}`);
  };
  const removeLastManualColumn = () => {
    if (!editorConfig.manualColumns.length) return;
    const columnIndex = sourceColumnCount + editorConfig.manualColumns.length - 1;
    const headerOverrides = { ...editorConfig.headerOverrides };
    delete headerOverrides[columnIndex];
    const cellOverrides = Object.fromEntries(Object.entries(editorConfig.cellOverrides).filter(([key]) => Number(key.split(":")[1]) !== columnIndex));
    updateEditor({
      manualColumns: editorConfig.manualColumns.slice(0, -1),
      lastDataColumnIndex: Math.min(editorConfig.lastDataColumnIndex, Math.max(editorConfig.firstDataColumnIndex, columnIndex - 1)),
      ignoredColumnIndexes: editorConfig.ignoredColumnIndexes.filter((index) => index !== columnIndex),
      headerOverrides,
      cellOverrides,
    }, `حذف العمود المحلي الأخير ${columnLetter(columnIndex)}`);
  };
  const addManualRow = () => {
    const rowIndex = sourceMatrix.length + editorConfig.manualRows.length;
    updateEditor({
      manualRows: [...editorConfig.manualRows, { id: `manual-row-${Date.now()}` }],
      lastDataRowIndex: Math.max(editorConfig.lastDataRowIndex, rowIndex),
    }, `إضافة صف محلي ${rowIndex + 1}`);
  };
  const removeLastManualRow = () => {
    if (!editorConfig.manualRows.length) return;
    const rowIndex = sourceMatrix.length + editorConfig.manualRows.length - 1;
    const cellOverrides = Object.fromEntries(Object.entries(editorConfig.cellOverrides).filter(([key]) => Number(key.split(":")[0]) !== rowIndex));
    updateEditor({
      manualRows: editorConfig.manualRows.slice(0, -1),
      lastDataRowIndex: Math.min(editorConfig.lastDataRowIndex, Math.max(editorConfig.dataStartRowIndex, rowIndex - 1)),
      excludedRowNumbers: editorConfig.excludedRowNumbers.filter((rowNumber) => rowNumber !== rowIndex + 1),
      cellOverrides,
    }, `حذف الصف المحلي الأخير ${rowIndex + 1}`);
  };
  const updateRangeColumnVisibility = (ignored: boolean) => {
    if (!activeRange) return;
    const columns = Array.from({ length: activeRange.lastColumn - activeRange.firstColumn + 1 }, (_, index) => activeRange.firstColumn + index);
    const ignoredColumnIndexes = ignored
      ? Array.from(new Set([...editorConfig.ignoredColumnIndexes, ...columns])).sort((first, second) => first - second)
      : editorConfig.ignoredColumnIndexes.filter((index) => !columns.includes(index));
    updateEditor({ ignoredColumnIndexes }, `${ignored ? "استبعاد" : "استعادة"} أعمدة النطاق ${rangeReference}`);
  };

  // حقول المعاينة تستخدم defaultValue كي لا يعاد بناؤها أثناء الكتابة. بعد التراجع
  // أو الإعادة نعيد مزامنة القيمة المرئية من لقطة الإعدادات المستعادة فورًا.
  useLayoutEffect(() => {
    const editorRoot = document.querySelector("#sheet-manual-editor");
    if (!editorRoot) return;
    const columnByLetter = new Map(Array.from({ length: previewRangeColumns }, (_, index) => [columnLetter(index), index]));
    editorRoot.querySelectorAll<HTMLInputElement>("input[aria-label]").forEach((input) => {
      const label = input.getAttribute("aria-label") ?? "";
      const headerMatch = /^عنوان العمود ([A-Z]+)$/.exec(label);
      const cellMatch = /^خلية ([A-Z]+)(\d+)$/.exec(label);
      const columnIndex = headerMatch ? columnByLetter.get(headerMatch[1]) : cellMatch ? columnByLetter.get(cellMatch[1]) : undefined;
      if (columnIndex === undefined || document.activeElement === input) return;
      const expected = headerMatch
        ? editableHeaderValue(columnIndex)
        : editableCellValue(Number(cellMatch?.[2]) - 1, columnIndex);
      if (input.value !== expected) input.value = expected;
    });
  }, [sheet.name, editorConfig.headerRowIndex, editorConfig.headerOverrides, editorConfig.cellOverrides, editorConfig.manualColumns, editorConfig.manualRows, originalColumns, previewRangeColumns, previewRangeRows, sourceMatrix]);

  return <main className="app-canvas min-h-screen p-3 sm:p-6" dir="rtl">
    <div className="mx-auto max-w-[1640px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] px-4 py-4 shadow-[0_10px_30px_rgba(28,73,61,.06)] sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#123c37] text-white"><TableProperties className="size-5" /></div>
          <div className="min-w-0"><h1 className="display-font truncate text-xl font-semibold text-[#173f38]">{reviewKind === "prices" ? "مراجعة ملف الأسعار" : "المرحلة 2: تدقيق وتحرير مصدر القرار"}</h1><p className="mt-1 truncate text-[11px] text-[#6c8279]">{inspection.fileName} · {Math.round(inspection.fileSize / 1024).toLocaleString("ar-EG")} ك.ب · التعديلات محلية ولا تخرج البيانات من المتصفح</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onCancel} className="rounded-xl border border-[#d6e4dd] bg-white px-3.5 py-2.5 text-xs font-bold text-[#43655b] hover:border-[#a7cabc]"><X className="ml-1 inline size-3.5" />إلغاء</button>
          <button onClick={exportMap} disabled={readiness.pendingColumns > 0} className="rounded-xl border border-[#bfd9ce] bg-[#eff8f2] px-3.5 py-2.5 text-xs font-bold text-[#245f4e] disabled:cursor-not-allowed disabled:opacity-45"><Download className="ml-1 inline size-3.5" />تصدير خريطة الاعتماد</button>
          {onRequestPriceReview && <label className="cursor-pointer rounded-xl border border-[#ead7aa] bg-[#fff9e9] px-3.5 py-2.5 text-xs font-bold text-[#805f14] hover:bg-[#fff2d4]"><FileSpreadsheet className="ml-1 inline size-3.5" />مراجعة ملف أسعار إضافي<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { void onRequestPriceReview(event.target.files?.[0]); event.target.value = ""; }} /></label>}
          <button onClick={() => setShowConfirm(true)} disabled={!canConfirm} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] disabled:cursor-not-allowed disabled:bg-[#8da59c]"><ShieldCheck className="ml-1 inline size-3.5" />بدء التحليل بعد الاعتماد <ArrowLeft className="mr-1 inline size-3.5" /></button>
        </div>
      </header>

      {reviewKind === "analysis" && <nav aria-label="مسار التحليل" className="mb-5 grid overflow-hidden rounded-2xl border border-[#d7e6de] bg-white shadow-[0_8px_24px_rgba(28,73,61,.04)] sm:grid-cols-3"><div className="flex items-center gap-3 border-b border-[#e5eee9] bg-[#f8fbf8] px-4 py-3 sm:border-b-0 sm:border-l"><span className="grid size-7 place-items-center rounded-lg bg-[#ddf0e5] text-[11px] font-bold text-[#1d7057]">✓</span><div><p className="text-[10px] font-bold text-[#648077]">01 · المصدر</p><p className="text-xs font-bold text-[#294f45]">تم اختيار الملف</p></div></div><div className="flex items-center gap-3 border-b border-[#e5eee9] bg-[#eef8f2] px-4 py-3 sm:border-b-0 sm:border-l"><span className="grid size-7 place-items-center rounded-lg bg-[#123c37] text-[11px] font-bold text-white">02</span><div><p className="text-[10px] font-bold text-[#1c7159]">الآن · تدقيق وتحرير</p><p className="text-xs font-bold text-[#294f45]">راجع الورقة وخريطة الحقول</p></div></div><div className="flex items-center gap-3 bg-[#f8fbf8] px-4 py-3"><span className={`grid size-7 place-items-center rounded-lg text-[11px] font-bold ${canConfirm ? "bg-[#dcefe4] text-[#1e6e55]" : "bg-[#edf1ee] text-[#77867f]"}`}>03</span><div><p className="text-[10px] font-bold text-[#648077]">الخطوة التالية</p><p className="text-xs font-bold text-[#294f45]">{canConfirm ? "التحليل جاهز للبدء" : "اعتماد المدير والتحليل"}</p></div></div></nav>}

      <section className={`mb-5 rounded-2xl border p-4 ${readiness.ready ? "border-[#b9dfcd] bg-[#eef9f2]" : "border-[#edd9ae] bg-[#fffaf0]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={`mt-0.5 grid size-8 place-items-center rounded-lg ${readiness.ready ? "bg-[#d8f0e2] text-[#226d55]" : "bg-[#fff0d0] text-[#9c6e19]"}`}><LockKeyhole className="size-4" /></div><div><p className="text-sm font-bold text-[#234d43]">بوابة اعتماد المدير</p><p className="mt-1 max-w-3xl text-xs leading-5 text-[#617a70]">الاقتراحات لا تُطبق تلقائيًا. راجع أسماء الأعمدة والعينات، ثم اعتمد الاقتراح أو عيّن الحقل المناسب أو استبعد العمود. لا يبدأ التحليل ما دام قرار واحد معلّقًا.</p></div></div><div className="flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-lg bg-white px-2.5 py-1.5 text-[#477167]">{readiness.approvedColumns} معتمد</span><span className="rounded-lg bg-white px-2.5 py-1.5 text-[#94701c]">{readiness.overriddenColumns} تعديل مدير</span><span className="rounded-lg bg-white px-2.5 py-1.5 text-[#718078]">{readiness.ignoredColumns} مستبعد</span>{readiness.pendingColumns > 0 && <span className="rounded-lg bg-[#fff0eb] px-2.5 py-1.5 text-[#a94d3e]">{readiness.pendingColumns} قرار معلّق</span>}</div></div>
        {!readiness.ready && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ebddb9] bg-white/70 px-3 py-2.5"><p className="text-[11px] text-[#775f1b]">{readiness.unresolvedCriticalFields.length ? `ينقص تعيين: ${readiness.unresolvedCriticalFields.join("، ")}.` : "اعتمد أو استبعد كل الأعمدة قبل المتابعة."}</p><button onClick={() => applyInspectionChange(approveAllSuggestions(inspection), true)} className="rounded-lg bg-[#173f38] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#17564c]"><Check className="ml-1 inline size-3.5" />اعتماد جميع الاقتراحات بعد المراجعة</button></div>}
        {readiness.ready && !allSheetsReviewed && <div className="mt-3 rounded-xl border border-[#d9d0a4] bg-[#fff9e8] px-3 py-2.5 text-[11px] leading-5 text-[#7b641b]">اكتملت قرارات الأعمدة، ويتبقى تأكيد معاينة الصفوف المصححة في {comparedSheets.filter((name) => !reviewedSheets[name]).length} شيت قبل تفعيل بدء التحليل.</div>}
        {priceMatchReport && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c7dfd2] bg-white/75 px-3 py-2.5 text-[11px] text-[#356457]"><span><b>آخر مطابقة أسعار معتمدة:</b> {priceMatchReport.matchRate.toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%</span><span>{formatNumber(priceMatchReport.matchedRecords)} سجل مطابق · {formatNumber(priceMatchReport.unmatchedRecords)} غير مطابق</span></div>}
      </section>

      {reviewKind === "analysis" && <section className="mb-5 overflow-hidden rounded-2xl border border-[#c8ded3] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.05)]"><div className="border-b border-[#e0ece5] bg-[#f0f8f3] px-4 py-3.5 sm:px-5"><p className="text-sm font-bold text-[#214a41]">مسار التحقق الإلزامي قبل التحليل</p><p className="mt-1 text-[11px] leading-5 text-[#6a8077]">افحص المقارنة المرئية، ثم اعتمد الخريطة، ثم احفظها باسم «برنامج الصيدلية» للاستخدام القادم.</p></div><div className="grid gap-px bg-[#dce9e2] md:grid-cols-3"><div className="bg-white p-4"><span className="text-[10px] font-bold text-[#7c671b]">01 · تحقق بصري</span><p className="mt-1 text-xs font-bold text-[#2d554a]">مقارنة المصدر والمصحح</p><p className="mt-1 text-[10px] leading-5 text-[#71857d]">{comparisonSourceRows.length ? `${comparisonSourceRows.length} صفوف عينة جاهزة للمراجعة أدناه.` : "لا تتوفر عينات كافية لهذا الشيت بعد."}</p></div><div className="bg-white p-4"><span className="text-[10px] font-bold text-[#7c671b]">02 · اعتماد مدير</span><p className="mt-1 text-xs font-bold text-[#2d554a]">تأكيد مقارنة الشيت</p><p className="mt-1 text-[10px] leading-5 text-[#71857d]">{currentSheetReviewed ? "تم تأكيد المقارنة لهذا الشيت." : "لن يتفعل بدء التحليل قبل تأكيد مقارنة الصفوف."}</p></div><div className="bg-white p-4"><span className="text-[10px] font-bold text-[#7c671b]">03 · حفظ القالب</span><p className="mt-1 text-xs font-bold text-[#2d554a]">قالب «برنامج الصيدلية»</p><p className="mt-1 text-[10px] leading-5 text-[#71857d]">{columnMapTemplates.some((template) => template.name === "برنامج الصيدلية") ? "القالب المحلي محفوظ؛ سيُفحص ترتيب الملفات القادمة تلقائيًا." : "يتفعل الحفظ بعد اعتماد الخريطة وتأكيد المقارنة."}</p></div></div></section>}

      <div className="grid gap-5 xl:grid-cols-[265px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] p-3.5 shadow-[0_10px_30px_rgba(28,73,61,.05)]">
          <p className="mb-3 px-1 text-[11px] font-bold tracking-wide text-[#6d8279]">شيتات الملف ({inspection.sheets.length})</p>
          <div className="space-y-2">{inspection.sheets.map((item, index) => {
            const active = index === selectedSheetIndex;
            const source = structure?.sheets.find((review) => review.name === item.name);
            return <button key={`${item.name}-${index}`} onClick={() => onSheet(index)} className={`w-full rounded-xl border p-3 text-right ${active ? "border-[#75ae9e] bg-[#eaf5ef]" : "border-transparent bg-[#f3f6f2] hover:border-[#d1e3da]"}`}><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold text-[#1e4a42]">{item.name}</span><span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#356457]">{formatNumber(item.rows)} × {formatNumber(item.columns)}</span></div><p className="mt-1.5 text-[10px] text-[#72867e]">رأس مقترح: صف {item.headerRowIndex + 1}{source?.visibility !== "visible" ? " · شيت مخفي" : ""}</p></button>;
          })}</div>
          <button onClick={() => applyInspectionChange(approveSheetSuggestions(inspection, sheet.name))} className="mt-4 w-full rounded-xl border border-[#bdddd0] bg-[#eff9f3] px-3 py-2.5 text-xs font-bold text-[#286b55] hover:bg-[#e2f3e9]"><Check className="ml-1 inline size-3.5" />اعتماد قرارات هذا الشيت</button>
          {auditHistory.length > 0 && <div className="mt-5 border-t border-[#e2ece6] pt-4"><p className="text-[11px] font-bold text-[#365e54]">آخر اعتماد محلي</p><p className="mt-1.5 text-[10px] leading-5 text-[#72867e]">{auditHistory[0].fileName}<br />{new Date(auditHistory[0].timestamp).toLocaleDateString("ar-EG")}</p></div>}
        </aside>

        <div className="flex min-w-0 flex-col gap-5">
          {(structural?.warnings ?? []).length > 0 && <section className="order-1 rounded-2xl border border-[#ead8ad] bg-[#fffaf0] p-4"><div className="flex items-center gap-2"><AlertCircle className="size-4 text-[#a67520]" /><p className="text-sm font-bold text-[#725817]">تنبيهات بنية الملف — لم يُطبق أي تعديل</p></div><div className="mt-3 grid gap-2 lg:grid-cols-2">{structural?.warnings.map((item, index) => <p key={`${item.kind}-${index}`} className="rounded-xl border border-[#f1e5c7] bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-[#725f35]"><b>{item.severity === "attention" ? "تدقيق مطلوب:" : item.severity === "review" ? "مراجعة:" : "ملاحظة:"}</b> {item.message}</p>)}</div></section>}

          <section id="sheet-manual-editor" className="order-2 overflow-hidden rounded-2xl border border-[#bddbcf] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.06)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dceae2] bg-[#eef8f2] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">ورقة العمل المحلية — عدّل ثم راجع ثم اعتمد</h2></div><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#637b71]">عدّل العناوين والقيم، أضف أو استبعد صفوفًا وأعمدة، ثم راجع خريطة الحقول واعتمدها. كل ما تراه هنا نسخة محلية؛ ملف Excel الأصلي لا يتغير.</p></div><span className="rounded-lg border border-[#b9dfcd] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#23705a]">تحكم يدوي كامل</span></div>
            <div className="grid gap-3 p-4 lg:grid-cols-3"><label className="rounded-xl border border-[#dce9e2] bg-white p-3"><span className="block text-[10px] font-bold text-[#53746a]">صف الرأس</span><span className="mt-1 block text-[9px] text-[#7d8f87]">الصف الذي يحتوي أسماء الأعمدة.</span><input type="number" min={1} max={Math.max(sourceMatrix.length, 1)} value={editorConfig.headerRowIndex + 1} onChange={(event) => updateEditor({ headerRowIndex: Math.max(0, Number(event.target.value) - 1) })} className="mt-2 w-full rounded-lg border border-[#ccded5] bg-[#fbfdfb] px-2.5 py-2 text-xs font-bold text-[#264f45]" /></label><label className="rounded-xl border border-[#dce9e2] bg-white p-3"><span className="block text-[10px] font-bold text-[#53746a]">ابدأ قراءة البيانات من صف</span><span className="mt-1 block text-[9px] text-[#7d8f87]">يمكنك تجاوز عناوين فرعية أو ملاحظات أعلى الجدول.</span><input type="number" min={editorConfig.headerRowIndex + 2} max={Math.max(sourceMatrix.length, 1)} value={editorConfig.dataStartRowIndex + 1} onChange={(event) => updateEditor({ dataStartRowIndex: Math.max(0, Number(event.target.value) - 1) })} className="mt-2 w-full rounded-lg border border-[#ccded5] bg-[#fbfdfb] px-2.5 py-2 text-xs font-bold text-[#264f45]" /></label><label className="rounded-xl border border-[#dce9e2] bg-white p-3"><span className="block text-[10px] font-bold text-[#53746a]">ابدأ من العمود</span><span className="mt-1 block text-[9px] text-[#7d8f87]">لتجاوز أعمدة جانبية لا تخص التحليل.</span><select value={editorConfig.firstDataColumnIndex} onChange={(event) => updateEditor({ firstDataColumnIndex: Number(event.target.value) })} className="mt-2 w-full rounded-lg border border-[#ccded5] bg-[#fbfdfb] px-2.5 py-2 text-xs font-bold text-[#264f45]">{originalColumns.map((column) => <option key={column.letter} value={column.index}>{column.letter} · {column.rawHeader || "بلا عنوان"}</option>)}</select></label></div>
            <div className="border-t border-[#e2ede6] bg-[#fbfdfb] px-4 py-3.5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold text-[#315a4f]">إدارة الصفوف المحلية</p><p className="mt-1 text-[10px] text-[#74877f]">أضف صفًا فارغًا لتكتب بياناته محليًا، أو أدخل رقم صف ظاهر لاستبعاده أو استعادته من القراءة.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={addManualRow} className="rounded-lg bg-[#173f38] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#17564c]">إضافة صف محلي</button><button type="button" onClick={removeLastManualRow} disabled={!editorConfig.manualRows.length} className="rounded-lg border border-[#e9c2b9] bg-[#fff5f2] px-3 py-2 text-[10px] font-bold text-[#9a4838] disabled:cursor-not-allowed disabled:opacity-45">حذف آخر صف محلي</button><input value={rowToToggle} inputMode="numeric" placeholder="رقم صف" onChange={(event) => setRowToToggle(event.target.value)} className="w-20 rounded-lg border border-[#ccded5] bg-white px-2.5 py-2 text-xs font-bold text-[#264f45]" aria-label="رقم صف Excel للاستبعاد" /><button onClick={() => { const rowNumber = Math.trunc(Number(rowToToggle)); const maximumRowNumber = sourceMatrix.length + editorConfig.manualRows.length; if (!Number.isFinite(rowNumber) || rowNumber <= editorConfig.dataStartRowIndex || rowNumber > maximumRowNumber) return; const existing = editorConfig.excludedRowNumbers.includes(rowNumber); updateEditor({ excludedRowNumbers: existing ? editorConfig.excludedRowNumbers.filter((item) => item !== rowNumber) : [...editorConfig.excludedRowNumbers, rowNumber] }, existing ? `استعادة الصف ${rowNumber}` : `استبعاد الصف ${rowNumber}`); setRowToToggle(""); }} className="rounded-lg border border-[#b9d8c9] bg-white px-3 py-2 text-[10px] font-bold text-[#23705a] hover:bg-[#f2faf5]">استبعاد أو استعادة</button></div></div>{editorConfig.excludedRowNumbers.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{editorConfig.excludedRowNumbers.map((rowNumber) => <button key={rowNumber} onClick={() => updateEditor({ excludedRowNumbers: editorConfig.excludedRowNumbers.filter((item) => item !== rowNumber) }, `استعادة الصف ${rowNumber}`)} className="rounded-lg border border-[#e9c2b9] bg-[#fff4f1] px-2.5 py-1.5 text-[10px] font-bold text-[#9a4838] hover:bg-[#ffebe7]">صف {rowNumber} مستبعد <X className="mr-1 inline size-3" /></button>)}</div> : <p className="mt-3 text-[10px] text-[#71857d]">لا توجد صفوف مستبعدة يدويًا.</p>}</div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[#e2ede6] bg-white px-4 py-3.5"><div><p className="text-xs font-bold text-[#315a4f]">إدارة الأعمدة المحلية</p><p className="mt-1 max-w-2xl text-[10px] leading-5 text-[#74877f]">أضف عمودًا فارغًا لتكتب قيمه محليًا، أو استبعد أعمدة المصدر من القراءة عبر النطاق أدناه. لا يُحذف أو يُرفع أي شيء إلى خارج المتصفح.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={addManualColumn} className="rounded-lg bg-[#173f38] px-3 py-2 text-[10px] font-bold text-white hover:bg-[#17564c]">إضافة عمود محلي</button><button type="button" onClick={removeLastManualColumn} disabled={!editorConfig.manualColumns.length} className="rounded-lg border border-[#e9c2b9] bg-[#fff5f2] px-3 py-2 text-[10px] font-bold text-[#9a4838] disabled:cursor-not-allowed disabled:opacity-45">حذف آخر عمود محلي</button></div>{editorConfig.ignoredColumnIndexes.length > 0 && <div className="w-full border-t border-[#e7eee9] pt-3"><p className="mb-2 text-[9px] font-bold text-[#6d7f77]">أعمدة مستبعدة محليًا من القراءة</p><div className="flex flex-wrap gap-2">{editorConfig.ignoredColumnIndexes.map((index) => <button key={index} type="button" onClick={() => updateEditor({ ignoredColumnIndexes: editorConfig.ignoredColumnIndexes.filter((item) => item !== index) }, `استعادة العمود ${columnLetter(index)}`)} className="rounded-lg border border-[#e9c2b9] bg-[#fff4f1] px-2.5 py-1.5 text-[10px] font-bold text-[#9a4838]">العمود {columnLetter(index)} مستبعد <X className="mr-1 inline size-3" /></button>)}</div></div>}</div>
            <div className="border-t border-[#dceae2] bg-[#f7fbf8] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex items-center gap-2"><MousePointer2 className="size-4 text-[#0b6b5b]" /><h3 className="text-xs font-bold text-[#315a4f]">تحديد نطاق خلايا بالسحب</h3></div><p className="mt-1 text-[10px] leading-5 text-[#71857d]">اضغط واسحب فوق الخلايا لاختيار نطاق من المصدر، ثم طبّقه كنطاق القراءة أو استبعد صفوفه. النطاق لا يغيّر أي قيمة داخل ملف Excel.</p></div>
                <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={undoEditor} disabled={!historyForSheet.length} data-history-count={historyForSheet.length} className="rounded-lg border border-[#c9dcd4] bg-white px-2.5 py-2 text-[10px] font-bold text-[#386257] disabled:cursor-not-allowed disabled:opacity-45"><Undo2 className="ml-1 inline size-3.5" />تراجع</button><button type="button" onClick={redoEditor} disabled={!futureForSheet.length} data-future-count={futureForSheet.length} className="rounded-lg border border-[#c9dcd4] bg-white px-2.5 py-2 text-[10px] font-bold text-[#386257] disabled:cursor-not-allowed disabled:opacity-45"><Redo2 className="ml-1 inline size-3.5" />إعادة</button></div>
              </div>
              <div className="mt-3 overflow-auto rounded-xl border border-[#d4e3db] bg-white" onPointerUp={() => setRangeDragging(false)}>
                <table className="min-w-max select-none text-right text-[10px]"><thead><tr><th className="sticky right-0 z-10 min-w-10 border-b border-l border-[#dce9e2] bg-[#eef7f1] px-2 py-2 text-[#6c8279]">#</th>{Array.from({ length: previewRangeColumns }, (_, columnIndex) => <th key={columnIndex} className="min-w-32 border-b border-l border-[#dce9e2] bg-[#e6f4ec] p-1.5 text-[#42675b]"><div className="mb-1 flex items-center justify-between px-1"><span>{columnLetter(columnIndex)}</span><span className="text-[8px] text-[#7b9187]">عنوان قابل للتعديل</span></div><input key={`header-${columnIndex}-${editableHeaderValue(columnIndex)}`} defaultValue={editableHeaderValue(columnIndex)} onBlur={(event) => commitHeaderOverride(columnIndex, event.target.value)} aria-label={`عنوان العمود ${columnLetter(columnIndex)}`} className="w-full rounded-md border border-[#bdd8cb] bg-white px-2 py-1.5 text-[10px] font-bold text-[#234f44] outline-none focus:border-[#0d765e] focus:ring-2 focus:ring-[#c5ead9]" /></th>)}</tr></thead><tbody>{previewRowIndexes.map((rowIndex) => <tr key={rowIndex}><th className="sticky right-0 z-[1] border-b border-l border-[#e4eee8] bg-[#f7faf8] px-2 py-1.5 text-[#6f837a]">{rowIndex + 1}</th>{Array.from({ length: previewRangeColumns }, (_, columnIndex) => {
                  const isSelected = activeRange && rowIndex >= activeRange.firstRow && rowIndex <= activeRange.lastRow && columnIndex >= activeRange.firstColumn && columnIndex <= activeRange.lastColumn;
                  const isHeaderRow = rowIndex === editorConfig.headerRowIndex;
                  return <td key={columnIndex} className={`border-b border-l border-[#eef3ef] p-0 ${isHeaderRow ? "bg-[#f0f8f3]" : isSelected ? "bg-[#ccebdd]" : "bg-white"}`}>{isHeaderRow ? <div className="min-h-8 px-2 py-1.5 text-[9px] font-bold text-[#507368]">صف العناوين — عدّله من الحقول أعلاه</div> : <input key={`cell-${rowIndex}-${columnIndex}-${editableCellValue(rowIndex, columnIndex)}`} defaultValue={editableCellValue(rowIndex, columnIndex)} aria-label={`خلية ${columnLetter(columnIndex)}${rowIndex + 1}`} onFocus={() => { setCellRange({ startRow: rowIndex, startColumn: columnIndex, endRow: rowIndex, endColumn: columnIndex }); setRangeDragging(true); }} onPointerEnter={() => { if (rangeDragging) setCellRange((current) => current ? { ...current, endRow: rowIndex, endColumn: columnIndex } : current); }} onBlur={(event) => { setRangeDragging(false); commitCellOverride(rowIndex, columnIndex, event.target.value); }} className={`block min-h-8 w-full max-w-36 truncate bg-transparent px-2 py-1.5 text-right outline-none focus:bg-[#e8f6ee] focus:ring-1 focus:ring-inset focus:ring-[#65a78e] ${isSelected ? "font-bold text-[#1e604b]" : "text-[#597168]"}`} />}</td>;
                })}</tr>)}</tbody></table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#dce9e2] bg-white px-3 py-2.5"><span className="text-[11px] font-bold text-[#315a4f]">النطاق المختار: <b className="text-[#0f735d]">{rangeReference}</b></span><div className="flex flex-wrap gap-2"><button type="button" disabled={!activeRange} onClick={() => activeRange && updateEditor({ dataStartRowIndex: Math.max(editorConfig.headerRowIndex + 1, activeRange.firstRow), firstDataColumnIndex: activeRange.firstColumn, lastDataRowIndex: activeRange.lastRow, lastDataColumnIndex: activeRange.lastColumn }, `تحديد نطاق القراءة ${rangeReference}`)} className="rounded-lg bg-[#173f38] px-2.5 py-1.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">استخدم النطاق للقراءة</button><button type="button" disabled={!activeRange} onClick={() => activeRange && updateEditor({ excludedRowNumbers: Array.from(new Set([...editorConfig.excludedRowNumbers, ...Array.from({ length: activeRange.lastRow - activeRange.firstRow + 1 }, (_, index) => activeRange.firstRow + index + 1).filter((rowNumber) => rowNumber > editorConfig.dataStartRowIndex)])) }, `استبعاد صفوف النطاق ${rangeReference}`)} className="rounded-lg border border-[#ebc9bf] bg-[#fff5f2] px-2.5 py-1.5 text-[10px] font-bold text-[#a25040] disabled:cursor-not-allowed disabled:opacity-45">استبعد صفوف النطاق</button><button type="button" disabled={!activeRange} onClick={() => activeRange && updateEditor({ excludedRowNumbers: editorConfig.excludedRowNumbers.filter((rowNumber) => rowNumber < activeRange.firstRow + 1 || rowNumber > activeRange.lastRow + 1) }, `استعادة صفوف النطاق ${rangeReference}`)} className="rounded-lg border border-[#c9dcd4] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#386257] disabled:cursor-not-allowed disabled:opacity-45">استعد صفوف النطاق</button><button type="button" disabled={!activeRange} onClick={() => updateRangeColumnVisibility(true)} className="rounded-lg border border-[#ebc9bf] bg-[#fff5f2] px-2.5 py-1.5 text-[10px] font-bold text-[#a25040] disabled:cursor-not-allowed disabled:opacity-45">استبعد أعمدة النطاق</button><button type="button" disabled={!activeRange} onClick={() => updateRangeColumnVisibility(false)} className="rounded-lg border border-[#c9dcd4] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#386257] disabled:cursor-not-allowed disabled:opacity-45">استعد أعمدة النطاق</button><button type="button" onClick={() => setCellRange(null)} className="rounded-lg border border-[#ceded6] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#48695f]">إلغاء التحديد</button></div></div>
              <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-[#71857d]">{historyForSheet.slice(-3).reverse().map((entry, index) => <span key={`${entry.description}-${index}`} className="rounded-md bg-[#edf6f1] px-2 py-1">{entry.description}</span>)}{!historyForSheet.length && <span>لا توجد تعديلات قابلة للتراجع بعد.</span>}</div>
            </div>

            <div className="grid gap-4 border-t border-[#dceae2] bg-white p-4 xl:grid-cols-2">
              <div className="rounded-xl border border-[#dce9e2] bg-[#fbfdfb] p-3"><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#0b6b5b]" /><h3 className="text-xs font-bold text-[#315a4f]">دمج أعمدة نصية</h3></div><p className="mt-1 text-[10px] leading-5 text-[#71857d]">اختر عمودين أو أكثر، واكتب اسم العمود الناتج. تستطيع لاحقًا تعيينه إلى أي حقل من خريطة الأعمدة.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{editorSources.map((source) => <label key={source} className="flex items-center gap-2 rounded-lg border border-[#e1ebe5] bg-white px-2 py-1.5 text-[10px] text-[#45675c]"><input type="checkbox" checked={mergeSources.includes(source)} onChange={() => setMergeSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source])} />{source}</label>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)} placeholder="اسم العمود الناتج" className="rounded-lg border border-[#ceded6] px-2 py-2 text-[10px]" /><input value={mergeSeparator} onChange={(event) => setMergeSeparator(event.target.value)} placeholder="الفاصل" className="rounded-lg border border-[#ceded6] px-2 py-2 text-[10px]" /><button type="button" disabled={mergeSources.length < 2 || !mergeTarget.trim()} onClick={() => { updateEditor({ textTransforms: [...editorConfig.textTransforms, { id: `merge-${Date.now()}`, type: "merge", sources: mergeSources, target: mergeTarget.trim(), separator: mergeSeparator }] }, `دمج أعمدة في «${mergeTarget.trim()}»`); setMergeSources([]); }} className="rounded-lg bg-[#173f38] px-2.5 py-2 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">دمج المختار</button></div></div>
              <div className="rounded-xl border border-[#dce9e2] bg-[#fbfdfb] p-3"><div className="flex items-center gap-2"><Split className="size-4 text-[#0b6b5b]" /><h3 className="text-xs font-bold text-[#315a4f]">تقسيم عمود نصي</h3></div><p className="mt-1 text-[10px] leading-5 text-[#71857d]">اختر العمود والفاصل وعدد الأجزاء، ثم عيّن الأجزاء الناتجة يدويًا من خريطة الأعمدة.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={splitSource} onChange={(event) => setSplitSource(event.target.value)} className="rounded-lg border border-[#ceded6] bg-white px-2 py-2 text-[10px]"><option value="">اختر عمودًا نصيًا</option>{editorSources.map((source) => <option value={source} key={source}>{source}</option>)}</select><input value={splitTarget} onChange={(event) => setSplitTarget(event.target.value)} placeholder="بادئة الأعمدة الناتجة" className="rounded-lg border border-[#ceded6] px-2 py-2 text-[10px]" /><input value={splitSeparator} onChange={(event) => setSplitSeparator(event.target.value)} placeholder="الفاصل مثل - أو /" className="rounded-lg border border-[#ceded6] px-2 py-2 text-[10px]" /><select value={splitParts} onChange={(event) => setSplitParts(Number(event.target.value))} className="rounded-lg border border-[#ceded6] bg-white px-2 py-2 text-[10px]"><option value={2}>جزآن</option><option value={3}>3 أجزاء</option><option value={4}>4 أجزاء</option><option value={5}>5 أجزاء</option><option value={6}>6 أجزاء</option></select></div><button type="button" disabled={!splitSource || !splitTarget.trim()} onClick={() => updateEditor({ textTransforms: [...editorConfig.textTransforms, { id: `split-${Date.now()}`, type: "split", source: splitSource, target: splitTarget.trim(), separator: splitSeparator, parts: splitParts }] }, `تقسيم «${splitSource}» إلى ${splitParts} أجزاء`)} className="mt-3 w-full rounded-lg border border-[#b9dfcd] bg-[#eaf7ef] px-2.5 py-2 text-[10px] font-bold text-[#216b55] disabled:cursor-not-allowed disabled:opacity-45">إنشاء الأعمدة الناتجة</button></div>
              {editorConfig.textTransforms.length > 0 && <div className="xl:col-span-2 rounded-xl border border-[#eadab2] bg-[#fffaf0] p-3"><p className="text-[11px] font-bold text-[#765b16]">تحويلات المعاينة الحالية</p><div className="mt-2 flex flex-wrap gap-2">{editorConfig.textTransforms.map((transform) => <span key={transform.id} className="rounded-lg border border-[#ead8ae] bg-white px-2 py-1.5 text-[10px] text-[#6b5b2c]">{transform.type === "merge" ? `دمج ${transform.sources.join(" + ")} ← ${transform.target}` : `تقسيم ${transform.source} ← ${transform.target}`}<button type="button" onClick={() => updateEditor({ textTransforms: editorConfig.textTransforms.filter((item) => item.id !== transform.id) }, "حذف تحويل نصي")} className="mr-2 text-[#a34d3d]"><X className="inline size-3" /></button></span>)}</div></div>}
            </div>
          </section>

          <section className="order-4 overflow-hidden rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e4eee8] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><Eye className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">المعاينة الأصلية — صفوف وأعمدة Excel</h2></div><p className="mt-1 text-[11px] text-[#74867f]">تظهر القيم من المصدر كما قُرئت. الأعمدة لا تُخفى ولا تُعاد تسميتها داخل هذه المعاينة.</p></div><label className="flex items-center gap-2 text-[11px] font-semibold text-[#55736a]">صفوف المعاينة<select value={previewRows} onChange={(event) => setPreviewRows(Number(event.target.value))} className="rounded-lg border border-[#cfdfd7] bg-white px-2 py-1.5 text-xs text-[#254f45]"><option value={20}>20</option><option value={30}>30</option><option value={50}>50</option><option value={75}>75</option></select></label></div>
            <div className="scrollbar-thin max-h-[480px] overflow-auto"><table className="min-w-max border-separate border-spacing-0 text-right text-[11px]"><thead className="sticky top-0 z-10"><tr><th className="sticky right-0 z-20 min-w-11 border-b border-l border-[#d8e6df] bg-[#eef5f0] px-3 py-2.5 text-center text-[10px] text-[#688078]">#</th>{originalColumns.map((column) => <th key={column.letter} className={`min-w-[170px] border-b border-l border-[#d8e6df] px-3 py-2.5 align-top ${column.isHidden ? "bg-[#f0f1f0] text-[#79837f]" : "bg-[#eef5f0] text-[#315d51]"}`}><span className="block text-[9px] text-[#85978f]">{column.letter}{column.isHidden ? " · مخفي" : ""}</span><span className="mt-0.5 block max-w-[190px] truncate font-bold">{column.rawHeader}</span></th>)}</tr></thead><tbody>{visibleRawRows.length ? visibleRawRows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex === headerRow ? "bg-[#e7f4ed]" : rowIndex % 2 ? "bg-[#fbfcfa]" : "bg-white"}><td className="sticky right-0 z-[1] border-b border-l border-[#e6ede9] bg-inherit px-3 py-2 text-center text-[10px] font-bold text-[#71837c]">{rowIndex + 1}</td>{originalColumns.map((column) => <td key={column.letter} className={`max-w-[220px] border-b border-l border-[#edf2ee] px-3 py-2 align-top ${column.isHidden ? "text-[#a5aca8]" : "text-[#536b62]"}`}><span className="block max-w-[210px] break-words">{row[column.index] === null || row[column.index] === undefined || row[column.index] === "" ? "—" : String(row[column.index])}</span></td>)}</tr>) : sheet.preview.slice(0, previewRows).map((record, rowIndex) => <tr key={rowIndex}><td className="sticky right-0 z-[1] border-b border-l border-[#e6ede9] bg-white px-3 py-2 text-center text-[10px] font-bold text-[#71837c]">{sheet.headerRowIndex + 2 + rowIndex}</td>{sheet.headers.map((header) => <td key={header} className="max-w-[220px] border-b border-l border-[#edf2ee] px-3 py-2 text-[#536b62]">{record[header] === null || record[header] === undefined ? "—" : String(record[header])}</td>)}</tr>)}</tbody></table></div>
          </section>

          {sheet.layoutNote && <section className="order-5 rounded-2xl border border-[#bfdccd] bg-[#eff9f3] p-4"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#19705a]" /><div><p className="text-sm font-bold text-[#24594b]">قاعدة الانزياح المعتمدة لملف الصيدلية</p><p className="mt-1 rounded-lg bg-white/65 px-2.5 py-2 text-[11px] font-semibold leading-5 text-[#2e6253]">اقرأ كل صف من خريطة الأعمدة هكذا: <b>موقع القيم</b> هو الخلية التي سيقرأ منها النظام، و<b>موقع الرأس ومعناه</b> هو العنوان الموجود في العمود الذي يليه.</p>{sheet.excludedColumns?.map((column) => <p key={column.dataColumn} className="mt-2 rounded-lg border border-[#e6cf9c] bg-[#fff8e8] px-2.5 py-2 text-[11px] font-bold leading-5 text-[#805d19]">مستبعد من النسخة المعالجة: العمود {column.dataColumn} «{column.sourceColumn}». {column.reason}</p>)}<p className="mt-2 text-[11px] leading-5 text-[#456d60]">{sheet.layoutNote}</p><p className="mt-2 text-[10px] font-bold text-[#7a5a17]">مهم: المعاينة أعلاه أصلية؛ هذه الخريطة لا تغيّر الملف، وتبقى بانتظار اعتمادك.</p></div></div></section>}

          <section className="order-6 overflow-hidden rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4eee8] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">خريطة الأعمدة وقرار المدير</h2></div><p className="mt-1 text-[11px] text-[#74867f]">كل تغيير في التفسير يسجل كـ«تعديل مدير». الدرجة تشرح قوة الاقتراح ولا تحل محل الموافقة.</p></div><span className="rounded-lg bg-[#eaf5ef] px-2.5 py-1.5 text-[10px] font-bold text-[#207059]">{sheet.mappings.length} عمود</span></div>
            <div className="scrollbar-thin max-h-[600px] overflow-auto"><table className="w-full min-w-[1150px] text-right"><thead className="sticky top-0 z-10 bg-[#f5f8f5] text-[10px] font-bold text-[#6f837a]"><tr><th className="px-4 py-3">موقع القيم</th><th className="px-4 py-3">موقع الرأس ومعناه</th><th className="px-4 py-3">العينة</th><th className="px-4 py-3">اقتراح النظام</th><th className="px-4 py-3">الثقة وسببها</th><th className="px-4 py-3">قرار المدير</th><th className="px-4 py-3">الحالة</th></tr></thead><tbody>{sheet.mappings.map((mapping) => {
              const confidence = confidenceStyle(mapping.score);
              const choice = mapping.approvalStatus === "ignored" ? "ignore" : mapping.field;
              return <tr key={uniqueKey(mapping)} className="border-t border-[#edf2ee] text-xs"><td className="px-4 py-3"><span className="font-bold text-[#2c554b]">{mapping.dataColumn ?? "—"}</span><p className="mt-1 text-[9px] text-[#71857d]">القيم كما ظهرت في Excel</p></td><td className="px-4 py-3"><span className="font-bold text-[#2c554b]">{mapping.headerColumn ?? "لا يوجد"}</span><span className="mr-1 text-[#627a71]">{mapping.sourceColumn}</span>{mapping.adjustedForHeaderShift && <span className="mr-2 rounded bg-[#fff1df] px-1.5 py-0.5 text-[9px] font-bold text-[#936417]">رأس مزاح</span>}</td><td className="max-w-[180px] px-4 py-3 text-[#71857d]">{mapping.sample}</td><td className="px-4 py-3 text-[#405e54]">{mapping.proposedField && mapping.proposedField !== "unknown" ? fieldArabicName[mapping.proposedField] : "غير معروف"}</td><td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${confidence.className}`}>{mapping.score}% · {confidence.label}</span><p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-[#788a84]">{mapping.reason}</p></td><td className="px-4 py-3"><select value={choice} onChange={(event) => applyChoice(mapping, event.target.value)} className="min-w-[180px] rounded-lg border border-[#cdded6] bg-white px-2.5 py-2 text-xs font-semibold text-[#2c574c] focus:border-[#298369] focus:outline-none"><option value="ignore">تجاهل من التحليل</option>{ALL_FIELDS.map(([field, label]) => <option value={field} key={field}>{label}</option>)}</select></td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${decisionStyle(mapping.approvalStatus)}`}>{decisionLabel(mapping.approvalStatus)}</span>{mapping.approvalStatus === "overridden" && <p className="mt-1 max-w-[160px] text-[9px] leading-4 text-[#927028]">{mapping.approvalReason}</p>}</td></tr>;
            })}</tbody></table></div>
          </section>

          <section id="row-visual-comparison" className="order-3 overflow-hidden rounded-2xl border border-[#c9ded4] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e0ece5] bg-[#f3f8f4] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><Eye className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">مقارنة مرئية للصفوف — المصدر مقابل الخريطة المصححة</h2></div><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#667e74]">الأصل يعرض Excel كما هو، والمصحح يوضح مواقع القيم التي ستُقرأ بعد الخريطة الحالية. لا تُنشأ نسخة من الملف ولا تُغيّر أي قيمة.</p></div><span className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#286b55]">{comparisonSourceRows.length} صفوف عينة</span></div>
            <div className="grid gap-px bg-[#dfece5] xl:grid-cols-2">
              <div className="bg-white p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#30594e]">الصف الأصلي من Excel</p><p className="mt-1 text-[10px] text-[#7b8e86]">حروف الأعمدة والقيم الخام كما ظهرت في الملف.</p></div><span className="rounded-md bg-[#edf2ee] px-2 py-1 text-[9px] font-bold text-[#617970]">مصدر غير معدّل</span></div>{(sheet.removedHeaders ?? []).map((header) => <p key={header.headerColumn} className="mb-2 rounded-lg border border-[#efc7be] bg-[#fff2ef] px-2.5 py-2 text-[10px] font-bold leading-5 text-[#9c4032]">رأس وهمي مُزال من التفسير: {header.headerColumn} «{header.title}» — لا تُحذف أي قيمة من عمود البيانات.</p>)}<div className="space-y-3">{comparisonSourceRows.map((row, rowIndex) => <article key={`source-${rowIndex}`} className="rounded-xl border border-[#e1ebe5] bg-[#fbfcfa] p-3"><p className="mb-2 text-[10px] font-bold text-[#58746a]">صف Excel {row.rowNumber}</p><div className="grid gap-2 sm:grid-cols-2">{originalColumns.map((column) => { const mapping = sheet.mappings.find((item) => item.dataColumn === column.letter); const tone = mapping?.adjustedForHeaderShift ? "border-[#eed4a5] bg-[#fff9ea] text-[#875d14]" : mapping ? "border-[#bfdfcd] bg-[#effaf3] text-[#286b55]" : "border-[#e3e9e5] bg-white text-[#647a72]"; return <div key={`${rowIndex}-${column.letter}`} className={`rounded-lg border px-2.5 py-2 ${tone}`}><p className="text-[9px] font-bold">{column.letter} · {column.rawHeader || "بلا عنوان"}</p><p className="mt-1 break-words text-[11px] font-semibold">{valueText(row.values[column.index])}</p></div>; })}</div></article>)}</div></div>
              <div className="bg-[#fcfdfb] p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#30594e]">الصف المصحح وفق الخريطة</p><p className="mt-1 text-[10px] text-[#7b8e86]">اسم الحقل ← موقع قيمة Excel، قبل أي تحليل أو استبدال.</p></div><div className="flex gap-1.5 text-[9px] font-bold"><span className="rounded-md bg-[#effaf3] px-2 py-1 text-[#286b55]">مطابق</span><span className="rounded-md bg-[#fff6df] px-2 py-1 text-[#936417]">رأس مزاح</span></div></div><div className="space-y-3">{comparisonSourceRows.map((row, rowIndex) => <article key={`mapped-${rowIndex}`} className="rounded-xl border border-[#dce9e2] bg-white p-3"><p className="mb-2 text-[10px] font-bold text-[#58746a]">الصف المصحح {row.rowNumber}</p><div className="grid gap-2 sm:grid-cols-2">{mappedFields.map((mapping) => { const shifted = mapping.adjustedForHeaderShift; const cellIndex = columnIndex(mapping.dataColumn); return <div key={`${rowIndex}-${uniqueKey(mapping)}`} className={`rounded-lg border px-2.5 py-2 ${shifted ? "border-[#eed4a5] bg-[#fff9ea] text-[#875d14]" : "border-[#bfdfcd] bg-[#effaf3] text-[#286b55]"}`}><p className="text-[9px] font-bold">{fieldArabicName[mapping.field as keyof typeof fieldArabicName] ?? "حقل غير معروف"} <span className="opacity-70">← {mapping.dataColumn}</span></p><p className="mt-1 break-words text-[11px] font-semibold">{valueText(row.values[cellIndex])}</p></div>; })}</div>{!mappedFields.length && <p className="rounded-lg bg-[#fff4ef] px-2.5 py-2 text-[10px] text-[#9d4e3b]">لم تُعتمد حقول قابلة للمقارنة في هذا الشيت بعد.</p>}</article>)}</div></div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e0ece5] bg-[#f8fbf8] px-4 py-3.5"><p className="max-w-2xl text-[10px] leading-5 text-[#637a71]">أكّد بعد مراجعة العينات أن قيمة كل حقل في الجانب المصحح مأخوذة من العمود الصحيح في المصدر. يعاد طلب التأكيد تلقائيًا إذا تغير أي قرار للعمود.</p><label className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ${currentSheetReviewed ? "border-[#9fd1ba] bg-[#eaf7ef] text-[#21674f]" : "border-[#d7bf7e] bg-[#fff9e8] text-[#795e15]"}`}><input type="checkbox" checked={currentSheetReviewed} disabled={!comparisonSourceRows.length} onChange={(event) => setReviewedSheets((current) => ({ ...current, [sheet.name]: event.target.checked }))} className="size-3.5 accent-[#16735b]" />أؤكد أنني راجعت مقارنة هذا الشيت</label></div>
          </section>

          {reviewKind === "analysis" && onSaveColumnMapTemplate && <section className="rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] p-4 shadow-[0_10px_30px_rgba(28,73,61,.05)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Save className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">قوالب خريطة الأعمدة المحلية</h2></div><p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#73857e]">يحفظ القالب قرارات الأعمدة وترتيب العناوين وقاعدة الانزياح فقط؛ لا يُحفظ أي صف أو قيمة من ملف Excel. يحدّث الاسم نفسه القالب الحالي.</p></div><span className="rounded-lg bg-[#eff8f2] px-2.5 py-1.5 text-[10px] font-bold text-[#286b55]">{columnMapTemplates.length} قالب محلي</span></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={columnTemplateName} maxLength={48} onChange={(event) => { setColumnTemplateName(event.target.value); setTemplateSavedName(""); }} className="min-w-0 flex-1 rounded-xl border border-[#cbded5] bg-white px-3 py-2.5 text-xs font-semibold text-[#31594f] outline-none focus:border-[#38866f]" aria-label="اسم قالب خريطة الأعمدة" /><button onClick={() => { const name = columnTemplateName.trim(); if (!name) return; onSaveColumnMapTemplate(name); setTemplateSavedName(name); }} disabled={!readiness.ready || !allSheetsReviewed || !columnTemplateName.trim()} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] disabled:cursor-not-allowed disabled:bg-[#8da59c]"><Save className="ml-1 inline size-3.5" />حفظ كقالب</button></div>{templateSavedName && <p className="mt-2 rounded-lg border border-[#b9dfcd] bg-[#eef9f2] px-3 py-2 text-[10px] font-bold text-[#287057]">تم حفظ خريطة الأعمدة باسم «{templateSavedName}» محليًا.</p>}<div className="mt-3 grid gap-2 md:grid-cols-2">{columnMapTemplates.length ? columnMapTemplates.map((template) => <div key={template.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#e0ebe5] bg-[#f8fbf8] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-bold text-[#315a4f]">{template.name}</p><p className="mt-1 text-[9px] text-[#7a8d85]">{template.sheets.length} شيت · آخر حفظ {new Date(template.updatedAt).toLocaleDateString("ar-EG")}</p></div>{onDeleteColumnMapTemplate && <button onClick={() => onDeleteColumnMapTemplate(template.id)} className="grid size-8 shrink-0 place-items-center rounded-lg border border-[#ead5cf] bg-white text-[#a34c3d] hover:bg-[#fff4f1]" aria-label={`حذف قالب ${template.name}`}><Trash2 className="size-3.5" /></button>}</div>) : <p className="rounded-xl border border-dashed border-[#d4e2db] px-3 py-3 text-[10px] text-[#73857e]">لا يوجد قالب محفوظ بعد. اعتمد الخريطة وراجِع المقارنة البصرية، ثم احفظ قالب «برنامج الصيدلية».</p>}</div></section>}
        </div>
      </div>

      {showConfirm && <div className="fixed inset-0 z-50 grid place-items-center bg-[#102f2a]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="approve-import-title"><div className="w-full max-w-lg rounded-2xl border border-[#cde1d7] bg-[#fcfcf8] p-5 shadow-2xl"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e5f4ec] text-[#1a6a53]"><ShieldCheck className="size-5" /></div><div><h2 id="approve-import-title" className="display-font text-lg font-semibold text-[#173f38]">اعتماد خريطة الاستيراد</h2><p className="mt-2 text-xs leading-6 text-[#667d74]">ستبدأ التحليلات باستخدام الحقول التي اعتمدتها فقط. سيُحفظ سجل القرار محليًا دون الاحتفاظ بمحتوى ملف Excel داخل السجل.</p></div></div><div className="mt-4 rounded-xl bg-[#f1f6f2] p-3 text-[11px] leading-5 text-[#476b60]"><p><b>الملف:</b> {inspection.fileName}</p><p><b>قرارات الأعمدة:</b> {readiness.approvedColumns} معتمد، {readiness.overriddenColumns} تعديل، {readiness.ignoredColumns} مستبعد.</p></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowConfirm(false)} className="rounded-xl border border-[#d5e3dc] bg-white px-3.5 py-2.5 text-xs font-bold text-[#4d6b61]">عودة للمراجعة</button><button onClick={() => { const audit = createImportAuditRecord(inspection, structure); setShowConfirm(false); onConfirm(audit); }} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c]">أوافق وأبدأ التحليل <ChevronLeft className="mr-1 inline size-3.5" /></button></div></div></div>}
    </div>
  </main>;
}
