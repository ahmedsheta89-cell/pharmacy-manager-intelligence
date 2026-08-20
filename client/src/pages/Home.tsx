/**
 * نبض العيادة التنفيذي — الصفحة المركزية.
 * التسلسل المقصود: تشخيص ← دليل ← إجراء، ثم استيراد ملف واحد → مراجعة الثقة والمطابقة → قرار المدير.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  BellRing,
  Building2,
  Check,
  ChevronLeft,
  CircleHelp,
  CircleUserRound,
  Download,
  FileBarChart,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  HeartPulse,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  PackageSearch,
  PanelRightOpen,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Settings2,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  fieldArabicName,
  formatEGP,
  formatNumber,
  inspectPharmacyFile,
  refreshImportedInspection,
  type ImportInspection,
  type SheetInspection,
} from "@/lib/pharmacyEngine";
import {
  analyzePharmacyData,
  answerDataQuestion,
  compareWithPreviousPeriod,
  type AlertLevel,
  type DashboardAnalytics,
  type DashboardFilters,
  type ManagerAlert,
  type ProductInsight,
} from "@/lib/analyticsEngine";
import { exportManagerReportPdf } from "@/lib/managerPdf";
import { loadReportPreferences, saveReportPreferences, type ReportPreferences } from "@/lib/reportSettings";
import { analyzeInventoryOperations } from "@/lib/inventoryEngine";
import { analyzeProductMovement } from "@/lib/productMovementEngine";
import { exportProductMovementWorkbook } from "@/lib/productMovementExport";
import { deleteAnalysisSession, loadAnalysisSessions, saveAnalysisSession, updateAnalysisSessionTags, type LocalAnalysisSession } from "@/lib/analysisSessions";
import { loadReorderRuleHistory, loadReorderRules, removeReorderRule, saveReorderRule, saveReorderRulesBatch, type ReorderRuleHistoryEntry, type ReorderRules } from "@/lib/reorderRules";
import { exportInventoryOperationsWorkbook } from "@/lib/inventoryExport";
import { inspectReorderRulesFile, type ReorderRulesImportResult } from "@/lib/reorderRulesImport";
import { exportLocalBackup, restoreLocalBackup, type BackupRestoreMode, type BackupRestoreResult } from "@/lib/localBackup";
import { exportAuditWorkbook } from "@/lib/auditExport";
import { loadBackupReminderSettings, recordBackupExport } from "@/lib/backupReminder";
import { loadReportLock, removeLocalReportPasscode, setLocalReportPasscode, verifyLocalReportPasscode, type ReportLockState } from "@/lib/reportLock";
import { ManagerReportCenter, ReportPreferencesView } from "@/components/ManagerReportCenter";
import { InventoryOperationsCenter } from "@/components/InventoryOperationsCenter";
import { ReportSettingsGate } from "@/components/ReportSettingsGate";
import { SessionArchiveCenter } from "@/components/SessionArchiveCenter";
import { ProductMovementCenter } from "@/components/ProductMovementCenter";
import { InventoryFlowCenter } from "@/components/InventoryFlowCenter";
import { applyPriceFile, inspectMonthlyFiles, monthFromFileName, type ImportedMonth, type PriceMatchReport } from "@/lib/multiPeriodImport";
import { deleteImportTemplate, loadImportTemplates, saveImportTemplate, type ImportTemplate } from "@/lib/importTemplates";
import { analyzeInventoryFlow } from "@/lib/inventoryFlowEngine";
import { exportInventoryFlowWorkbook } from "@/lib/inventoryFlowExport";
import { ImportReviewCenter } from "@/components/ImportReviewCenter";
import { inspectWorkbookStructure, type WorkbookStructureReview } from "@/lib/excelInspector";
import { recordImportAudit, type ImportAuditRecord } from "@/lib/importAuditLog";
import { createColumnMapTemplate, deleteColumnMapTemplate, findColumnMapTemplateCompatibility, loadColumnMapTemplates, saveColumnMapTemplate, type ColumnMapTemplate, type ColumnMapTemplateCompatibility } from "@/lib/columnMapTemplates";

type Stage = "welcome" | "review" | "dashboard";
type DashboardView = "overview" | "sales" | "products" | "movement" | "flow" | "companies" | "inventory" | "branches" | "alerts" | "report" | "settings";
type MonthlyFileDraft = { file: File; month?: number; inferred: boolean };

const MONTH_OPTIONS = [
  [1, "يناير"], [2, "فبراير"], [3, "مارس"], [4, "أبريل"], [5, "مايو"], [6, "يونيو"],
  [7, "يوليو"], [8, "أغسطس"], [9, "سبتمبر"], [10, "أكتوبر"], [11, "نوفمبر"], [12, "ديسمبر"],
] as const;

const ASSET = {
  logo: "/manus-storage/pharmacy-intelligence-symbol_005d34fa.png",
  abstract: "/manus-storage/pharmacy-executive-abstract_dddbd3fc.png",
  orb: "/manus-storage/pharmacy-insight-orb_c1ac46a1.png",
};

const levelMeta: Record<AlertLevel, { label: string; icon: string; className: string }> = {
  urgent: { label: "عاجل", icon: "●", className: "status-urgent" },
  review: { label: "مراجعة", icon: "●", className: "status-review" },
  watch: { label: "مراقبة", icon: "●", className: "status-watch" },
  positive: { label: "إيجابي", icon: "●", className: "status-positive" },
};

const navItems: Array<{ id: DashboardView; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "sales", label: "تحليل المبيعات", icon: BarChart3 },
  { id: "products", label: "تحليل الأصناف", icon: PackageSearch },
  { id: "movement", label: "حركة الأصناف", icon: TrendingUp },
  { id: "flow", label: "تدفق المخزون", icon: TrendingDown },
  { id: "companies", label: "الشركات والموردون", icon: Building2 },
  { id: "inventory", label: "المخزون والطلبات", icon: PackageSearch },
  { id: "branches", label: "مقارنة الفروع", icon: Building2 },
  { id: "alerts", label: "مركز التنبيهات", icon: BellRing },
  { id: "report", label: "تقرير المدير", icon: FileBarChart },
  { id: "settings", label: "إعدادات التقرير", icon: Settings2 },
];

function qualityStyle(score: number) {
  if (score >= 90) return { label: "ممتازة", color: "text-[#16735b]", bar: "bg-[#169271]" };
  if (score >= 75) return { label: "جيدة", color: "text-[#907015]", bar: "bg-[#d3a83e]" };
  return { label: "تحتاج مراجعة", color: "text-[#ad4936]", bar: "bg-[#c65c49]" };
}

function dateText(date?: Date) {
  return date ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(date) : "الفترة غير محددة";
}

function MiniLogo({ compact = false }: { compact?: boolean }) {
  return <div className={`flex items-center ${compact ? "justify-center" : "gap-3"}`}>
    <div className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-[#f2f4ed] shadow-[0_3px_12px_rgba(0,0,0,.18)]">
      <img src={ASSET.logo} alt="رمز Pharmacy Manager Intelligence" className="size-8 object-contain" />
    </div>
    {!compact && <div className="min-w-0"><p className="display-font text-[16px] leading-5 font-semibold tracking-[-.02em] text-[#f7f5ee]">Pharmacy Manager</p><p className="mt-0.5 text-[9px] font-semibold tracking-[.13em] text-[#a6c5b9]">INTELLIGENCE</p></div>}
  </div>;
}

function EmptyMetric({ label, note }: { label: string; note: string }) {
  return <div className="rounded-2xl border border-dashed border-[#c9dcd4] bg-[#f8faf6]/70 p-4"><p className="text-xs font-semibold text-[#385b51]">{label}</p><p className="mt-2 text-xs leading-5 text-[#788b84]">{note}</p></div>;
}

function ColumnMapMismatchWarning({ compatibility, onContinue, onCancel }: { compatibility: ColumnMapTemplateCompatibility; onContinue: () => void; onCancel: () => void }) {
  const differences = compatibility.differences.slice(0, 12);
  return <div className="fixed inset-0 z-[70] overflow-y-auto bg-[#102f2a]/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="column-map-warning-title"><div className="mx-auto my-3 w-full max-w-3xl rounded-2xl border border-[#e4c77a] bg-[#fffdf7] shadow-2xl"><div className="border-b border-[#f0dfaf] bg-[#fff7e2] px-5 py-4"><div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f4dfaa] text-[#876017]"><AlertCircle className="size-5" /></div><div><h2 id="column-map-warning-title" className="display-font text-lg font-semibold text-[#654b12]">تحذير: ترتيب الأعمدة لا يطابق القالب المعتمد</h2><p className="mt-1 text-xs leading-5 text-[#7b662b]">قورِن الملف الجديد بالقالب المحلي «{compatibility.template.name}». لن يُطبّق القالب تلقائيًا، ولن يبدأ التحليل قبل أن تتابع إلى مراجعة خريطة جديدة وتعتمدها بنفسك.</p></div></div></div><div className="p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-[#284b42]">مواضع الاختلاف المكتشفة</p><span className="rounded-lg bg-[#fff2d5] px-2.5 py-1 text-[10px] font-bold text-[#89631b]">{compatibility.differences.length} اختلاف</span></div><div className="overflow-hidden rounded-xl border border-[#e7dec9]"><div className="grid grid-cols-[minmax(100px,.75fr)_minmax(0,1fr)_minmax(0,1fr)] bg-[#f8f3e5] px-3 py-2 text-[10px] font-bold text-[#6a624d]"><span>الموضع</span><span>المتوقع في القالب</span><span>الموجود في الملف</span></div>{differences.map((difference, index) => <div key={`${difference.kind}-${difference.sheetName}-${index}`} className="grid grid-cols-[minmax(100px,.75fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-t border-[#eee8db] px-3 py-2.5 text-[11px] leading-5"><span className="font-bold text-[#596f66]">{difference.sheetName}{difference.position !== undefined ? ` · ${String.fromCharCode(65 + difference.position)}` : ""}</span><span className="break-words text-[#71624a]">{difference.expected?.title || (difference.kind === "column_count" ? "عدد الأعمدة في القالب" : "—")}</span><span className="break-words font-semibold text-[#8d4937]">{difference.found?.title || difference.message}</span></div>)}</div>{compatibility.differences.length > differences.length && <p className="mt-2 text-[10px] text-[#788078]">توجد {compatibility.differences.length - differences.length} اختلافات إضافية؛ ستظهر تفاصيل بنية الملف كاملة في مركز المراجعة.</p>}<div className="mt-4 rounded-xl border border-[#e7dcc0] bg-[#fffaf0] px-3 py-2.5 text-[11px] leading-5 text-[#756134]"><b>قرار آمن:</b> اختر «مراجعة خريطة جديدة» لتفحص الصفوف الأصلية والمصححة يدويًا. لا يتجاوز هذا الإقرار أي موافقة على الخريطة، بل يفتح مرحلة المراجعة فقط.</div><div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row"><button onClick={onCancel} className="rounded-xl border border-[#d7ded9] bg-white px-4 py-2.5 text-xs font-bold text-[#48665c]">إلغاء اختيار الملف</button><button onClick={onContinue} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c]">أفهم الاختلاف — مراجعة خريطة جديدة <ChevronLeft className="mr-1 inline size-3.5" /></button></div></div></div></div>;
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [workbookStructure, setWorkbookStructure] = useState<WorkbookStructureReview | null>(null);
  const [priceInspection, setPriceInspection] = useState<ImportInspection | null>(null);
  const [priceWorkbookStructure, setPriceWorkbookStructure] = useState<WorkbookStructureReview | null>(null);
  const [reviewSource, setReviewSource] = useState<"base" | "price">("base");
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState<DashboardView>("overview");
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [pdfError, setPdfError] = useState("");
  const [movementPdfStatus, setMovementPdfStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [movementPdfError, setMovementPdfError] = useState("");
  const [flowPdfStatus, setFlowPdfStatus] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [flowPdfError, setFlowPdfError] = useState("");
  const [reportPreferences, setReportPreferences] = useState<ReportPreferences>(() => loadReportPreferences());
  const [reportLock, setReportLock] = useState<ReportLockState>(() => loadReportLock());
  const [savedSessions, setSavedSessions] = useState<LocalAnalysisSession[]>(() => loadAnalysisSessions());
  const [reorderRules, setReorderRules] = useState<ReorderRules>(() => loadReorderRules());
  const [reorderHistory, setReorderHistory] = useState<ReorderRuleHistoryEntry[]>(() => loadReorderRuleHistory());
  const [importedMonths, setImportedMonths] = useState<ImportedMonth[]>([]);
  const [priceMatchReport, setPriceMatchReport] = useState<PriceMatchReport | null>(null);
  const [monthlyDraft, setMonthlyDraft] = useState<MonthlyFileDraft[]>([]);
  const [importTemplates, setImportTemplates] = useState<ImportTemplate[]>(() => loadImportTemplates());
  const [templateName, setTemplateName] = useState("");
  const [columnMapTemplates, setColumnMapTemplates] = useState<ColumnMapTemplate[]>(() => loadColumnMapTemplates());
  const [columnMapMismatch, setColumnMapMismatch] = useState<ColumnMapTemplateCompatibility | null>(null);
  const [mismatchAcknowledged, setMismatchAcknowledged] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const monthlyFilesInput = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLElement>(null);
  const movementReportRef = useRef<HTMLDivElement>(null);
  const flowReportRef = useRef<HTMLDivElement>(null);

  const analytics = useMemo<DashboardAnalytics | undefined>(() => inspection && stage === "dashboard" ? analyzePharmacyData(inspection.sheets, filters) : undefined, [inspection, stage, filters]);
  const comparison = useMemo(() => inspection && stage === "dashboard" ? compareWithPreviousPeriod(inspection.sheets, filters) : { available: false, metrics: [], note: "لا توجد بيانات مقارنة بعد." }, [inspection, stage, filters]);
  const inventoryOperations = useMemo(() => inspection && stage === "dashboard" ? analyzeInventoryOperations(inspection.sheets, reorderRules) : analyzeInventoryOperations([], reorderRules), [inspection, stage, reorderRules]);
  const productMovement = useMemo(() => inspection && stage === "dashboard" ? analyzeProductMovement(inspection.sheets) : analyzeProductMovement([]), [inspection, stage]);
  const inventoryFlow = useMemo(() => analyzeInventoryFlow(productMovement), [productMovement]);
  const selectedSheet = inspection?.sheets[selectedSheetIndex];
  useEffect(() => { saveReportPreferences(reportPreferences); }, [reportPreferences]);

  function assessColumnMapCompatibility(nextInspection: ImportInspection, nextStructure: WorkbookStructureReview) {
    const compatibility = findColumnMapTemplateCompatibility(columnMapTemplates, nextInspection, nextStructure);
    setColumnMapMismatch(compatibility?.compatible ? null : compatibility);
    setMismatchAcknowledged(Boolean(compatibility?.compatible) || !compatibility);
  }

  async function beginFile(file?: File) {
    if (!file) return;
    const fileName = file.name.toLowerCase();
    if (!/\.(xlsx|xls|csv)$/.test(fileName)) { setError("يرجى اختيار ملف Excel أو CSV بصيغة XLSX أو XLS أو CSV."); return; }
    setProcessing(true); setError(""); setAnswer("");
    try {
      const [result, structure] = await Promise.all([inspectPharmacyFile(file), inspectWorkbookStructure(file)]);
      if (!result.sheets.some((sheet) => sheet.cleanRecords.length)) throw new Error("لم نعثر على صفوف بيانات قابلة للتحليل داخل الملف. راجع أن التقرير يحتوي على جدول فعلي.");
      assessColumnMapCompatibility(result, structure); setInspection(result); setWorkbookStructure(structure); setSelectedSheetIndex(0); setStage("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر قراءة الملف. تأكد من أن الملف غير محمي بكلمة مرور ثم حاول مجددًا.");
    } finally { setProcessing(false); }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { void beginFile(event.target.files?.[0]); event.target.value = ""; }
  function selectMonthlyFiles(files?: FileList | null) {
    if (!files?.length) return;
    const draft = Array.from(files).map((file) => {
      const month = monthFromFileName(file.name);
      return { file, month, inferred: month !== undefined };
    });
    if (draft.length < 2) { setError("اختر ملفين شهريين على الأقل لتفعيل المقارنة الشهرية."); return; }
    setMonthlyDraft(draft); setError("");
  }
  function changeDraftMonth(index: number, value: string) {
    const month = Number(value) || undefined;
    setMonthlyDraft((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, month, inferred: false } : entry));
  }
  function applyImportTemplate(template: ImportTemplate) {
    setMonthlyDraft((current) => current.map((entry) => {
      const assignment = template.assignments.find((item) => item.fileName.toLocaleLowerCase("ar-EG") === entry.file.name.toLocaleLowerCase("ar-EG"));
      return assignment ? { ...entry, month: assignment.month, inferred: false } : entry;
    }));
    setTemplateName(template.name);
  }
  function saveCurrentImportTemplate() {
    if (!monthlyDraft.length) { setError("اختر ملفات الأشهر أولًا ثم احفظ قالبها المحلي."); return; }
    const assignments = monthlyDraft.flatMap((entry) => entry.month ? [{ fileName: entry.file.name, month: entry.month }] : []);
    if (assignments.length !== monthlyDraft.length) { setError("حدد شهرًا لكل ملف قبل حفظ القالب."); return; }
    const name = templateName.trim() || `قالب ${new Date().toLocaleDateString("ar-EG")}`;
    setImportTemplates(saveImportTemplate({ name, assignments, expectsPriceFile: false })); setTemplateName(name); setError("");
  }
  function removeImportTemplate(id: string) { setImportTemplates(deleteImportTemplate(id)); }
  function saveCurrentColumnMapTemplate(name: string) {
    if (!inspection || reviewSource !== "base") return;
    setColumnMapTemplates(saveColumnMapTemplate(createColumnMapTemplate(name, inspection, workbookStructure)));
  }
  function removeColumnMapTemplate(id: string) { setColumnMapTemplates(deleteColumnMapTemplate(id)); }
  async function beginMonthlyFiles() {
    if (!monthlyDraft.length) return;
    setProcessing(true); setError(""); setAnswer(""); setPriceMatchReport(null);
    try { const [result, reviews] = await Promise.all([inspectMonthlyFiles(monthlyDraft.map((entry) => entry.file), monthlyDraft.map((entry) => entry.month)), Promise.all(monthlyDraft.map((entry) => inspectWorkbookStructure(entry.file)))]); const nextStructure = { fileName: result.inspection.fileName, fileFingerprintHint: result.inspection.fileFingerprint, inspectedAt: new Date().toISOString(), sheets: result.months.flatMap((month) => (reviews.find((review) => review.fileName === month.fileName)?.sheets ?? []).map((sheet) => ({ ...sheet, name: month.label }))), warnings: reviews.flatMap((review) => review.warnings) }; assessColumnMapCompatibility(result.inspection, nextStructure); setInspection(result.inspection); setWorkbookStructure(nextStructure); setImportedMonths(result.months); setSelectedSheetIndex(0); setStage("review"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر قراءة ملفات الأشهر."); }
    finally { setProcessing(false); }
  }
  async function beginPriceReview(file?: File) {
    if (!file || !inspection) return;
    setProcessing(true); setError("");
    try {
      const [nextPriceInspection, nextPriceStructure] = await Promise.all([inspectPharmacyFile(file), inspectWorkbookStructure(file)]);
      if (!nextPriceInspection.sheets.some((sheet) => sheet.cleanRecords.length)) throw new Error("لم نعثر على جدول أسعار صالح داخل الملف الإضافي.");
      setPriceInspection(nextPriceInspection); setPriceWorkbookStructure(nextPriceStructure); setReviewSource("price"); setSelectedSheetIndex(0);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر مطابقة ملف الأسعار."); }
    finally { setProcessing(false); }
  }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); void beginFile(event.dataTransfer.files?.[0]); }

  function confirmImport(audit?: ImportAuditRecord) {
    if (!inspection) return;
    if (columnMapMismatch && !mismatchAcknowledged) { setError("راجع تحذير اختلاف ترتيب الأعمدة قبل اعتماد أي خريطة."); return; }
    if (reviewSource === "price") {
      if (!priceInspection) return;
      const result = applyPriceFile(inspection, priceInspection);
      if (audit) recordImportAudit(audit);
      setInspection(result.inspection); setPriceMatchReport(result.report); setPriceInspection(null); setPriceWorkbookStructure(null); setReviewSource("base"); setSelectedSheetIndex(0);
      return;
    }
    const key = "pmi-import-history";
    const now = new Date();
    const current = { name: inspection.fileName, importedAt: now.toISOString(), rows: inspection.sheets.reduce((sum, sheet) => sum + sheet.quality.validRecords, 0), fingerprint: inspection.fileFingerprint };
    try {
      const previous = JSON.parse(localStorage.getItem(key) ?? "[]") as Array<typeof current>;
      localStorage.setItem(key, JSON.stringify([current, ...previous.filter((entry) => entry.fingerprint !== current.fingerprint)].slice(0, 15)));
    } catch { /* history is optional and never blocks local analysis */ }
    if (audit) recordImportAudit(audit);
    const sessionResult = saveAnalysisSession(inspection);
    setSavedSessions(sessionResult.sessions);
    setFilters({}); setView("overview"); setStage("dashboard");
  }

  function importNewFile() { setInspection(null); setWorkbookStructure(null); setPriceInspection(null); setPriceWorkbookStructure(null); setReviewSource("base"); setImportedMonths([]); setPriceMatchReport(null); setMonthlyDraft([]); setColumnMapMismatch(null); setMismatchAcknowledged(false); setAnswer(""); setError(""); setStage("welcome"); }
  function restoreAnalysisSession(session: LocalAnalysisSession) { setInspection(refreshImportedInspection(session.inspection)); setSelectedSheetIndex(0); setFilters({}); setAnswer(""); setView("overview"); setStage("dashboard"); }
  function removeAnalysisSession(session: LocalAnalysisSession) { setSavedSessions(deleteAnalysisSession(session.id)); }
  function updateSessionTags(id: string, tags: string[]) { setSavedSessions(updateAnalysisSessionTags(id, tags)); }
  function saveItemReorderRule(itemId: string, reorderLevel: number, targetStock?: number) { setReorderRules(saveReorderRule({ itemId, reorderLevel, targetStock })); setReorderHistory(loadReorderRuleHistory()); }
  function clearItemReorderRule(itemId: string) { setReorderRules(removeReorderRule(itemId)); setReorderHistory(loadReorderRuleHistory()); }
  function exportInventoryOperations() { exportInventoryOperationsWorkbook(inventoryOperations, reorderRules); }
  async function importReorderRules(file: File): Promise<ReorderRulesImportResult> { const result = await inspectReorderRulesFile(file); if (!result.accepted.length) throw new Error("لم نجد قواعد صالحة للاستيراد. راجع المعرّف والحد ورصيد الهدف."); setReorderRules(saveReorderRulesBatch(result.accepted)); setReorderHistory(loadReorderRuleHistory()); return result; }
  async function importBackup(file: File, mode: BackupRestoreMode, password?: string): Promise<BackupRestoreResult> { const result = await restoreLocalBackup(file, mode, password); setSavedSessions(result.sessions); setReorderRules(result.rules); setReorderHistory(result.history); setReportPreferences(result.preferences); setReportLock(result.lock); return result; }
  async function exportBackupWithRecord(password?: string) { if (exportLocalBackup) await exportLocalBackup(password); recordBackupExport(); }
  function exportAuditLog() { exportAuditWorkbook(reorderHistory); }
  const backupReminderState = useMemo(() => loadBackupReminderSettings(), [stage]);
  function askData() { if (analytics) setAnswer(answerDataQuestion(question, analytics)); }
  function exportProducts() {
    if (!analytics) return;
    const rows = analytics.products.map((product) => ({ "الصنف": product.itemName, "الكود": product.itemCode ?? "", "الشركة": product.company ?? "", "التصنيف": product.category ?? "", "الكمية": product.quantity ?? "", "المبيعات": product.sales ?? "", "التكلفة": product.cost ?? "", "الربح": product.profit ?? "", "هامش الربح %": product.margin ?? "" }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "تحليل الأصناف");
    XLSX.writeFile(book, `تحليل_الصيدلية_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  async function exportManagerPdf() {
    if (!analytics || !reportRef.current) return;
    setPdfStatus("working"); setPdfError("");
    try {
      await exportManagerReportPdf(reportRef.current, `تقرير_${reportPreferences.profile.pharmacyName}_${new Date().toISOString().slice(0, 10)}.pdf`, { footerLabel: `${reportPreferences.profile.pharmacyName} · ${reportPreferences.profile.branchName}` });
      setPdfStatus("done");
    } catch (caught) {
      setPdfStatus("failed");
      setPdfError(caught instanceof Error ? caught.message : "تعذر إنشاء ملف PDF. حاول مرة أخرى.");
    }
  }
  function exportProductMovement() { exportProductMovementWorkbook(productMovement); }
  async function exportProductMovementPdf() {
    if (!movementReportRef.current) return;
    setMovementPdfStatus("working"); setMovementPdfError("");
    try {
      await exportManagerReportPdf(movementReportRef.current, `تقرير_حركة_الأصناف_${new Date().toISOString().slice(0, 10)}.pdf`, { footerLabel: `${reportPreferences.profile.pharmacyName} · حركة الأصناف` });
      setMovementPdfStatus("done");
    } catch (caught) {
      setMovementPdfStatus("failed");
      setMovementPdfError(caught instanceof Error ? caught.message : "تعذر إنشاء تقرير PDF لحركة الأصناف. حاول مرة أخرى.");
    }
  }
  function exportInventoryFlow() { exportInventoryFlowWorkbook(inventoryFlow); }
  async function exportInventoryFlowPdf() {
    if (!flowReportRef.current) return;
    setFlowPdfStatus("working"); setFlowPdfError("");
    try {
      await exportManagerReportPdf(flowReportRef.current, `تقرير_تدفق_المخزون_${new Date().toISOString().slice(0, 10)}.pdf`, { footerLabel: `${reportPreferences.profile.pharmacyName} · تدفق المخزون` });
      setFlowPdfStatus("done");
    } catch (caught) {
      setFlowPdfStatus("failed");
      setFlowPdfError(caught instanceof Error ? caught.message : "تعذر إنشاء تقرير PDF لتدفق المخزون. حاول مرة أخرى.");
    }
  }
  async function setReportPasscode(passcode: string) { setReportLock(await setLocalReportPasscode(passcode)); }
  async function verifyReportPasscode(passcode: string) { return verifyLocalReportPasscode(passcode, reportLock); }
  function clearReportPasscode() { setReportLock(removeLocalReportPasscode()); }

  if (stage === "welcome") return <WelcomeScreen dragging={dragging} processing={processing} error={error} fileInput={fileInput} monthlyFilesInput={monthlyFilesInput} sessions={savedSessions} monthlyDraft={monthlyDraft} importTemplates={importTemplates} templateName={templateName} onTemplateName={setTemplateName} onApplyTemplate={applyImportTemplate} onDeleteTemplate={removeImportTemplate} onSaveTemplate={saveCurrentImportTemplate} onChangeDraftMonth={changeDraftMonth} onRestore={restoreAnalysisSession} onDeleteSession={removeAnalysisSession} onUpdateTags={updateSessionTags} onExportBackup={exportLocalBackup} onImportBackup={importBackup} onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onChange={onFileChange} onMonthlyFilesChange={(event) => { selectMonthlyFiles(event.target.files); event.target.value = ""; }} onStartMonthly={() => { void beginMonthlyFiles(); }} onOpen={() => fileInput.current?.click()} onOpenMonthly={() => monthlyFilesInput.current?.click()} />;
  if (stage === "review" && inspection && selectedSheet) {
    const activeInspection = reviewSource === "price" ? priceInspection : inspection;
    const activeStructure = reviewSource === "price" ? priceWorkbookStructure : workbookStructure;
    if (activeInspection) return <><ImportReviewCenter inspection={activeInspection} structure={activeStructure} selectedSheetIndex={selectedSheetIndex} onSheet={setSelectedSheetIndex} onChange={reviewSource === "price" ? setPriceInspection : setInspection} onCancel={reviewSource === "price" ? () => { setPriceInspection(null); setPriceWorkbookStructure(null); setReviewSource("base"); setSelectedSheetIndex(0); } : importNewFile} onConfirm={confirmImport} onRequestPriceReview={reviewSource === "base" ? beginPriceReview : undefined} priceMatchReport={reviewSource === "base" ? priceMatchReport : null} reviewKind={reviewSource === "price" ? "prices" : "analysis"} columnMapTemplates={reviewSource === "base" ? columnMapTemplates : []} onSaveColumnMapTemplate={reviewSource === "base" ? saveCurrentColumnMapTemplate : undefined} onDeleteColumnMapTemplate={reviewSource === "base" ? removeColumnMapTemplate : undefined} />{columnMapMismatch && !mismatchAcknowledged && <ColumnMapMismatchWarning compatibility={columnMapMismatch} onContinue={() => setMismatchAcknowledged(true)} onCancel={importNewFile} />}</>;
  }
  if (!analytics || !inspection) return null;

  const sheet = inspection.sheets.find((item) => item.name === analytics.sourceSheet) ?? inspection.sheets[0];
  const availableCompanies = Array.from(new Set(analytics.products.map((item) => item.company).filter((item): item is string => Boolean(item)))).sort();
  const displayProducts = analytics.products.filter((product) => `${product.itemName} ${product.itemCode ?? ""} ${product.company ?? ""}`.toLowerCase().includes(tableSearch.toLowerCase()));

  return <div className="app-canvas min-h-screen" dir="rtl">
    <aside className="no-print fixed inset-y-0 right-0 z-30 hidden w-[260px] flex-col bg-[#123c37] px-4 py-5 text-white lg:flex">
      <MiniLogo />
      <div className="pulse-line mt-6" />
      <button onClick={importNewFile} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#d89b42] px-4 py-3 text-sm font-bold text-[#173c36] hover:bg-[#e4af5e]"><Plus className="size-4" />استيراد بيانات جديدة</button>
      <nav className="mt-7 space-y-1.5">
        {navItems.map((item) => { const Icon = item.icon; const selected = view === item.id; return <button key={item.id} onClick={() => setView(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-right text-sm font-medium ${selected ? "bg-[#f2f4ed] text-[#17443d] shadow-sm" : "text-[#b8d1c7] hover:bg-white/8 hover:text-white"}`}><Icon className="size-[18px]" />{item.label}{item.id === "alerts" && analytics.alerts.filter((alert) => alert.level !== "positive").length > 0 && <span className={`mr-auto grid size-5 place-items-center rounded-full text-[10px] font-bold ${selected ? "bg-[#e8f2ed] text-[#176950]" : "bg-[#e3a14b] text-[#143f38]"}`}>{analytics.alerts.filter((alert) => alert.level !== "positive").length}</span>}</button>; })}
      </nav>
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><div className="grid size-8 place-items-center rounded-full bg-[#8fcbb8] text-[#123c37]"><CircleUserRound className="size-4" /></div><div className="min-w-0 text-right"><p className="text-xs font-semibold text-white">مدير الصيدلية</p><p className="mt-0.5 text-[10px] text-[#aac9bd]">جلسة تحليل محلية</p></div><MoreHorizontal className="mr-auto size-4 text-[#aac9bd]" /></div>
        <p className="mt-3 px-2 text-[10px] leading-5 text-[#92b3a7]">تظل بيانات الملف داخل متصفحك ولا تُرسل لخدمة خارجية.</p>
      </div>
    </aside>

    <main className="min-h-screen lg:mr-[260px]">
      <header className="no-print sticky top-0 z-20 flex min-h-[72px] items-center justify-between border-b border-[#dde8e1]/90 bg-[#fafaf6]/88 px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3"><button className="lg:hidden grid size-10 place-items-center rounded-xl border border-[#d9e6df] bg-white text-[#16453d]" onClick={importNewFile} aria-label="استيراد ملف جديد"><Upload className="size-4" /></button><div><div className="flex items-center gap-2"><h1 className="display-font text-lg font-semibold tracking-[-.02em] text-[#173f38]">{navItems.find((item) => item.id === view)?.label}</h1><span className="hidden rounded-md bg-[#e8f2ed] px-2 py-0.5 text-[10px] font-bold text-[#23715a] sm:inline">البيانات المستوردة</span></div><p className="mt-0.5 text-[11px] text-[#74857f]">{analytics.dateRange ? `${dateText(analytics.dateRange.from)} — ${dateText(analytics.dateRange.to)}` : `${analytics.totalRows.toLocaleString("ar-EG")} سجل تم تحليله`}</p></div></div>
        <div className="flex items-center gap-2"><button onClick={() => setShowFilters((visible) => !visible)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${showFilters ? "border-[#0b6b5b] bg-[#e7f4ee] text-[#155d50]" : "border-[#d9e6df] bg-white text-[#41665c] hover:border-[#9ec9ba]"}`}><SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">الفلاتر</span></button><button onClick={() => { setView("report"); }} className="hidden items-center gap-2 rounded-xl bg-[#123c37] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] sm:inline-flex"><FileBarChart className="size-4" />تقرير المدير</button></div>
      </header>

      {showFilters && <FilterPanel analytics={analytics} filters={filters} companies={availableCompanies} onChange={setFilters} onReset={() => setFilters({})} />}
      <section className="px-4 py-5 sm:px-7 sm:py-7">{renderDashboardView({ view, analytics, sheet, inspection, tableSearch, setTableSearch, question, setQuestion, answer, askData, exportProducts, exportManagerPdf, pdfStatus, pdfError, reportRef, exportProductMovement, exportProductMovementPdf, movementPdfStatus, movementPdfError, movementReportRef, inventoryFlow, exportInventoryFlow, exportInventoryFlowPdf, flowPdfStatus, flowPdfError, flowReportRef, setView, reportPreferences, setReportPreferences, comparison, inventoryOperations, productMovement, reorderRules, reorderHistory, saveItemReorderRule, clearItemReorderRule, exportInventoryOperations, importReorderRules, exportAuditLog, reportLock, setReportPasscode, verifyReportPasscode, clearReportPasscode })}</section>
    </main>
  </div>;
}

function WelcomeScreen({ dragging, processing, error, fileInput, monthlyFilesInput, sessions, monthlyDraft, importTemplates, templateName, onTemplateName, onApplyTemplate, onDeleteTemplate, onSaveTemplate, onChangeDraftMonth, onRestore, onDeleteSession, onUpdateTags, onExportBackup, onImportBackup, onDrop, onDragOver, onDragLeave, onChange, onMonthlyFilesChange, onStartMonthly, onOpen, onOpenMonthly }: { dragging: boolean; processing: boolean; error: string; fileInput: React.RefObject<HTMLInputElement | null>; monthlyFilesInput: React.RefObject<HTMLInputElement | null>; sessions: LocalAnalysisSession[]; monthlyDraft: MonthlyFileDraft[]; importTemplates: ImportTemplate[]; templateName: string; onTemplateName: (value: string) => void; onApplyTemplate: (template: ImportTemplate) => void; onDeleteTemplate: (id: string) => void; onSaveTemplate: () => void; onChangeDraftMonth: (index: number, value: string) => void; onRestore: (session: LocalAnalysisSession) => void; onDeleteSession: (session: LocalAnalysisSession) => void; onUpdateTags: (id: string, tags: string[]) => void; onExportBackup: (password?: string) => Promise<void> | void; onImportBackup: (file: File, mode: BackupRestoreMode, password?: string) => Promise<BackupRestoreResult>; onDrop: (event: DragEvent<HTMLDivElement>) => void; onDragOver: (event: DragEvent<HTMLDivElement>) => void; onDragLeave: () => void; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onMonthlyFilesChange: (event: ChangeEvent<HTMLInputElement>) => void; onStartMonthly: () => void; onOpen: () => void; onOpenMonthly: () => void; }) {
  return <main className="grain-overlay app-canvas relative flex min-h-screen items-stretch overflow-hidden px-4 py-4 sm:p-7">
    <div className="absolute inset-y-0 right-0 hidden w-[28%] bg-[#123c37] lg:block" />
    <div className="relative z-10 mx-auto flex w-full max-w-[1380px] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[#fbfaf5]/96 shadow-[0_20px_64px_rgba(24,65,56,.09)] backdrop-blur-sm lg:flex-row">
      <div className="absolute inset-y-0 right-0 z-20 hidden w-14 flex-col items-center border-l border-[#d8e7df] bg-[#113b36] py-6 lg:flex"><img src={ASSET.logo} alt="رمز نظام ذكاء الصيدلية" className="size-8" /><div className="mt-10 flex flex-col gap-5 text-[#a7c8bb]"><LayoutDashboard className="size-4" /><BellRing className="size-4" /><FileBarChart className="size-4" /></div><div className="mt-auto"><HeartPulse className="size-4 text-[#d8a345]" /></div></div>
      <section className="decision-field flex min-h-0 flex-none flex-col p-7 sm:p-10 lg:min-h-[570px] lg:flex-[1.58] lg:pr-20 lg:pl-16 lg:py-14">
        <div className="flex items-center justify-between"><div className="brand-lockup brand-lockup--seal flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-[#123c37] shadow-lg"><img src={ASSET.logo} alt="رمز نظام ذكاء الصيدلية" className="size-8 object-contain" /></div><div><p className="display-font text-[17px] font-semibold leading-5 text-[#143e37]">ذكاء مدير الصيدلية</p><p className="brand-wordmark mt-0.5 text-[9px] font-bold text-[#6f9184]">PHARMACY MANAGER <span className="text-[#0b6b5b]">•</span> INTELLIGENCE</p></div></div><span className="rounded-full border border-[#c4ddd3] bg-[#eaf6f0] px-3 py-1.5 text-[10px] font-bold text-[#23715a]"><ShieldCheck className="ml-1 inline size-3.5" />تحليل محلي آمن</span></div>
        <div className="mt-14 max-w-[760px] pt-8 sm:pt-10 lg:mt-auto"><div className="mb-4 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#1d6a5b]"><span className="h-px w-8 bg-[#0b6b5b]" />تشخيص تنفيذي · دليل قابل للمراجعة · إجراء تالٍ</div><h1 className="display-font max-w-[690px] text-[30px] leading-[1.42] font-semibold tracking-[-.04em] text-[#173f38] sm:text-[41px]">حدّد ما يستحق قرارك،<br/><span className="text-[#0b6b5b]">ثم اقرأ الدليل بثقة.</span></h1><p className="mt-5 max-w-[650px] text-[14px] leading-8 text-[#536e65]">يقيس النظام موثوقية المصدر ويربط الدليل بمسارات التدخل اليومية، لتصل إلى نتيجة عملية قبل فتح أي جدول تفصيلي.</p>
          <div className="mt-8 flex flex-wrap gap-3"><div className="flex items-center gap-2 rounded-xl bg-[#edf5f0] px-3 py-2 text-xs font-semibold text-[#276454]"><Check className="size-4" />عربي وإنجليزي</div><div className="flex items-center gap-2 rounded-xl bg-[#edf5f0] px-3 py-2 text-xs font-semibold text-[#276454]"><Check className="size-4" />XLSX · XLS · CSV</div><div className="flex items-center gap-2 rounded-xl bg-[#f2f4ee] px-3 py-2 text-xs font-semibold text-[#486258]"><Check className="size-4" />لا اختراع للبيانات</div></div>
          <div className="decision-preview decision-preview--anchor decision-preview--hero mt-7 max-w-[730px] overflow-hidden rounded-2xl border border-[#a7cebf] p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><HeartPulse className="size-4 text-[#0b6b5b]" /><p className="text-xs font-bold text-[#244d44]">تشخيص القرار اليومي</p></div><span className="rounded-md border border-[#d8e6df] bg-white/80 px-2 py-1 text-[9px] font-bold text-[#4b7769]">النتيجة تُبنى بعد التحقق</span></div><div className="decision-trace decision-trace--clinical mt-3" /><div className="mt-3 grid grid-cols-3 gap-2"><div className="decision-priority decision-priority--focus"><span>01 · نتيجة</span><p><b>ركّز هنا</b>الدليل: أصناف مرتفعة المبيعات تحتاج فحص الهامش.<em>الإجراء: راجع الهامش أولًا.</em></p></div><div className="decision-priority decision-priority--alert"><span>02 · دليل</span><p><b>تنبيه يومي</b>الدليل: انخفاض أو انتهاء قبل أن يتحول لخسارة.<em>الإجراء: افحص سبب التغير.</em></p></div><div className="decision-priority decision-priority--opportunity"><span>03 · إجراء</span><p><b>فرصة قرار</b>الدليل: طلب أو نقل مخزون يستحق خطوة.<em>الإجراء: اختر التدخل التالي.</em></p></div></div></div>
        </div>
        <div className="mt-auto flex items-center gap-3 border-t border-[#dfeae4] pt-5 text-[11px] text-[#70837c]"><HeartPulse className="size-4 text-[#0b6b5b]" /><p>مسار الجلسة: مصدر القرار <ChevronLeft className="mx-1 inline size-3" /> فحص الثقة <ChevronLeft className="mx-1 inline size-3" /> أولوية المدير</p></div>
      </section>
      <section className="source-context relative flex min-h-[390px] flex-1 items-center justify-center overflow-hidden bg-[#153d37] px-7 py-10 sm:px-10 lg:min-h-full lg:flex-[.42]">
        <div className="clinical-grid clinical-grid--quiet absolute inset-0" /><img src={ASSET.abstract} alt="مسارات تقرير سريري" className="absolute inset-0 size-full object-cover opacity-[.022] mix-blend-screen" /><div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(131,207,177,.09),transparent_22rem)]" />
        <div className="relative w-full max-w-[320px]"><div className="mb-4 flex items-center justify-between text-[11px] font-bold tracking-wide text-[#bbd9cf]"><span className="flex items-center gap-2"><FileSpreadsheet className="size-4 text-[#d8a345]" />إجراء تالٍ · تدقيق المصدر</span><span className="rounded-full bg-white/10 px-2.5 py-1 text-[#d9eee7]">بعد التشخيص</span></div><div className="pulse-line pulse-line--active mb-4" /><div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave} onClick={onOpen} className={`group relative grid min-h-[214px] cursor-pointer place-items-center overflow-hidden rounded-[1.25rem] border-2 border-dashed p-6 text-center transition-all ${dragging ? "border-[#d9aa5a] bg-[#f8e7c6]/15" : "border-[#a2c5b9]/50 bg-[#f4f7f1]/[.055] hover:border-[#e0b66d] hover:bg-white/[.09]"}`}>
            <input ref={fileInput} onChange={onChange} type="file" accept=".xlsx,.xls,.csv" className="hidden" />
            <input ref={monthlyFilesInput} onChange={onMonthlyFilesChange} type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" />
            {processing ? <div><div className="mx-auto grid size-12 place-items-center rounded-xl border border-[#c4e2d5]/25 bg-white/10"><LoaderCircle className="size-7 animate-spin text-[#d8a345]" /></div><div className="pulse-line pulse-line--active mx-auto mt-4 w-40" /><p className="mt-4 text-sm font-bold text-white">نفحص موثوقية المصدر…</p><p className="mt-2 text-xs text-[#c4d9d1]">الشيتات <span className="text-[#d8ad5c]">←</span> الأعمدة <span className="text-[#d8ad5c]">←</span> القيم</p></div> : <div className="relative"><div className="mx-auto grid size-[56px] place-items-center rounded-2xl border border-[#c4e2d5]/35 bg-[#76bda3]/12 text-[#d8ad5c]"><Upload className="size-7" /></div><p className="mt-4 display-font text-lg font-semibold text-white">تدقيق مصدر البيانات</p><p className="mt-2 text-xs leading-6 text-[#c7dcd4]">اختر ملف Excel من جهازك لبدء التحقق</p><span className="mt-4 inline-flex rounded-lg bg-[#f2faf6] px-4 py-2.5 text-xs font-bold text-[#143f38] group-hover:bg-white">فتح ملف البيانات</span></div>}
          </div>
          <button onClick={onOpenMonthly} disabled={processing} className="mt-3 w-full rounded-xl border border-[#b8d8cb]/40 bg-[#76bda3]/10 px-3 py-2.5 text-xs font-bold text-[#e3f1eb] hover:bg-[#76bda3]/20 disabled:opacity-60"><FileSpreadsheet className="ml-1 inline size-4 text-[#d8ad5c]" />رفع ملفات أشهر متعددة للتوقف والتغطية</button>
          <p className="mt-2 text-center text-[10px] leading-5 text-[#b5d0c5]">سمِّها مثل يونيو.xlsx، يوليو.xlsx، أغسطس.xlsx أو 6.xlsx، 7.xlsx، 8.xlsx. وعند عدم وضوح الاسم اختر الشهر يدويًا.</p>
          {monthlyDraft.length > 0 && <div className="mt-4 rounded-2xl border border-[#b8d8cb]/40 bg-[#0d312d]/45 p-3 text-right"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold text-white">ضبط فترات الملفات</p><p className="mt-1 text-[10px] leading-5 text-[#b5d0c5]">راجع الشهر المقترح أو حدده يدويًا قبل بدء المقارنة.</p></div><span className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold text-[#dcefe7]">{monthlyDraft.length} ملفات</span></div><div className="mt-3 space-y-2">{monthlyDraft.map((entry, index) => <div key={`${entry.file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-white/7 px-2.5 py-2"><div className="min-w-0"><p className="truncate text-[10px] font-bold text-white">{entry.file.name}</p><p className="mt-0.5 text-[9px] text-[#aac9bd]">{entry.inferred ? "مقترح من اسم الملف" : "اختيار يدوي أو يحتاج ضبط"}</p></div><select value={entry.month ?? ""} onChange={(event) => onChangeDraftMonth(index, event.target.value)} aria-label={`شهر ${entry.file.name}`} className="rounded-lg border border-[#c0ddcf]/35 bg-[#f4f8f3] px-2 py-1.5 text-[10px] font-bold text-[#173f38] outline-none"><option value="">اختر الشهر</option>{MONTH_OPTIONS.map(([month, label]) => <option key={month} value={month}>{label}</option>)}</select></div>)}</div><div className="mt-3 border-t border-white/10 pt-3"><div className="flex gap-2"><input value={templateName} onChange={(event) => onTemplateName(event.target.value)} placeholder="اسم قالب محلي، مثال: دورة نهاية الشهر" className="min-w-0 flex-1 rounded-lg border border-[#b8d8cb]/35 bg-white/10 px-2.5 py-2 text-[10px] text-white placeholder:text-[#aac9bd] outline-none focus:border-[#d8ad5c]" /><button onClick={onSaveTemplate} type="button" className="shrink-0 rounded-lg border border-[#d8ad5c]/55 bg-[#d8ad5c]/10 px-2.5 py-2 text-[10px] font-bold text-[#f7d99f] hover:bg-[#d8ad5c]/20">حفظ قالب</button></div>{importTemplates.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{importTemplates.map((template) => <span key={template.id} className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1"><button onClick={() => onApplyTemplate(template)} type="button" className="text-[9px] font-bold text-[#e6f2ec] hover:text-[#f5d497]">{template.name}</button><button onClick={() => onDeleteTemplate(template.id)} type="button" aria-label={`حذف قالب ${template.name}`} className="text-[#c7e0d6] hover:text-[#f4c7c0]"><X className="size-3" /></button></span>)}</div>}</div><button onClick={onStartMonthly} disabled={processing} type="button" className="mt-3 w-full rounded-xl bg-[#d8a345] px-3 py-2.5 text-xs font-bold text-[#153d37] hover:bg-[#e4af5e] disabled:opacity-60"><BarChart3 className="ml-1 inline size-4" />بدء تحليل الأشهر المحددة</button></div>}
          {error && <div className="mt-4 flex gap-3 rounded-xl border border-[#f1aaa3]/30 bg-[#c84b42]/15 p-3 text-right text-xs leading-6 text-[#ffe4e2]"><AlertCircle className="mt-1 size-4 shrink-0" /><span>{error}</span></div>}
          <div className="mt-6 flex items-center justify-between text-[10px] text-[#a7c5ba]"><span>لا يغادر الملف متصفحك</span><span>حتى 100 ألف سجل موصى بها</span></div>
          <SessionArchiveCenter sessions={sessions} onRestore={onRestore} onDelete={onDeleteSession} onUpdateTags={onUpdateTags} onExportBackup={onExportBackup} onImportBackup={onImportBackup} />
        </div>
      </section>
    </div>
  </main>;
}

function ReviewScreen({ inspection, selectedSheet, selectedSheetIndex, importedMonths, priceMatchReport, onPriceFile, onSheet, onCancel, onConfirm }: { inspection: ImportInspection; selectedSheet: SheetInspection; selectedSheetIndex: number; importedMonths: ImportedMonth[]; priceMatchReport: PriceMatchReport | null; onPriceFile: (file?: File) => Promise<void>; onSheet: (index: number) => void; onCancel: () => void; onConfirm: () => void; }) {
  const quality = qualityStyle(selectedSheet.quality.score);
  const recognized = selectedSheet.mappings.filter((mapping) => mapping.field !== "unknown");
  const duplicate = (() => { try { return (JSON.parse(localStorage.getItem("pmi-import-history") ?? "[]") as Array<{ fingerprint?: string }>).some((entry) => entry.fingerprint === inspection.fileFingerprint); } catch { return false; } })();
  return <main className="app-canvas min-h-screen p-4 sm:p-7" dir="rtl"><div className="mx-auto max-w-[1320px]"><header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#123c37]"><img src={ASSET.logo} alt="رمز النظام" className="size-8" /></div><div><p className="display-font text-xl font-semibold text-[#173f38]">مراجعة الاستيراد</p><p className="text-xs text-[#6c8279]">{inspection.fileName} · {Math.round(inspection.fileSize / 1024).toLocaleString("ar-EG")} ك.ب</p></div></div><div className="flex gap-2"><button onClick={onCancel} className="rounded-xl border border-[#d6e4dd] bg-white px-4 py-2.5 text-xs font-bold text-[#43655b] hover:border-[#a7cabc]">إلغاء</button><button onClick={onConfirm} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c]">تأكيد الاستيراد <ArrowLeft className="mr-1 inline size-3.5" /></button></div></header>
    {duplicate && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#f0d9a0] bg-[#fff8df] p-4 text-sm text-[#765d15]"><AlertCircle className="mt-0.5 size-5 shrink-0" /><div><p className="font-bold">يبدو أن هذا الملف تم استيراده مسبقًا.</p><p className="mt-1 text-xs leading-5">في هذه النسخة المحلية، تأكيد الاستيراد سيستبدل جلسة التحليل الحالية ولن يضاعف أي سجلات.</p></div></div>}
    {(importedMonths.length > 0 || priceMatchReport) && <section className="mb-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-[#bcded0] bg-[#eff9f3] p-4"><p className="text-xs font-bold text-[#245d4e]">فترات المقارنة المستوردة</p><p className="mt-1 text-[11px] leading-5 text-[#5b786e]">ستُستخدم هذه الملفات لتحليل التوقف الشهري وتغطية الرصيد.</p><div className="mt-3 flex flex-wrap gap-2">{importedMonths.length ? importedMonths.map((month) => <span key={month.fileName} className="rounded-lg border border-[#c4e2d5] bg-white px-2.5 py-1.5 text-[10px] font-bold text-[#2c6957]">{month.label} · {formatNumber(month.rows)} سجل <i className="mr-1 not-italic text-[#6d877e]">({month.source})</i></span>) : <span className="text-[11px] text-[#72867e]">ملف واحد؛ التحليل الزمني غير مفعل.</span>}</div></div><div className="rounded-2xl border border-[#ead7aa] bg-[#fff9e8] p-4"><p className="text-xs font-bold text-[#765917]">ملف أسعار اختياري</p><p className="mt-1 text-[11px] leading-5 text-[#896f2e]">ارفع ملفًا يحوي كود/اسم الصنف مع سعر الشراء أو الجمهور؛ المطابقة بالكود أولًا ثم الاسم.</p><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#173f38] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#17564c]"><FileSpreadsheet className="size-3.5" />رفع ملف الأسعار<input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => { void onPriceFile(event.target.files?.[0]); event.target.value = ""; }} /></label>{priceMatchReport && <div className="mt-3 rounded-xl border border-[#ead9af] bg-white/70 p-3"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold text-[#705c22]">نسبة مطابقة سجلات التحليل</p><p className="mt-1 text-2xl font-bold text-[#5d531e]">{priceMatchReport.matchRate.toLocaleString("ar-EG", { maximumFractionDigits: 1 })}%</p></div><span className="rounded-lg bg-[#fff4d7] px-2 py-1 text-[10px] font-bold text-[#735d17]">{formatNumber(priceMatchReport.matchedRecords)} / {formatNumber(priceMatchReport.baseRecords)}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><p className="rounded-lg bg-[#edf8f2] px-2 py-1.5 text-[#23705a]">{formatNumber(priceMatchReport.matchedByCode)} مطابقة بالكود</p><p className="rounded-lg bg-[#f4f6f3] px-2 py-1.5 text-[#536b62]">{formatNumber(priceMatchReport.matchedByName)} بالاسم</p><p className="rounded-lg bg-[#fff0ee] px-2 py-1.5 text-[#a14238]">{formatNumber(priceMatchReport.unmatchedRecords)} سجل غير مطابق</p><p className="rounded-lg bg-[#fff6e4] px-2 py-1.5 text-[#8b6718]">{formatNumber(priceMatchReport.unusedPriceRows)} سطر أسعار غير مستخدم</p></div><details className="mt-3 rounded-lg border border-[#eadfbd] bg-[#fffcf3] px-2.5 py-2"><summary className="cursor-pointer text-[10px] font-bold text-[#765f1a]">الأصناف غير المطابقة ({formatNumber(priceMatchReport.unmatchedUniqueItems)})</summary><div className="mt-2 max-h-28 space-y-1 overflow-auto text-[10px] text-[#715f38]">{priceMatchReport.unmatchedItems.length ? priceMatchReport.unmatchedItems.map((item, index) => <p key={`${item.itemCode}-${item.itemName}-${index}`} className="rounded bg-white px-2 py-1"><b>{item.itemName || item.itemCode || "سجل بلا معرّف"}</b>{item.itemCode && <span className="mr-1 text-[#8a7b58]">· {item.itemCode}</span>}<span className="mr-1">({formatNumber(item.occurrences)} · {item.reason})</span></p>) : <p>كل أصناف ملف التحليل تطابقت مع ملف الأسعار.</p>}</div></details><details className="mt-2 rounded-lg border border-[#eadfbd] bg-[#fffcf3] px-2.5 py-2"><summary className="cursor-pointer text-[10px] font-bold text-[#765f1a]">أسعار لم تُستخدم ({formatNumber(priceMatchReport.unusedPriceRows)})</summary><div className="mt-2 max-h-24 space-y-1 overflow-auto text-[10px] text-[#715f38]">{priceMatchReport.unusedPriceItems.length ? priceMatchReport.unusedPriceItems.map((item, index) => <p key={`${item.itemCode}-${item.itemName}-${index}`} className="rounded bg-white px-2 py-1"><b>{item.itemName || item.itemCode || "سطر بلا معرّف"}</b>{item.itemCode && <span className="mr-1 text-[#8a7b58]">· {item.itemCode}</span>}</p>) : <p>لا توجد أسعار زائدة غير مستخدمة.</p>}</div></details></div>}</div></section>}
    <div className="grid gap-5 lg:grid-cols-[290px_1fr]"><aside className="panel-shadow h-fit rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] p-4"><p className="mb-3 px-1 text-[11px] font-bold tracking-wide text-[#6d8279]">الشيتات المكتشفة ({inspection.sheets.length})</p><div className="space-y-2">{inspection.sheets.map((sheet, index) => <button key={sheet.name} onClick={() => onSheet(index)} className={`w-full rounded-xl border p-3 text-right ${index === selectedSheetIndex ? "border-[#75ae9e] bg-[#eaf5ef]" : "border-transparent bg-[#f3f6f2] hover:border-[#d1e3da]"}`}><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-bold text-[#1e4a42]">{sheet.name}</span><span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${qualityStyle(sheet.quality.score).color} bg-white`}>{sheet.quality.score}%</span></div><p className="mt-1.5 text-[11px] text-[#72867e]">{sheet.quality.validRecords.toLocaleString("ar-EG")} سجل صالح · {sheet.columns} عمود</p></button>)}</div><div className="mt-5 border-t border-[#e2ece6] pt-4"><p className="text-xs font-bold text-[#2d564d]">ما الذي سيحدث بعد التأكيد؟</p><ol className="mt-3 space-y-2 text-[11px] leading-5 text-[#70837c]"><li>1. تُحسب المؤشرات من السجلات الصالحة فقط.</li><li>2. يظهر أي تحليل غير متاح بوضوح.</li><li>3. لا تُرسل البيانات خارج المتصفح.</li></ol></div></aside>
      <div className="space-y-5">{selectedSheet.layoutNote && <div className="flex items-start gap-3 rounded-2xl border border-[#bdddd0] bg-[#eff9f3] px-4 py-3 text-xs leading-6 text-[#2c6957]"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><div><b>تمت معالجة بنية التصدير.</b><span className="mr-1">{selectedSheet.layoutNote}</span></div></div>}<div className="panel-shadow rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-5"><div><div className="flex items-center gap-2"><span className="display-font text-xl font-semibold text-[#183f38]">ملخص جودة البيانات</span><span className={`rounded-md border px-2 py-1 text-[10px] font-bold ${quality.color} ${selectedSheet.quality.score >= 90 ? "border-[#c8e7db] bg-[#edf8f3]" : "border-[#f0dcaf] bg-[#fff8e5]"}`}>{quality.label}</span></div><p className="mt-2 text-xs leading-6 text-[#6d8179]">تم العثور على رأس الجدول في الصف {selectedSheet.headerRowIndex + 1}، واستُبعدت صفوف الإجماليات من البيانات التحليلية.</p></div><div className="flex items-center gap-4"><div className="relative grid size-[74px] place-items-center rounded-full" style={{ background: `conic-gradient(#0b6b5b ${selectedSheet.quality.score * 3.6}deg, #e5eee9 0deg)` }}><div className="grid size-[61px] place-items-center rounded-full bg-[#fcfcf8]"><span className="text-lg font-bold text-[#18483f]">{selectedSheet.quality.score}%</span></div></div><div className="text-right"><p className="text-[11px] font-bold text-[#5d756c]">Data Quality Score</p><p className="mt-1 text-xs text-[#73867f]">درجة مبنية على القيم المكتشفة</p></div></div></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="السجلات الصالحة" value={formatNumber(selectedSheet.quality.validRecords)} /><Stat label="الأعمدة" value={formatNumber(selectedSheet.columns)} /><Stat label="حقول تم التعرف عليها" value={formatNumber(recognized.length)} /><Stat label="صفوف مستبعدة" value={formatNumber(selectedSheet.quality.excludedRecords)} /></div></div>
        <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><div className="panel-shadow overflow-hidden rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8]"><div className="flex items-center justify-between border-b border-[#e4eee8] px-5 py-4"><div><p className="font-bold text-[#214a41]">مطابقة الأعمدة المقترحة</p><p className="mt-1 text-[11px] text-[#74867f]">نطابق المعنى لا ترتيب العمود. راجع الحقول منخفضة الثقة فقط.</p></div><span className="rounded-lg bg-[#eaf5ef] px-2.5 py-1.5 text-[10px] font-bold text-[#207059]">{recognized.length} حقل معروف</span></div><div className="scrollbar-thin max-h-[345px] overflow-auto"><table className="w-full text-right"><thead className="sticky top-0 bg-[#f5f8f5] text-[10px] font-bold text-[#6f837a]"><tr><th className="px-5 py-3">عمود الملف</th><th className="px-4 py-3">التفسير</th><th className="px-4 py-3">الثقة</th><th className="px-4 py-3">عينة</th></tr></thead><tbody>{selectedSheet.mappings.map((mapping) => <tr key={mapping.sourceColumn} className="border-t border-[#edf2ee] text-xs"><td className="px-5 py-3 font-semibold text-[#2c554b]">{mapping.sourceColumn}</td><td className="px-4 py-3 text-[#5c7269]">{mapping.field === "unknown" ? "لم يتم التعرف عليه" : fieldArabicName[mapping.field]}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${mapping.confidence === "عالية" ? "bg-[#e8f5ef] text-[#27705b]" : mapping.confidence === "متوسطة" ? "bg-[#fff5df] text-[#93610c]" : "bg-[#f5eeee] text-[#8c5b53]"}`}>{mapping.confidence}</span></td><td className="max-w-[100px] truncate px-4 py-3 text-[#84938e]">{mapping.sample}</td></tr>)}</tbody></table></div></div>
          <div className="panel-shadow overflow-hidden rounded-2xl border border-[#dbe8e1] bg-[#fcfcf8]"><div className="border-b border-[#e4eee8] px-5 py-4"><p className="font-bold text-[#214a41]">معاينة البيانات</p><p className="mt-1 text-[11px] text-[#74867f]">أول 10 سجلات من الشيت بعد تحديد العناوين.</p></div><div className="scrollbar-thin max-h-[345px] overflow-auto"><table className="w-full min-w-[560px] text-right"><thead className="sticky top-0 bg-[#f5f8f5] text-[10px] font-bold text-[#6f837a]"><tr>{selectedSheet.headers.slice(0, 7).map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody>{selectedSheet.preview.map((record, rowIndex) => <tr key={rowIndex} className="border-t border-[#edf2ee] text-[11px] text-[#546d64]">{selectedSheet.headers.slice(0, 7).map((header) => <td key={header} className="max-w-[135px] truncate px-4 py-3">{record[header] === null || record[header] === undefined ? "—" : String(record[header])}</td>)}</tr>)}</tbody></table></div></div></div>
        {selectedSheet.quality.issues.length > 0 && <div className="rounded-2xl border border-[#f1debd] bg-[#fffaf1] p-5"><div className="flex items-center gap-2"><CircleHelp className="size-4 text-[#a57420]" /><p className="text-sm font-bold text-[#745816]">نقاط تحتاج معرفة قبل التحليل</p></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{selectedSheet.quality.issues.map((issue) => <p key={issue.type} className="rounded-xl bg-white/80 px-3 py-2.5 text-xs leading-5 text-[#705e32]"><b>{issue.count.toLocaleString("ar-EG")} {issue.type}:</b> {issue.detail}</p>)}</div></div>}
      </div></div></div></main>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#f2f6f2] px-3 py-3"><p className="text-[10px] font-bold text-[#74867f]">{label}</p><p className="mt-1.5 text-base font-bold text-[#254f45]">{value}</p></div>; }

function FilterPanel({ analytics, filters, companies, onChange, onReset }: { analytics: DashboardAnalytics; filters: DashboardFilters; companies: string[]; onChange: (filters: DashboardFilters) => void; onReset: () => void; }) {
  const toInputDate = (date?: Date) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : "";
  return <div className="no-print border-b border-[#dce8e1] bg-[#f4f8f4] px-4 py-4 sm:px-7"><div className="mx-auto flex max-w-[1350px] flex-wrap items-end gap-3"><div className="ml-auto flex items-center gap-2 text-xs font-bold text-[#31574d]"><Filter className="size-4 text-[#0b6b5b]" />فلاتر التحليل</div>{analytics.dateRange && <><label className="text-[10px] font-semibold text-[#71837c]">من تاريخ<input type="date" value={toInputDate(filters.from)} onChange={(event) => onChange({ ...filters, from: event.target.value ? new Date(event.target.value) : undefined })} className="mt-1 block rounded-lg border border-[#cedfd7] bg-white px-2 py-2 text-xs text-[#285148]" /></label><label className="text-[10px] font-semibold text-[#71837c]">إلى تاريخ<input type="date" value={toInputDate(filters.to)} onChange={(event) => onChange({ ...filters, to: event.target.value ? new Date(`${event.target.value}T23:59:59`) : undefined })} className="mt-1 block rounded-lg border border-[#cedfd7] bg-white px-2 py-2 text-xs text-[#285148]" /></label></>}{companies.length > 0 && <label className="text-[10px] font-semibold text-[#71837c]">الشركة<select value={filters.company ?? "all"} onChange={(event) => onChange({ ...filters, company: event.target.value === "all" ? undefined : event.target.value })} className="mt-1 block min-w-[150px] rounded-lg border border-[#cedfd7] bg-white px-2 py-2 text-xs text-[#285148]"><option value="all">كل الشركات</option>{companies.map((company) => <option key={company} value={company}>{company}</option>)}</select></label>}<button onClick={onReset} className="rounded-lg px-3 py-2 text-xs font-bold text-[#59736a] hover:bg-white">إعادة الضبط</button></div></div>;
}

function renderDashboardView(props: { view: DashboardView; analytics: DashboardAnalytics; sheet: SheetInspection; inspection: ImportInspection; tableSearch: string; setTableSearch: (value: string) => void; question: string; setQuestion: (value: string) => void; answer: string; askData: () => void; exportProducts: () => void; exportManagerPdf: () => void; pdfStatus: "idle" | "working" | "done" | "failed"; pdfError: string; reportRef: React.RefObject<HTMLElement | null>; exportProductMovement: () => void; exportProductMovementPdf: () => void; movementPdfStatus: "idle" | "working" | "done" | "failed"; movementPdfError: string; movementReportRef: React.RefObject<HTMLDivElement | null>; inventoryFlow: ReturnType<typeof analyzeInventoryFlow>; exportInventoryFlow: () => void; exportInventoryFlowPdf: () => void; flowPdfStatus: "idle" | "working" | "done" | "failed"; flowPdfError: string; flowReportRef: React.RefObject<HTMLDivElement | null>; setView: (view: DashboardView) => void; reportPreferences: ReportPreferences; setReportPreferences: (value: ReportPreferences) => void; comparison: ReturnType<typeof compareWithPreviousPeriod>; inventoryOperations: ReturnType<typeof analyzeInventoryOperations>; productMovement: ReturnType<typeof analyzeProductMovement>; reorderRules: ReorderRules; reorderHistory: ReorderRuleHistoryEntry[]; saveItemReorderRule: (itemId: string, reorderLevel: number, targetStock?: number) => void; clearItemReorderRule: (itemId: string) => void; exportInventoryOperations: () => void; importReorderRules: (file: File) => Promise<ReorderRulesImportResult>; exportAuditLog: () => void; reportLock: ReportLockState; setReportPasscode: (code: string) => Promise<void>; verifyReportPasscode: (code: string) => Promise<boolean>; clearReportPasscode: () => void; }) {
  const { view, analytics } = props;
  if (view === "sales") return <SalesView analytics={analytics} />;
  if (view === "products") return <ProductsView analytics={analytics} search={props.tableSearch} setSearch={props.setTableSearch} exportProducts={props.exportProducts} />;
  if (view === "movement") return <ProductMovementCenter analysis={props.productMovement} onExportExcel={props.exportProductMovement} onExportPdf={props.exportProductMovementPdf} pdfStatus={props.movementPdfStatus} pdfError={props.movementPdfError} reportRef={props.movementReportRef} />;
  if (view === "flow") return <InventoryFlowCenter analysis={props.inventoryFlow} onExportExcel={props.exportInventoryFlow} onExportPdf={props.exportInventoryFlowPdf} pdfStatus={props.flowPdfStatus} pdfError={props.flowPdfError} reportRef={props.flowReportRef} />;
  if (view === "companies") return <CompaniesView analytics={analytics} />;
  if (view === "inventory") return <InventoryOperationsCenter operations={props.inventoryOperations} mode="inventory" rules={props.reorderRules} history={props.reorderHistory} onSaveRule={props.saveItemReorderRule} onRemoveRule={props.clearItemReorderRule} onExport={props.exportInventoryOperations} onImportRules={props.importReorderRules} onExportAudit={props.exportAuditLog} />;
  if (view === "branches") return <InventoryOperationsCenter operations={props.inventoryOperations} mode="branches" />;
  if (view === "alerts") return <AlertsView analytics={analytics} />;
  if (view === "report") return <ManagerReportCenter analytics={analytics} inspection={props.inspection} preferences={props.reportPreferences} comparison={props.comparison} onProducts={() => props.setView("products")} onExport={props.exportManagerPdf} pdfStatus={props.pdfStatus} pdfError={props.pdfError} reportRef={props.reportRef} />;
  if (view === "settings") return <ReportSettingsGate state={props.reportLock} onSet={props.setReportPasscode} onVerify={props.verifyReportPasscode} onRemove={props.clearReportPasscode}><ReportPreferencesView preferences={props.reportPreferences} onChange={props.setReportPreferences} /></ReportSettingsGate>;
  return <OverviewView analytics={analytics} sheet={props.sheet} question={props.question} setQuestion={props.setQuestion} answer={props.answer} askData={props.askData} setView={props.setView} />;
}

function OverviewView({ analytics, sheet, question, setQuestion, answer, askData, setView }: { analytics: DashboardAnalytics; sheet: SheetInspection; question: string; setQuestion: (value: string) => void; answer: string; askData: () => void; setView: (view: DashboardView) => void; }) {
  const cards = [
    { label: "إجمالي المبيعات", value: formatEGP(analytics.metrics.sales.value), metric: analytics.metrics.sales, icon: TrendingUp, tone: "text-[#0b6b5b] bg-[#e7f4ee]" },
    { label: "الربح الإجمالي", value: formatEGP(analytics.metrics.grossProfit.value), metric: analytics.metrics.grossProfit, icon: Sparkles, tone: "text-[#9a6411] bg-[#fff4dd]" },
    { label: "هامش الربح", value: analytics.metrics.grossMargin.value === undefined ? "غير متاح" : `${analytics.metrics.grossMargin.value.toFixed(1)}%`, metric: analytics.metrics.grossMargin, icon: HeartPulse, tone: "text-[#216b59] bg-[#e5f3ed]" },
    { label: "الأصناف المباعة", value: formatNumber(analytics.metrics.soldItems.value), metric: analytics.metrics.soldItems, icon: PackageSearch, tone: "text-[#596a63] bg-[#edf0eb]" },
  ];
  const profitabilityAvailable = analytics.metrics.grossMargin.value !== undefined;
  return <div className="mx-auto max-w-[1350px] space-y-5"><div className="entry-rise flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#9a721f]"><span className="h-px w-7 bg-[#d8a345]" />قراءة تنفيذية من بياناتك</div><h2 className="display-font text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">لوحة تحكم المدير</h2><p className="mt-1 text-xs text-[#6e827a]">المصدر: شيت <b className="text-[#31594e]">{analytics.sourceSheet}</b> · {analytics.totalRows.toLocaleString("ar-EG")} سجل صالح · موثوقية القراءة: <b className="text-[#24715a]">{sheet.quality.score >= 85 ? "عالية" : "متوسطة"}</b></p></div><button onClick={() => setView("report")} className="no-print rounded-xl border border-[#bfd9cf] bg-white px-4 py-2.5 text-xs font-bold text-[#175c4f] hover:bg-[#eff8f2]"><FileBarChart className="ml-1.5 inline size-4" />فتح تقرير المدير</button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card, index) => { const Icon = card.icon; return <div key={card.label} className={`entry-rise entry-delay-${Math.min(index, 3)} panel-shadow rounded-2xl border border-[#dde9e3] bg-[#fcfcf8] p-4`}><div className="flex items-start justify-between gap-3"><div className={`grid size-9 place-items-center rounded-xl ${card.tone}`}><Icon className="size-[18px]" /></div><span title={card.metric.note} className={`rounded-md px-2 py-1 text-[10px] font-bold ${card.metric.confidence === "عالية" ? "bg-[#ecf6f0] text-[#29735d]" : card.metric.confidence === "متوسطة" ? "bg-[#fff6e2] text-[#976614]" : "bg-[#f2f2ee] text-[#788983]"}`}>{card.metric.source}</span></div><p className="mt-5 text-[11px] font-bold text-[#758780]">{card.label}</p><p className="metric-number mt-1.5 truncate text-[24px] font-bold text-[#1a473e]" dir="rtl">{card.value}</p><p className="mt-2 min-h-4 text-[10px] leading-4 text-[#82918c]">{card.metric.note}</p></div>; })}</div>
    <div className="entry-rise entry-delay-2 grid gap-5 xl:grid-cols-[1.28fr_.72fr]"><section className="panel-shadow overflow-hidden rounded-2xl border border-[#b9d9cc] bg-[#f8fcf8]"><div className="border-r-4 border-[#0b6b5b] px-5 pb-4 pt-5"><div className="flex items-center gap-2"><Sparkles className="size-4 text-[#d09236]" /><p className="display-font text-xl font-semibold text-[#17443c]">ركّز هنا</p><span className="rounded-md bg-[#e6f3ed] px-2 py-0.5 text-[10px] font-bold text-[#2a725c]">أهم {analytics.focusItems.length} نقاط</span></div><p className="mt-2 text-sm font-bold leading-6 text-[#234d43]">{analytics.summary.headline}</p></div><div className="space-y-2 border-t border-[#dcebe4] px-5 py-4">{analytics.focusItems.length ? analytics.focusItems.map((alert, index) => <FocusRow key={alert.id} alert={alert} index={index + 1} />) : <p className="rounded-xl bg-white p-4 text-sm leading-6 text-[#61776e]">لم يتم إنشاء تنبيهات لأن البيانات المتاحة لا تدعم قواعد المقارنة المطلوبة. استورد تقريرًا أكثر تفصيلًا أو فترة زمنية أطول لتعميق التحليل.</p>}</div></section>
      <section className="panel-shadow relative overflow-hidden rounded-2xl bg-[#123c37] p-5 text-white"><img src={ASSET.orb} alt="عنصر بصري تحليلي" className="gentle-orbit pointer-events-none absolute -left-6 -top-7 size-40 object-contain opacity-70" /><div className="relative"><div className="flex items-center gap-2 text-[#c1ddd2]"><Search className="size-4" /><p className="text-xs font-bold">اسأل عن البيانات</p></div><h3 className="display-font mt-3 text-[22px] leading-9 font-semibold">تحدث إلى تقريرك<br/>بلغة مدير الصيدلية.</h3><p className="mt-2 text-[11px] leading-5 text-[#b2cdc2]">{profitabilityAvailable ? "مثال: ما أكثر الأصناف مبيعًا؟ ما الذي يحتاج مراجعة؟ كم إجمالي الربح؟" : "مثال: ما أكثر الأصناف مبيعًا؟ ما الذي يحتاج مراجعة؟ هل تكلفة الشراء متاحة؟"}</p><div className="mt-5 flex overflow-hidden rounded-xl border border-white/15 bg-white/10"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") askData(); }} placeholder="اكتب سؤالك هنا…" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-xs text-white placeholder:text-[#9dbbae] focus:outline-none" /><button onClick={askData} className="m-1 rounded-lg bg-[#d89b42] px-3 text-[#173c36] hover:bg-[#ebbd6d]" aria-label="اسأل"><ArrowLeft className="size-4" /></button></div>{answer && <div className="mt-3 rounded-xl border border-white/10 bg-white/[.08] p-3 text-xs leading-6 text-[#e1eee8]">{answer}</div>}</div></section></div>
    <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]"><TopProducts products={analytics.products} onAll={() => setView("products")} /><ManagerSummary analytics={analytics} /></div>
  </div>;
}

function FocusRow({ alert, index }: { alert: ManagerAlert; index: number }) { const meta = levelMeta[alert.level]; return <div className="flex gap-3 rounded-xl border border-transparent p-2.5 hover:border-[#d6e7df] hover:bg-white"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#edf5f0] text-[10px] font-bold text-[#275c50]">{index}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-[#294f46]">{alert.title}</p><span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${meta.className}`}>{meta.label}</span></div><p className="mt-1 text-[11px] leading-5 text-[#71827c]">{alert.detail}</p></div><ChevronLeft className="mt-1 size-4 shrink-0 text-[#9aada5]" /></div>; }

function TopProducts({ products, onAll }: { products: ProductInsight[]; onAll: () => void }) { const top = products.slice(0, 5); return <section className="panel-shadow rounded-2xl border border-[#dce8e2] bg-[#fcfcf8] p-5"><div className="flex items-center justify-between"><div><p className="font-bold text-[#1f493f]">أفضل الأصناف</p><p className="mt-1 text-[11px] text-[#768983]">مرتبة حسب قيمة المبيعات</p></div><button onClick={onAll} className="text-xs font-bold text-[#11705e] hover:text-[#0a594b]">كل الأصناف <ChevronLeft className="mr-0.5 inline size-3" /></button></div>{top.length ? <div className="mt-4 divide-y divide-[#edf1ed]">{top.map((product, index) => <div key={product.id} className="flex items-center gap-3 py-3"><span className="grid size-7 place-items-center rounded-lg bg-[#edf5f0] text-xs font-bold text-[#266957]">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-[#31554c]">{product.itemName}</p><p className="mt-1 text-[10px] text-[#83928d]">{product.company ?? "شركة غير متاحة"}{product.margin !== undefined ? ` · هامش ${product.margin.toFixed(1)}%` : ""}</p></div><p className="metric-number text-xs font-bold text-[#1d5145]">{formatEGP(product.sales)}</p></div>)}</div> : <EmptyMetric label="لا توجد أصناف قابلة للترتيب" note="يتطلب هذا القسم اسم الصنف وربطًا بالمبيعات." />}</section>; }

function ManagerSummary({ analytics }: { analytics: DashboardAnalytics }) { return <section className="panel-shadow rounded-2xl border border-[#dce8e2] bg-[#fcfcf8] p-5"><div className="flex items-center gap-2"><FileBarChart className="size-4 text-[#0b6b5b]" /><p className="font-bold text-[#1f493f]">ملخص المدير</p></div><div className="mt-4 rounded-xl bg-[#f1f6f2] p-4"><p className="text-sm font-bold leading-7 text-[#244c42]">{analytics.summary.headline}</p>{analytics.summary.paragraphs.slice(0, 2).map((paragraph) => <p key={paragraph} className="mt-2 text-xs leading-6 text-[#61776d]">{paragraph}</p>)}</div><div className="mt-4 flex flex-wrap gap-2"><Pill label="إيجابيات" value={analytics.summary.positives.length} color="green" /><Pill label="مخاطر" value={analytics.summary.risks.length} color="red" /><Pill label="فرص نمو" value={analytics.summary.opportunities.length} color="amber" /></div></section>; }
function Pill({ label, value, color }: { label: string; value: number; color: "green" | "red" | "amber" }) { const styles = { green: "bg-[#e6f5ed] text-[#267259]", red: "bg-[#fbeceb] text-[#ad4f45]", amber: "bg-[#fff4de] text-[#9a6710]" }; return <span className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${styles[color]}`}>{value} {label}</span>; }

function SalesView({ analytics }: { analytics: DashboardAnalytics }) { const salesAvailable = analytics.metrics.sales.value !== undefined; const max = Math.max(...analytics.trends.map((item) => item.sales ?? 0), 1); return <div className="mx-auto max-w-[1350px] space-y-5"><ViewHeading eyebrow="تتبع الأداء" title="تحليل المبيعات" description="المبيعات عبر الزمن، أعلى الأصناف، وقيمة الفاتورة عند توفر الحقول المطلوبة." /><div className="grid gap-4 sm:grid-cols-3"><MetricBox label="إجمالي المبيعات" value={formatEGP(analytics.metrics.sales.value)} note={analytics.metrics.sales.note} /><MetricBox label="عدد الفواتير" value={formatNumber(analytics.metrics.invoices.value)} note={analytics.metrics.invoices.note} /><MetricBox label="متوسط قيمة الفاتورة" value={formatEGP(analytics.metrics.averageInvoice.value)} note={analytics.metrics.averageInvoice.note} /></div>{salesAvailable && analytics.trends.length ? <section className="panel-shadow rounded-2xl border border-[#dde8e2] bg-[#fcfcf8] p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="font-bold text-[#20483f]">مسار المبيعات اليومية</p><p className="mt-1 text-[11px] text-[#788a83]">آخر {analytics.trends.length} يومًا لها تاريخ مسجل في التقرير.</p></div><span className="rounded-lg bg-[#e8f5ef] px-2 py-1 text-[10px] font-bold text-[#24715a]">فعلي / محسوب حسب التقرير</span></div><div className="mt-8 flex h-[240px] items-end gap-1.5 overflow-x-auto pb-6 pt-2">{analytics.trends.map((point) => <div key={point.label} className="group relative flex h-full min-w-[24px] flex-1 flex-col items-center justify-end"><div title={`${point.label}: ${formatEGP(point.sales)}`} style={{ height: `${Math.max(5, ((point.sales ?? 0) / max) * 100)}%` }} className="w-full rounded-t-md bg-gradient-to-t from-[#0b6b5b] to-[#78bca7] transition-opacity group-hover:opacity-70" /><span className="absolute -bottom-5 rotate-[-45deg] text-[9px] whitespace-nowrap text-[#8a9993]">{point.label}</span></div>)}</div></section> : <section className="panel-shadow rounded-2xl border border-[#dde8e2] bg-[#fcfcf8] p-5"><EmptyMetric label="المبيعات حسب التاريخ غير متاحة" note="يلزم وجود حقل مبيعات وحقل تاريخ صالح لرسم المسار الزمني." /></section>}<TopProducts products={analytics.products} onAll={() => {}} /></div>; }

function MetricBox({ label, value, note }: { label: string; value: string; note?: string }) { return <div className="panel-shadow rounded-2xl border border-[#dde8e2] bg-[#fcfcf8] p-5"><p className="text-xs font-bold text-[#6f837c]">{label}</p><p className="metric-number mt-3 text-2xl font-bold text-[#1d5045]">{value}</p><p className="mt-3 text-[10px] leading-5 text-[#84928d]">{note}</p></div>; }

function ProductsView({ analytics, search, setSearch, exportProducts }: { analytics: DashboardAnalytics; search: string; setSearch: (value: string) => void; exportProducts: () => void; }) { const products = analytics.products.filter((product) => `${product.itemName} ${product.itemCode ?? ""} ${product.company ?? ""}`.toLowerCase().includes(search.toLowerCase())); const profitabilityAvailable = products.some((product) => product.margin !== undefined); const quadrants = [ { id: "A", title: "نجوم / استراتيجية", hint: "مبيعات وربحية مرتفعتان", color: "border-[#8fcfb9] bg-[#ebf8f1]", items: analytics.productQuadrants.A }, { id: "B", title: "تحتاج مراجعة", hint: "مبيعات مرتفعة وربحية منخفضة", color: "border-[#f2ce8b] bg-[#fff7e6]", items: analytics.productQuadrants.B }, { id: "C", title: "فرص نمو", hint: "مبيعات منخفضة وربحية مرتفعة", color: "border-[#a9d1e2] bg-[#edf7fb]", items: analytics.productQuadrants.C }, { id: "D", title: "حركة ضعيفة", hint: "مبيعات وربحية منخفضتان", color: "border-[#e5c9c1] bg-[#fdf1ee]", items: analytics.productQuadrants.D } ]; return <div className="mx-auto max-w-[1350px] space-y-5"><ViewHeading eyebrow="تفاصيل الأداء" title="تحليل الأصناف" description={profitabilityAvailable ? "ابحث ورتب بصريًا بين مساهمة الأصناف في المبيعات والربحية. لا يظهر الربح إلا عند توفر مدخلاته." : "ترتيب الأصناف الحالي مبني على المبيعات والكمية فقط؛ أضف تكلفة الشراء أو الربح الفعلي لتفعيل التصنيف الربحي."} action={<button onClick={exportProducts} className="no-print rounded-xl border border-[#bfd9cf] bg-white px-3.5 py-2.5 text-xs font-bold text-[#175c4f] hover:bg-[#eff8f2]"><Download className="ml-1.5 inline size-4" />تصدير Excel</button>} />{profitabilityAvailable ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{quadrants.map((quadrant) => <div key={quadrant.id} className={`rounded-2xl border p-4 ${quadrant.color}`}><div className="flex items-start justify-between"><span className="display-font text-2xl font-semibold text-[#28594e]">{quadrant.id}</span><span className="rounded-lg bg-white/70 px-2 py-1 text-xs font-bold text-[#315a50]">{quadrant.items.length}</span></div><p className="mt-3 text-xs font-bold text-[#295248]">{quadrant.title}</p><p className="mt-1 text-[10px] text-[#647a72]">{quadrant.hint}</p></div>)}</div> : <section className="rounded-2xl border border-[#ead9af] bg-[#fff9ea] p-4"><p className="text-xs font-bold text-[#76571b]">تصنيف الربحية غير متاح لهذا التقرير</p><p className="mt-1 text-[11px] leading-5 text-[#8b7037]">لا يحتوي الملف المستورد على تكلفة الشراء أو الربح الفعلي؛ لذلك لن تصنّف الأداة أي صنف كـ«أعلى ربحًا» أو «هامش 100%» من دون دليل.</p></section>}<section className="panel-shadow overflow-hidden rounded-2xl border border-[#dce8e2] bg-[#fcfcf8]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5eee9] p-4 sm:px-5"><div className="relative w-full max-w-[290px]"><Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#7d9189]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث باسم الصنف أو الكود…" className="w-full rounded-xl border border-[#d6e4dd] bg-white py-2.5 pr-9 pl-3 text-xs text-[#264e44] placeholder:text-[#90a099] focus:border-[#0b6b5b] focus:outline-none" /></div><p className="text-[11px] text-[#72867f]">{products.length.toLocaleString("ar-EG")} صنف معروض</p></div><div className="scrollbar-thin overflow-auto"><table className="w-full min-w-[940px] text-right"><thead className="bg-[#f4f8f4] text-[10px] font-bold text-[#6e827a]"><tr>{["الصنف", "الكود", "الشركة", "الكمية", "المبيعات", "التكلفة", "الربح", "هامش الربح"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr></thead><tbody>{products.slice(0, 100).map((product) => <tr key={product.id} className="border-t border-[#edf2ee] text-xs hover:bg-[#f7faf7]"><td className="max-w-[230px] truncate px-5 py-3.5 font-bold text-[#275047]">{product.itemName}</td><td className="px-5 py-3.5 text-[#7d8f88]">{product.itemCode ?? "—"}</td><td className="px-5 py-3.5 text-[#506c62]">{product.company ?? "—"}</td><td className="px-5 py-3.5 text-[#506c62]">{formatNumber(product.quantity)}</td><td className="metric-number px-5 py-3.5 font-semibold text-[#1c5347]">{formatEGP(product.sales)}</td><td className="metric-number px-5 py-3.5 text-[#506c62]">{formatEGP(product.cost)}</td><td className="metric-number px-5 py-3.5 font-semibold text-[#276a57]">{formatEGP(product.profit)}</td><td className="px-5 py-3.5">{product.margin === undefined ? <span className="text-[#899994]">—</span> : <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${product.margin < 8 ? "bg-[#fbeae8] text-[#ad5045]" : product.margin < 18 ? "bg-[#fff3de] text-[#986715]" : "bg-[#e6f5ed] text-[#257158]"}`}>{product.margin.toFixed(1)}%</span>}</td></tr>)}</tbody></table>{products.length > 100 && <p className="p-4 text-center text-xs text-[#748780]">يتم عرض أول 100 صف لتسريع القراءة. استخدم البحث لتضييق النتائج.</p>}</div></section></div>; }

function CompaniesView({ analytics }: { analytics: DashboardAnalytics }) { return <div className="mx-auto max-w-[1350px] space-y-5"><ViewHeading eyebrow="التركيز التجاري" title="الشركات والموردون" description={analytics.companies.some((company) => company.margin !== undefined) ? "ترتيب الشركات حسب المبيعات والربح وفق الحقول المتاحة في المصدر." : "ترتيب الشركات حسب المبيعات؛ لا يظهر الربح أو الهامش إلا عند توفر تكلفة الشراء أو الربح الفعلي."} /><div className="grid gap-4 sm:grid-cols-3"><MetricBox label="عدد الشركات المصنفة" value={formatNumber(analytics.companies.filter((company) => company.company !== "غير مصنف").length)} note="الشركات التي أمكن ربطها بالأصناف." /><MetricBox label="أعلى شركة مبيعًا" value={analytics.companies[0]?.company ?? "غير متاح"} note={analytics.companies[0]?.sales !== undefined ? formatEGP(analytics.companies[0].sales) : "حقل الشركة أو المبيعات غير متاح."} /><MetricBox label="أعلى هامش شركة" value={analytics.companies.filter((company) => company.margin !== undefined).sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))[0]?.company ?? "غير متاح"} note="مع مراعاة أن الهوامش تحتاج بيانات تكلفة." /></div>{analytics.companies.length ? <section className="panel-shadow overflow-hidden rounded-2xl border border-[#dce8e2] bg-[#fcfcf8]"><div className="border-b border-[#e5eee9] px-5 py-4"><p className="font-bold text-[#20483f]">أداء الشركات</p><p className="mt-1 text-[11px] text-[#788a83]">مرتبة حسب المبيعات.</p></div><div className="scrollbar-thin overflow-auto"><table className="w-full min-w-[800px] text-right"><thead className="bg-[#f4f8f4] text-[10px] font-bold text-[#6e827a]"><tr>{["الشركة", "عدد الأصناف", "الكمية", "المبيعات", "التكلفة", "الربح", "هامش الربح"].map((heading) => <th key={heading} className="px-5 py-3">{heading}</th>)}</tr></thead><tbody>{analytics.companies.map((company) => <tr key={company.company} className="border-t border-[#edf2ee] text-xs hover:bg-[#f7faf7]"><td className="px-5 py-3.5 font-bold text-[#295249]">{company.company}</td><td className="px-5 py-3.5 text-[#566f66]">{formatNumber(company.items)}</td><td className="px-5 py-3.5 text-[#566f66]">{formatNumber(company.quantity)}</td><td className="metric-number px-5 py-3.5 font-bold text-[#1c5347]">{formatEGP(company.sales)}</td><td className="metric-number px-5 py-3.5 text-[#566f66]">{formatEGP(company.cost)}</td><td className="metric-number px-5 py-3.5 text-[#27705a]">{formatEGP(company.profit)}</td><td className="px-5 py-3.5">{company.margin === undefined ? "—" : `${company.margin.toFixed(1)}%`}</td></tr>)}</tbody></table></div></section> : <EmptyMetric label="تحليل الشركات غير متاح" note="يلزم وجود عمود للشركة وربط الأصناف والمبيعات في الملف." />}</div>; }

function AlertsView({ analytics }: { analytics: DashboardAnalytics }) { const grouped: Array<{ level: AlertLevel; title: string }> = [{ level: "urgent", title: "عاجل" }, { level: "review", title: "يحتاج مراجعة" }, { level: "watch", title: "للمراقبة" }, { level: "positive", title: "إيجابي" }]; return <div className="mx-auto max-w-[1120px] space-y-5"><ViewHeading eyebrow="محرك التنبيه" title="مركز التنبيهات" description="لا نطلق كلمة مشكلة من دون دليل: كل بطاقة تعرض السبب والقيمة والمقارنة والإجراء المقترح." /><div className="grid gap-3 sm:grid-cols-4">{grouped.map(({ level, title }) => { const meta = levelMeta[level]; const count = analytics.alerts.filter((alert) => alert.level === level).length; return <div key={level} className={`rounded-2xl border p-4 ${meta.className}`}><p className="text-xs font-bold">{title}</p><p className="metric-number mt-2 text-2xl font-bold">{count}</p></div>; })}</div>{analytics.alerts.length ? <div className="space-y-3">{analytics.alerts.map((alert) => { const meta = levelMeta[alert.level]; return <article key={alert.id} className="panel-shadow rounded-2xl border border-[#dce8e2] bg-[#fcfcf8] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className={`mt-0.5 grid size-8 place-items-center rounded-xl border ${meta.className}`}>{meta.icon}</span><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-[#264e44]">{alert.title}</h3><span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${meta.className}`}>{meta.label}</span></div><p className="mt-2 text-xs leading-6 text-[#61776e]">{alert.detail}</p></div></div></div><div className="mt-4 grid gap-2 border-t border-[#e8efeb] pt-4 sm:grid-cols-2"><div className="rounded-xl bg-[#f3f7f3] p-3"><p className="text-[10px] font-bold text-[#71847c]">الدليل والمقارنة</p><p className="mt-1 text-[11px] leading-5 text-[#46635a]">{alert.evidence}</p></div><div className="rounded-xl bg-[#edf7f1] p-3"><p className="text-[10px] font-bold text-[#3b795f]">الإجراء المقترح</p><p className="mt-1 text-[11px] leading-5 text-[#41665a]">{alert.action}</p></div></div></article>; })}</div> : <EmptyMetric label="لا توجد تنبيهات قابلة للإسناد" note="لإنشاء تنبيهات أكثر دقة، استورد ملفًا يتضمن تواريخ ومبيعات وتكلفة أو ربحًا لفترة كافية." />}</div>; }

function ReportView({ analytics, inspection, onProducts, onExport, pdfStatus, pdfError, reportRef }: { analytics: DashboardAnalytics; inspection: ImportInspection; onProducts: () => void; onExport: () => void; pdfStatus: "idle" | "working" | "done" | "failed"; pdfError: string; reportRef: React.RefObject<HTMLElement | null> }) {
  const reportSheet = inspection.sheets.find((sheet) => sheet.name === analytics.sourceSheet) ?? inspection.sheets[0];
  const topProducts = [...analytics.products].filter((product) => product.sales !== undefined).sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)).slice(0, 6);
  const topCompanies = [...analytics.companies].filter((company) => company.sales !== undefined).sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)).slice(0, 5);
  return <div className="mx-auto max-w-[1060px] space-y-5"><div className="no-print flex flex-wrap items-end justify-between gap-4"><ViewHeading eyebrow="ملف تنفيذي جاهز للطباعة" title="تقرير المدير الشامل" description="ملخص موثق ورسوم أداء وتنبيهات مستخرجة من بيانات الملف الحالي فقط." /><div className="flex flex-wrap gap-2"><button onClick={onProducts} className="rounded-xl border border-[#d3e3db] bg-white px-3.5 py-2.5 text-xs font-bold text-[#315f53] hover:bg-[#f1f8f4]">تفاصيل الأصناف</button><button onClick={() => window.print()} className="rounded-xl border border-[#b9d5ca] bg-white px-3.5 py-2.5 text-xs font-bold text-[#175c4f] hover:bg-[#eff8f2]"><Printer className="ml-1.5 inline size-4" />طباعة</button><button onClick={onExport} disabled={pdfStatus === "working"} className="rounded-xl bg-[#123c37] px-3.5 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] disabled:cursor-wait disabled:bg-[#527c73]"><Download className="ml-1.5 inline size-4" />{pdfStatus === "working" ? "جارٍ تجهيز PDF…" : "تنزيل PDF شامل"}</button></div></div>{pdfStatus === "done" && <div className="no-print flex items-center gap-2 rounded-xl border border-[#c7e5d8] bg-[#eef9f3] px-4 py-3 text-xs font-bold text-[#257157]"><Check className="size-4" />تم تنزيل تقرير المدير بصيغة PDF إلى جهازك.</div>}{pdfStatus === "failed" && <div className="no-print flex items-center gap-2 rounded-xl border border-[#f0d3ce] bg-[#fff5f2] px-4 py-3 text-xs font-bold text-[#a34f43]"><AlertCircle className="size-4" />{pdfError}</div>}<article ref={reportRef} className="report-document panel-shadow overflow-hidden rounded-[1.5rem] border border-[#dce8e2] bg-[#fcfcf8] p-6 sm:p-10"><div className="relative overflow-hidden border-b border-[#dce8e2] pb-6"><div className="absolute inset-x-0 bottom-0 pulse-line" /><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-[#123c37]"><img src={ASSET.logo} alt="شعار النظام" className="size-8" /></div><div><p className="display-font text-xl font-semibold text-[#173f38]">ذكاء مدير الصيدلية</p><p className="mt-0.5 text-[11px] text-[#72857e]">تقرير المدير التنفيذي الشامل · تحليل محلي</p></div></div><div className="text-left"><p className="text-xs font-bold text-[#45675d]">{new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" }).format(new Date())}</p><p className="mt-1 text-[10px] text-[#7b8e87]">{analytics.dateRange ? `${dateText(analytics.dateRange.from)} — ${dateText(analytics.dateRange.to)}` : "الفترة حسب الملف المستورد"}</p></div></div></div><section className="mt-7"><p className="text-[11px] font-bold tracking-wide text-[#a4741f]">الملخص التنفيذي</p><h2 className="display-font mt-2 text-2xl font-semibold text-[#1a443c]">{analytics.summary.headline}</h2>{analytics.summary.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-8 text-[#506c62]">{paragraph}</p>)}</section><section className="mt-8 grid gap-3 sm:grid-cols-4"><ReportNumber label="المبيعات" value={formatEGP(analytics.metrics.sales.value)} /><ReportNumber label="الربح الإجمالي" value={formatEGP(analytics.metrics.grossProfit.value)} /><ReportNumber label="هامش الربح" value={analytics.metrics.grossMargin.value === undefined ? "غير متاح" : `${analytics.metrics.grossMargin.value.toFixed(1)}%`} /><ReportNumber label="متوسط الفاتورة" value={formatEGP(analytics.metrics.averageInvoice.value)} /></section><section className="mt-8 grid gap-5 md:grid-cols-[1.3fr_.7fr]"><ReportBarChart title="أعلى الأصناف حسب المبيعات" items={topProducts} /><AlertDistribution alerts={analytics.alerts} /></section><section className="mt-8 grid gap-5 md:grid-cols-2"><ReportList title="أهم الإيجابيات" items={analytics.summary.positives} tone="green" empty="لا توجد نتيجة إيجابية موثقة كفاية في البيانات الحالية." /><ReportList title="أهم المخاطر" items={analytics.summary.risks} tone="red" empty="لا توجد مخاطر عالية الأولوية وفق القواعد والحقول المتاحة." /><ReportList title="فرص نمو" items={analytics.summary.opportunities} tone="amber" empty="يلزم توفر مبيعات وهوامش لتحديد فرص النمو." /><ReportList title="توصيات المدير" items={analytics.summary.recommendations} tone="slate" empty="—" numbered /></section><section className="mt-8 overflow-hidden rounded-2xl border border-[#dce8e2]"><div className="flex items-center justify-between border-b border-[#e4eee8] bg-[#f4f8f4] px-5 py-4"><div><p className="text-sm font-bold text-[#20483f]">الشركات الأعلى مساهمة</p><p className="mt-1 text-[10px] text-[#778b83]">ترتيب من بيانات الشركة والمبيعات المتاحة في الملف.</p></div><Building2 className="size-5 text-[#2f7462]" /></div>{topCompanies.length ? <div className="overflow-hidden"><table className="w-full text-right"><thead className="bg-[#fafcf9] text-[10px] font-bold text-[#71847c]"><tr><th className="px-4 py-3">الشركة</th><th className="px-4 py-3">الأصناف</th><th className="px-4 py-3">المبيعات</th><th className="px-4 py-3">الربح</th><th className="px-4 py-3">الهامش</th></tr></thead><tbody>{topCompanies.map((company) => <tr key={company.company} className="border-t border-[#edf2ee] text-[11px]"><td className="px-4 py-3 font-bold text-[#2a5148]">{company.company}</td><td className="px-4 py-3 text-[#647a72]">{formatNumber(company.items)}</td><td className="metric-number px-4 py-3 text-[#24594e]">{formatEGP(company.sales)}</td><td className="metric-number px-4 py-3 text-[#2c705b]">{formatEGP(company.profit)}</td><td className="px-4 py-3 text-[#637a71]">{company.margin === undefined ? "—" : `${company.margin.toFixed(1)}%`}</td></tr>)}</tbody></table></div> : <p className="px-5 py-6 text-xs text-[#71857d]">تحليل الشركات غير متاح لأن عمود الشركة أو المبيعات غير موجود في التقرير المصدر.</p>}</section><section className="mt-8 grid gap-4 border-t border-[#dce8e2] pt-6 sm:grid-cols-2"><div className="rounded-xl bg-[#f3f7f3] p-4"><p className="text-[10px] font-bold text-[#648177]">مصدر التقرير</p><p className="mt-2 text-xs font-bold text-[#2c554b]">{inspection.fileName}</p><p className="mt-1 text-[11px] leading-5 text-[#6f837c]">الشيت المعتمد: {analytics.sourceSheet} · {formatNumber(analytics.totalRows)} سجل دخل التحليل.</p></div><div className="rounded-xl bg-[#f3f7f3] p-4"><p className="text-[10px] font-bold text-[#648177]">جودة البيانات</p><p className="mt-2 text-xs font-bold text-[#2c554b]">{reportSheet ? `${reportSheet.quality.score}% — ${qualityStyle(reportSheet.quality.score).label}` : "غير متاح"}</p><p className="mt-1 text-[11px] leading-5 text-[#6f837c]">تُعرض القيم المتاحة فقط؛ لا تُنشأ تقديرات عند غياب الحقول.</p></div></section><section className="mt-7 border-t border-[#dce8e2] pt-5"><p className="text-[10px] leading-6 text-[#7c8d87]">ملاحظة منهجية: القيم الموسومة بـ«محسوب» ناتجة من الصيغ المعروضة داخل التطبيق؛ القيم غير المتاحة لا يتم تقديرها. هذا الملف صادر محليًا من جلسة التحليل الحالية ويشمل نفس الرسوم والتحليلات المعروضة في التقرير.</p></section></article></div>;
}

function ReportBarChart({ title, items }: { title: string; items: ProductInsight[] }) { const maximum = Math.max(...items.map((item) => item.sales ?? 0), 1); return <section className="rounded-2xl border border-[#dce8e2] bg-[#f8fbf8] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#20483f]">{title}</p><p className="mt-1 text-[10px] text-[#778b83]">الرسم يستند إلى قيمة المبيعات المتاحة فقط.</p></div><BarChart3 className="size-5 text-[#2f7462]" /></div>{items.length ? <div className="mt-5 space-y-3">{items.map((item) => <div key={item.id}><div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]"><span className="truncate font-bold text-[#34584f]">{item.itemName}</span><span className="metric-number shrink-0 text-[#637a71]">{formatEGP(item.sales)}</span></div><div className="h-2 overflow-hidden rounded-full bg-[#e2ece6]"><div className="h-full rounded-full bg-[#0b6b5b]" style={{ width: `${Math.max(4, ((item.sales ?? 0) / maximum) * 100)}%` }} /></div></div>)}</div> : <p className="mt-5 text-xs leading-6 text-[#72867e]">لا توجد بيانات مبيعات كافية لرسم أداء الأصناف.</p>}</section>; }

function AlertDistribution({ alerts }: { alerts: ManagerAlert[] }) { const urgent = alerts.filter((alert) => alert.level === "urgent").length; const review = alerts.filter((alert) => alert.level === "review").length; const watch = alerts.filter((alert) => alert.level === "watch").length; const positive = alerts.filter((alert) => alert.level === "positive").length; const total = Math.max(alerts.length, 1); const a = (urgent / total) * 100; const b = a + (review / total) * 100; const c = b + (watch / total) * 100; const chart = { background: `conic-gradient(#b85648 0 ${a}%, #d69b39 ${a}% ${b}%, #668e9b ${b}% ${c}%, #2d8a6d ${c}% 100%)` }; return <section className="rounded-2xl border border-[#dce8e2] bg-[#f8fbf8] p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-[#20483f]">خريطة التنبيهات</p><p className="mt-1 text-[10px] text-[#778b83]">توزيع الأولويات في جلسة التحليل.</p></div><BellRing className="size-5 text-[#2f7462]" /></div><div className="mt-5 flex items-center gap-5"><div className="relative grid size-28 place-items-center rounded-full" style={chart}><div className="grid size-20 place-items-center rounded-full bg-[#f8fbf8] text-center"><b className="metric-number text-2xl text-[#214b41]">{alerts.length}</b><span className="text-[9px] font-bold text-[#73857e]">تنبيه</span></div></div><div className="space-y-2 text-[10px] text-[#536f65]"><p><span className="ml-2 inline-block size-2 rounded-full bg-[#b85648]" />عاجل: <b>{urgent}</b></p><p><span className="ml-2 inline-block size-2 rounded-full bg-[#d69b39]" />مراجعة: <b>{review}</b></p><p><span className="ml-2 inline-block size-2 rounded-full bg-[#668e9b]" />مراقبة: <b>{watch}</b></p><p><span className="ml-2 inline-block size-2 rounded-full bg-[#2d8a6d]" />إيجابي: <b>{positive}</b></p></div></div></section>; }

function ViewHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="entry-rise flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-bold tracking-wide text-[#9a721f]">{eyebrow}</p><h2 className="display-font mt-1 text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">{title}</h2><p className="mt-1 text-xs text-[#70837c]">{description}</p></div>{action}</div>; }
function ReportNumber({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#f1f6f2] p-4"><p className="text-[10px] font-bold text-[#73857e]">{label}</p><p className="metric-number mt-2 text-base font-bold text-[#1e5045]">{value}</p></div>; }
function ReportList({ title, items, tone, empty, numbered = false }: { title: string; items: string[]; tone: "green" | "red" | "amber" | "slate"; empty: string; numbered?: boolean }) { const colors = { green: "border-[#c8e8d9] bg-[#f2faf5] text-[#35725c]", red: "border-[#f1d4cf] bg-[#fff7f5] text-[#9e5449]", amber: "border-[#f0ddae] bg-[#fffbf1] text-[#8a681e]", slate: "border-[#d8e3dd] bg-[#f6f8f6] text-[#48665c]" }; return <div className={`rounded-2xl border p-4 ${colors[tone]}`}><p className="text-xs font-bold">{title}</p><div className="mt-3 space-y-2">{items.length ? items.map((item, index) => <p key={item} className="text-[11px] leading-5">{numbered ? `${index + 1}. ` : "• "}{item}</p>) : <p className="text-[11px] leading-5 opacity-75">{empty}</p>}</div></div>; }
