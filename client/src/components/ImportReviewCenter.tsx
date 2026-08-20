import { useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Check, ChevronLeft, Download, Eye, FileSpreadsheet, LockKeyhole, ShieldCheck, SlidersHorizontal, TableProperties, X } from "lucide-react";
import {
  approveAllSuggestions,
  approveSheetSuggestions,
  getImportReadiness,
  mappingLabel,
  setColumnMapping,
  type MappingChoice,
} from "@/lib/importReview";
import { fieldArabicName, formatNumber, type CanonicalField, type ImportInspection, type SheetInspection } from "@/lib/pharmacyEngine";
import type { WorkbookStructureReview } from "@/lib/excelInspector";
import { createImportAuditRecord, exportImportAuditMap, loadImportAuditLog, type ImportAuditRecord } from "@/lib/importAuditLog";
import type { PriceMatchReport } from "@/lib/multiPeriodImport";

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

export function ImportReviewCenter({ inspection, structure, selectedSheetIndex, onSheet, onChange, onCancel, onConfirm, onRequestPriceReview, priceMatchReport, reviewKind = "analysis" }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [previewRows, setPreviewRows] = useState(30);
  const [auditHistory] = useState(() => loadImportAuditLog());
  const sheet = inspection.sheets[selectedSheetIndex] ?? inspection.sheets[0];
  const structural = structure?.sheets.find((item) => item.name === sheet?.name);
  const readiness = useMemo(() => getImportReadiness(inspection), [inspection]);
  if (!sheet) return null;

  const applyChoice = (mapping: SheetInspection["mappings"][number], value: string) => {
    onChange(setColumnMapping(inspection, sheet.name, mapping.dataColumn, mapping.sourceColumn, value as MappingChoice));
  };
  const exportMap = () => exportImportAuditMap(createImportAuditRecord(inspection, structure));
  const rawRows = structural?.rawPreview ?? [];
  const visibleRawRows = rawRows.slice(0, previewRows);
  const headerRow = structural?.selectedHeaderRow ?? sheet.headerRowIndex;
  const originalColumns = structural?.columns ?? sheet.headers.map((header, index) => ({ letter: String(index + 1), rawHeader: header, displayHeader: header, isHidden: false, samples: [], nullRate: 0, typeDistribution: { text: 0, numeric: 0, date: 0, boolean: 0, mixed: false }, index, nonEmptyCount: 0, isNumericHeader: false, isDuplicateHeader: false }));

  return <main className="app-canvas min-h-screen p-3 sm:p-6" dir="rtl">
    <div className="mx-auto max-w-[1640px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] px-4 py-4 shadow-[0_10px_30px_rgba(28,73,61,.06)] sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#123c37] text-white"><TableProperties className="size-5" /></div>
          <div className="min-w-0"><h1 className="display-font truncate text-xl font-semibold text-[#173f38]">{reviewKind === "prices" ? "مراجعة ملف الأسعار" : "مركز مراجعة الاستيراد"}</h1><p className="mt-1 truncate text-[11px] text-[#6c8279]">{inspection.fileName} · {Math.round(inspection.fileSize / 1024).toLocaleString("ar-EG")} ك.ب · البيانات لا تخرج من المتصفح</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onCancel} className="rounded-xl border border-[#d6e4dd] bg-white px-3.5 py-2.5 text-xs font-bold text-[#43655b] hover:border-[#a7cabc]"><X className="ml-1 inline size-3.5" />إلغاء</button>
          <button onClick={exportMap} disabled={readiness.pendingColumns > 0} className="rounded-xl border border-[#bfd9ce] bg-[#eff8f2] px-3.5 py-2.5 text-xs font-bold text-[#245f4e] disabled:cursor-not-allowed disabled:opacity-45"><Download className="ml-1 inline size-3.5" />تصدير خريطة الاعتماد</button>
          {onRequestPriceReview && <label className="cursor-pointer rounded-xl border border-[#ead7aa] bg-[#fff9e9] px-3.5 py-2.5 text-xs font-bold text-[#805f14] hover:bg-[#fff2d4]"><FileSpreadsheet className="ml-1 inline size-3.5" />مراجعة ملف أسعار إضافي<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event) => { void onRequestPriceReview(event.target.files?.[0]); event.target.value = ""; }} /></label>}
          <button onClick={() => setShowConfirm(true)} disabled={!readiness.ready} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] disabled:cursor-not-allowed disabled:bg-[#8da59c]"><ShieldCheck className="ml-1 inline size-3.5" />بدء التحليل بعد الاعتماد <ArrowLeft className="mr-1 inline size-3.5" /></button>
        </div>
      </header>

      <section className={`mb-5 rounded-2xl border p-4 ${readiness.ready ? "border-[#b9dfcd] bg-[#eef9f2]" : "border-[#edd9ae] bg-[#fffaf0]"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={`mt-0.5 grid size-8 place-items-center rounded-lg ${readiness.ready ? "bg-[#d8f0e2] text-[#226d55]" : "bg-[#fff0d0] text-[#9c6e19]"}`}><LockKeyhole className="size-4" /></div><div><p className="text-sm font-bold text-[#234d43]">بوابة اعتماد المدير</p><p className="mt-1 max-w-3xl text-xs leading-5 text-[#617a70]">الاقتراحات لا تُطبق تلقائيًا. راجع أسماء الأعمدة والعينات، ثم اعتمد الاقتراح أو عيّن الحقل المناسب أو استبعد العمود. لا يبدأ التحليل ما دام قرار واحد معلّقًا.</p></div></div><div className="flex flex-wrap gap-2 text-[10px] font-bold"><span className="rounded-lg bg-white px-2.5 py-1.5 text-[#477167]">{readiness.approvedColumns} معتمد</span><span className="rounded-lg bg-white px-2.5 py-1.5 text-[#94701c]">{readiness.overriddenColumns} تعديل مدير</span><span className="rounded-lg bg-white px-2.5 py-1.5 text-[#718078]">{readiness.ignoredColumns} مستبعد</span>{readiness.pendingColumns > 0 && <span className="rounded-lg bg-[#fff0eb] px-2.5 py-1.5 text-[#a94d3e]">{readiness.pendingColumns} قرار معلّق</span>}</div></div>
        {!readiness.ready && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#ebddb9] bg-white/70 px-3 py-2.5"><p className="text-[11px] text-[#775f1b]">{readiness.unresolvedCriticalFields.length ? `ينقص تعيين: ${readiness.unresolvedCriticalFields.join("، ")}.` : "اعتمد أو استبعد كل الأعمدة قبل المتابعة."}</p><button onClick={() => onChange(approveAllSuggestions(inspection))} className="rounded-lg bg-[#173f38] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#17564c]"><Check className="ml-1 inline size-3.5" />اعتماد جميع الاقتراحات بعد المراجعة</button></div>}
        {priceMatchReport && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c7dfd2] bg-white/75 px-3 py-2.5 text-[11px] text-[#356457]"><span><b>آخر مطابقة أسعار معتمدة:</b> {priceMatchReport.matchRate.toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%</span><span>{formatNumber(priceMatchReport.matchedRecords)} سجل مطابق · {formatNumber(priceMatchReport.unmatchedRecords)} غير مطابق</span></div>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[265px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] p-3.5 shadow-[0_10px_30px_rgba(28,73,61,.05)]">
          <p className="mb-3 px-1 text-[11px] font-bold tracking-wide text-[#6d8279]">شيتات الملف ({inspection.sheets.length})</p>
          <div className="space-y-2">{inspection.sheets.map((item, index) => {
            const active = index === selectedSheetIndex;
            const source = structure?.sheets.find((review) => review.name === item.name);
            return <button key={`${item.name}-${index}`} onClick={() => onSheet(index)} className={`w-full rounded-xl border p-3 text-right ${active ? "border-[#75ae9e] bg-[#eaf5ef]" : "border-transparent bg-[#f3f6f2] hover:border-[#d1e3da]"}`}><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold text-[#1e4a42]">{item.name}</span><span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-[#356457]">{formatNumber(item.rows)} × {formatNumber(item.columns)}</span></div><p className="mt-1.5 text-[10px] text-[#72867e]">رأس مقترح: صف {item.headerRowIndex + 1}{source?.visibility !== "visible" ? " · شيت مخفي" : ""}</p></button>;
          })}</div>
          <button onClick={() => onChange(approveSheetSuggestions(inspection, sheet.name))} className="mt-4 w-full rounded-xl border border-[#bdddd0] bg-[#eff9f3] px-3 py-2.5 text-xs font-bold text-[#286b55] hover:bg-[#e2f3e9]"><Check className="ml-1 inline size-3.5" />اعتماد قرارات هذا الشيت</button>
          {auditHistory.length > 0 && <div className="mt-5 border-t border-[#e2ece6] pt-4"><p className="text-[11px] font-bold text-[#365e54]">آخر اعتماد محلي</p><p className="mt-1.5 text-[10px] leading-5 text-[#72867e]">{auditHistory[0].fileName}<br />{new Date(auditHistory[0].timestamp).toLocaleDateString("ar-EG")}</p></div>}
        </aside>

        <div className="min-w-0 space-y-5">
          {(structural?.warnings ?? []).length > 0 && <section className="rounded-2xl border border-[#ead8ad] bg-[#fffaf0] p-4"><div className="flex items-center gap-2"><AlertCircle className="size-4 text-[#a67520]" /><p className="text-sm font-bold text-[#725817]">تنبيهات بنية الملف — لم يُطبق أي تعديل</p></div><div className="mt-3 grid gap-2 lg:grid-cols-2">{structural?.warnings.map((item, index) => <p key={`${item.kind}-${index}`} className="rounded-xl border border-[#f1e5c7] bg-white/80 px-3 py-2.5 text-[11px] leading-5 text-[#725f35]"><b>{item.severity === "attention" ? "تدقيق مطلوب:" : item.severity === "review" ? "مراجعة:" : "ملاحظة:"}</b> {item.message}</p>)}</div></section>}

          <section className="overflow-hidden rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e4eee8] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><Eye className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">المعاينة الأصلية — صفوف وأعمدة Excel</h2></div><p className="mt-1 text-[11px] text-[#74867f]">تظهر القيم من المصدر كما قُرئت. الأعمدة لا تُخفى ولا تُعاد تسميتها داخل هذه المعاينة.</p></div><label className="flex items-center gap-2 text-[11px] font-semibold text-[#55736a]">صفوف المعاينة<select value={previewRows} onChange={(event) => setPreviewRows(Number(event.target.value))} className="rounded-lg border border-[#cfdfd7] bg-white px-2 py-1.5 text-xs text-[#254f45]"><option value={20}>20</option><option value={30}>30</option><option value={50}>50</option><option value={75}>75</option></select></label></div>
            <div className="scrollbar-thin max-h-[480px] overflow-auto"><table className="min-w-max border-separate border-spacing-0 text-right text-[11px]"><thead className="sticky top-0 z-10"><tr><th className="sticky right-0 z-20 min-w-11 border-b border-l border-[#d8e6df] bg-[#eef5f0] px-3 py-2.5 text-center text-[10px] text-[#688078]">#</th>{originalColumns.map((column) => <th key={column.letter} className={`min-w-[170px] border-b border-l border-[#d8e6df] px-3 py-2.5 align-top ${column.isHidden ? "bg-[#f0f1f0] text-[#79837f]" : "bg-[#eef5f0] text-[#315d51]"}`}><span className="block text-[9px] text-[#85978f]">{column.letter}{column.isHidden ? " · مخفي" : ""}</span><span className="mt-0.5 block max-w-[190px] truncate font-bold">{column.rawHeader}</span></th>)}</tr></thead><tbody>{visibleRawRows.length ? visibleRawRows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex === headerRow ? "bg-[#e7f4ed]" : rowIndex % 2 ? "bg-[#fbfcfa]" : "bg-white"}><td className="sticky right-0 z-[1] border-b border-l border-[#e6ede9] bg-inherit px-3 py-2 text-center text-[10px] font-bold text-[#71837c]">{rowIndex + 1}</td>{originalColumns.map((column) => <td key={column.letter} className={`max-w-[220px] border-b border-l border-[#edf2ee] px-3 py-2 align-top ${column.isHidden ? "text-[#a5aca8]" : "text-[#536b62]"}`}><span className="block max-w-[210px] break-words">{row[column.index] === null || row[column.index] === undefined || row[column.index] === "" ? "—" : String(row[column.index])}</span></td>)}</tr>) : sheet.preview.slice(0, previewRows).map((record, rowIndex) => <tr key={rowIndex}><td className="sticky right-0 z-[1] border-b border-l border-[#e6ede9] bg-white px-3 py-2 text-center text-[10px] font-bold text-[#71837c]">{sheet.headerRowIndex + 2 + rowIndex}</td>{sheet.headers.map((header) => <td key={header} className="max-w-[220px] border-b border-l border-[#edf2ee] px-3 py-2 text-[#536b62]">{record[header] === null || record[header] === undefined ? "—" : String(record[header])}</td>)}</tr>)}</tbody></table></div>
          </section>

          {sheet.layoutNote && <section className="rounded-2xl border border-[#bfdccd] bg-[#eff9f3] p-4"><div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#19705a]" /><div><p className="text-sm font-bold text-[#24594b]">قاعدة الانزياح المعتمدة لملف الصيدلية</p><p className="mt-1 rounded-lg bg-white/65 px-2.5 py-2 text-[11px] font-semibold leading-5 text-[#2e6253]">اقرأ كل صف من خريطة الأعمدة هكذا: <b>موقع القيم</b> هو الخلية التي سيقرأ منها النظام، و<b>موقع الرأس ومعناه</b> هو العنوان الموجود في العمود الذي يليه.</p><p className="mt-2 text-[11px] leading-5 text-[#456d60]">{sheet.layoutNote}</p><p className="mt-2 text-[10px] font-bold text-[#7a5a17]">مهم: المعاينة أعلاه أصلية؛ هذه الخريطة لا تغيّر الملف، وتبقى بانتظار اعتمادك.</p></div></div></section>}

          <section className="overflow-hidden rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] shadow-[0_10px_30px_rgba(28,73,61,.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4eee8] px-4 py-4 sm:px-5"><div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#0b6b5b]" /><h2 className="font-bold text-[#214a41]">خريطة الأعمدة وقرار المدير</h2></div><p className="mt-1 text-[11px] text-[#74867f]">كل تغيير في التفسير يسجل كـ«تعديل مدير». الدرجة تشرح قوة الاقتراح ولا تحل محل الموافقة.</p></div><span className="rounded-lg bg-[#eaf5ef] px-2.5 py-1.5 text-[10px] font-bold text-[#207059]">{sheet.mappings.length} عمود</span></div>
            <div className="scrollbar-thin max-h-[600px] overflow-auto"><table className="w-full min-w-[1150px] text-right"><thead className="sticky top-0 z-10 bg-[#f5f8f5] text-[10px] font-bold text-[#6f837a]"><tr><th className="px-4 py-3">موقع القيم</th><th className="px-4 py-3">موقع الرأس ومعناه</th><th className="px-4 py-3">العينة</th><th className="px-4 py-3">اقتراح النظام</th><th className="px-4 py-3">الثقة وسببها</th><th className="px-4 py-3">قرار المدير</th><th className="px-4 py-3">الحالة</th></tr></thead><tbody>{sheet.mappings.map((mapping) => {
              const confidence = confidenceStyle(mapping.score);
              const choice = mapping.approvalStatus === "ignored" ? "ignore" : mapping.field;
              return <tr key={uniqueKey(mapping)} className="border-t border-[#edf2ee] text-xs"><td className="px-4 py-3"><span className="font-bold text-[#2c554b]">{mapping.dataColumn ?? "—"}</span><p className="mt-1 text-[9px] text-[#71857d]">القيم كما ظهرت في Excel</p></td><td className="px-4 py-3"><span className="font-bold text-[#2c554b]">{mapping.headerColumn ?? "لا يوجد"}</span><span className="mr-1 text-[#627a71]">{mapping.sourceColumn}</span>{mapping.adjustedForHeaderShift && <span className="mr-2 rounded bg-[#fff1df] px-1.5 py-0.5 text-[9px] font-bold text-[#936417]">رأس مزاح</span>}</td><td className="max-w-[180px] px-4 py-3 text-[#71857d]">{mapping.sample}</td><td className="px-4 py-3 text-[#405e54]">{mapping.proposedField && mapping.proposedField !== "unknown" ? fieldArabicName[mapping.proposedField] : "غير معروف"}</td><td className="px-4 py-3"><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${confidence.className}`}>{mapping.score}% · {confidence.label}</span><p className="mt-1.5 max-w-[190px] text-[10px] leading-4 text-[#788a84]">{mapping.reason}</p></td><td className="px-4 py-3"><select value={choice} onChange={(event) => applyChoice(mapping, event.target.value)} className="min-w-[180px] rounded-lg border border-[#cdded6] bg-white px-2.5 py-2 text-xs font-semibold text-[#2c574c] focus:border-[#298369] focus:outline-none"><option value="ignore">تجاهل من التحليل</option>{ALL_FIELDS.map(([field, label]) => <option value={field} key={field}>{label}</option>)}</select></td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${decisionStyle(mapping.approvalStatus)}`}>{decisionLabel(mapping.approvalStatus)}</span>{mapping.approvalStatus === "overridden" && <p className="mt-1 max-w-[160px] text-[9px] leading-4 text-[#927028]">{mapping.approvalReason}</p>}</td></tr>;
            })}</tbody></table></div>
          </section>
        </div>
      </div>

      {showConfirm && <div className="fixed inset-0 z-50 grid place-items-center bg-[#102f2a]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="approve-import-title"><div className="w-full max-w-lg rounded-2xl border border-[#cde1d7] bg-[#fcfcf8] p-5 shadow-2xl"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e5f4ec] text-[#1a6a53]"><ShieldCheck className="size-5" /></div><div><h2 id="approve-import-title" className="display-font text-lg font-semibold text-[#173f38]">اعتماد خريطة الاستيراد</h2><p className="mt-2 text-xs leading-6 text-[#667d74]">ستبدأ التحليلات باستخدام الحقول التي اعتمدتها فقط. سيُحفظ سجل القرار محليًا دون الاحتفاظ بمحتوى ملف Excel داخل السجل.</p></div></div><div className="mt-4 rounded-xl bg-[#f1f6f2] p-3 text-[11px] leading-5 text-[#476b60]"><p><b>الملف:</b> {inspection.fileName}</p><p><b>قرارات الأعمدة:</b> {readiness.approvedColumns} معتمد، {readiness.overriddenColumns} تعديل، {readiness.ignoredColumns} مستبعد.</p></div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowConfirm(false)} className="rounded-xl border border-[#d5e3dc] bg-white px-3.5 py-2.5 text-xs font-bold text-[#4d6b61]">عودة للمراجعة</button><button onClick={() => { const audit = createImportAuditRecord(inspection, structure); setShowConfirm(false); onConfirm(audit); }} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c]">أوافق وأبدأ التحليل <ChevronLeft className="mr-1 inline size-3.5" /></button></div></div></div>}
    </div>
  </main>;
}
