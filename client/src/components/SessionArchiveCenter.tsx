/**
 * نبض العيادة التنفيذي — أرشيف قرار محلي.
 * تنظيم هادئ للجلسات والوسوم والنسخ الاحتياطية؛ لا يغادر أي سجل المتصفح.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, BellRing, Clock3, Download, FileUp, LockKeyhole, RotateCcw, Search, ShieldCheck, Tag, Trash2, X } from "lucide-react";
import { filterAnalysisSessions, type LocalAnalysisSession } from "@/lib/analysisSessions";
import type { BackupRestoreMode, BackupRestoreResult } from "@/lib/localBackup";
import { dismissReminder, formatDaysUntil, loadBackupReminderSettings, reminderDelayMs, shouldShowBackupReminder } from "@/lib/backupReminder";

type Props = {
  sessions: LocalAnalysisSession[];
  onRestore: (session: LocalAnalysisSession) => void;
  onDelete: (session: LocalAnalysisSession) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onExportBackup: (password?: string) => Promise<void> | void;
  onImportBackup: (file: File, mode: BackupRestoreMode, password?: string) => Promise<BackupRestoreResult>;
};

const dateFormat = new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SessionArchiveCenter({ sessions, onRestore, onDelete, onUpdateTags, onExportBackup, onImportBackup }: Props) {
  const backupFile = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [protectBackup, setProtectBackup] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>("merge");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showReminder, setShowReminder] = useState(false);
  const [reminderTick, setReminderTick] = useState(0);
  const reminderSettings = useMemo(() => loadBackupReminderSettings().settings, []);
  const reminderDueAt = useMemo(() => {
    const state = loadBackupReminderSettings();
    return state.lastExportAt ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.lastExportAt)) : undefined;
  }, [reminderTick]);

  const tags = useMemo(() => Array.from(new Set(sessions.flatMap((session) => session.tags ?? []))).sort((a, b) => a.localeCompare(b, "ar")), [sessions]);
  const visibleSessions = useMemo(() => filterAnalysisSessions(sessions, query, activeTag || undefined), [sessions, query, activeTag]);
  const addTag = (session: LocalAnalysisSession) => {
    const value = (drafts[session.id] ?? "").trim().replace(/\s+/g, " ");
    if (!value) return;
    onUpdateTags(session.id, Array.from(new Set([...(session.tags ?? []), value])).slice(0, 8));
    setDrafts((current) => ({ ...current, [session.id]: "" }));
  };
  const exportBackup = async () => {
    setError(""); setNotice("");
    if (protectBackup && backupPassword.trim().length < 8) { setError("اختر كلمة مرور من 8 أحرف على الأقل لحماية النسخة."); return; }
    setBusy("export");
    try { await onExportBackup(protectBackup ? backupPassword : undefined); setNotice(protectBackup ? "تم تنزيل نسخة مشفرة. احتفظ بكلمة المرور؛ لا يمكن استعادتها عند فقدانها." : "تم تنزيل النسخة المحلية غير المشفرة."); setReminderTick((tick) => tick + 1); setShowReminder(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إنشاء النسخة الاحتياطية."); }
    finally { setBusy(null); }
  };
  useEffect(() => {
    const timer = setTimeout(() => { if (shouldShowBackupReminder()) setShowReminder(true); }, reminderDelayMs);
    return () => clearTimeout(timer);
  }, []);
  const dismiss = () => { dismissReminder(); setShowReminder(false); };
  const importBackup = async (file?: File) => {
    if (!file) return;
    setError(""); setNotice(""); setBusy("import");
    try {
      const result = await onImportBackup(file, restoreMode, restorePassword || undefined);
      setNotice(`اكتملت الاستعادة: ${result.sessions.length} جلسة و${Object.keys(result.rules).length} قاعدة على هذا المتصفح.`);
      setRestorePassword("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر استعادة النسخة. تحقق من كلمة المرور والملف."); }
    finally { setBusy(null); }
  };

  return <section className="mt-6 rounded-2xl border border-white/15 bg-[#0f342f]/55 p-4 text-right text-white shadow-[0_16px_32px_rgba(0,0,0,.14)]">
    {showReminder && <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#d8a345]/40 bg-[#d8a345]/12 p-3"><BellRing className="mt-0.5 size-4 shrink-0 text-[#d8a345]" /><div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-[#f3dfa6]">تذكير احتياطي دوري</p><p className="mt-1 text-[10px] leading-5 text-[#e6d9b5]">{(() => { const last = loadBackupReminderSettings().lastExportAt; const daysText = formatDaysUntil(last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity); const prefix = last ? `مرّ ${daysText} منذ آخر نسخة احتياطية.` : daysText; const when = reminderDueAt ? ` ${reminderDueAt}` : ""; return `${prefix}${when} نزّل نسخة جديدة كل ${reminderSettings.intervalDays} أيام لضمان أمان بياناتك المحلية.`; })()}</p></div><button type="button" onClick={dismiss} title="تأجيل التذكير يومًا" className="grid size-6 shrink-0 place-items-center rounded-lg border border-[#d8a345]/30 text-[#d8b764] hover:bg-[#d8a345]/15"><X className="size-3.5" /></button></div>}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Archive className="size-4 text-[#d8a345]" /><p className="text-xs font-bold">أرشيف القرارات المحلي</p></div><p className="mt-1 text-[10px] leading-5 text-[#b8d1c7]">ابحث، نظّم، واستعد جلساتك ونسختك الاحتياطية من هذا المتصفح فقط.</p></div><span className="rounded-lg border border-[#9fc9ba]/30 bg-white/5 px-2 py-1 text-[10px] font-bold text-[#cbe4d9]">{sessions.length} جلسة</span></div>
    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2"><Search className="size-3.5 text-[#d8a345]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الملف أو الوسم" className="w-full bg-transparent text-[11px] text-white outline-none placeholder:text-[#9fbbb0]" /></div>{tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{tags.map((tag) => <button key={tag} type="button" onClick={() => setActiveTag(activeTag === tag ? "" : tag)} className={`rounded-md border px-2 py-1 text-[9px] font-bold transition ${activeTag === tag ? "border-[#d8a345]/70 bg-[#d8a345]/20 text-[#ffe3a6]" : "border-white/12 bg-white/5 text-[#b9d4c9] hover:bg-white/10"}`}>#{tag}</button>)}</div>}</div>
    <div className="scrollbar-thin mt-3 max-h-56 space-y-2 overflow-auto pr-1">{visibleSessions.map((session) => <article key={session.id} className="rounded-xl border border-white/10 bg-white/[.045] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[11px] font-bold text-white">{session.fileName}</p><p className="mt-1 text-[9px] text-[#a9c4b8]">{dateFormat.format(new Date(session.savedAt))} · {session.rows.toLocaleString("ar-EG")} سجل</p></div><div className="flex shrink-0 gap-1"><button type="button" title="استعادة" onClick={() => onRestore(session)} className="grid size-7 place-items-center rounded-lg bg-[#76bda3]/15 text-[#d9eee7] hover:bg-[#76bda3]/25"><RotateCcw className="size-3.5" /></button><button type="button" title="حذف" onClick={() => onDelete(session)} className="grid size-7 place-items-center rounded-lg bg-white/5 text-[#e6b4aa] hover:bg-[#a64e3e]/25"><Trash2 className="size-3.5" /></button></div></div><div className="mt-2 flex flex-wrap items-center gap-1.5">{(session.tags ?? []).map((tag) => <button type="button" key={tag} onClick={() => onUpdateTags(session.id, (session.tags ?? []).filter((value) => value !== tag))} title="إزالة الوسم" className="rounded-md border border-[#9fc9ba]/20 bg-[#76bda3]/10 px-1.5 py-0.5 text-[9px] font-bold text-[#cbe6da]">#{tag} ×</button>)}<div className="flex min-w-[125px] flex-1 items-center gap-1 rounded-md border border-white/10 bg-black/10 px-1.5"><Tag className="size-3 text-[#d8a345]" /><input value={drafts[session.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [session.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(session); } }} placeholder="وسم جديد" className="w-full bg-transparent py-1 text-[9px] text-white outline-none placeholder:text-[#91aea2]" /><button type="button" onClick={() => addTag(session)} className="text-[9px] font-bold text-[#d8c07c]">إضافة</button></div></div></article>)}{visibleSessions.length === 0 && <div className="rounded-xl border border-dashed border-white/15 p-4 text-center text-[10px] leading-5 text-[#a8c1b6]">{sessions.length ? "لا توجد جلسات تطابق البحث أو الوسم." : "عند تأكيد أي ملف، تحفظ جلسة تحليل محلية هنا تلقائيًا."}</div>}</div>
    <div className="mt-4 border-t border-white/10 pt-4"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#d8a345]" /><p className="text-xs font-bold">نسخة احتياطية محلية</p></div><p className="mt-1 text-[10px] leading-5 text-[#aac6bb]">تشمل الجلسات والقواعد وإعدادات التقرير. الرمز المحلي المخزّن فقط يُدرج دون كلمة المرور الخام.</p><label className="mt-3 flex cursor-pointer items-center gap-2 text-[10px] font-bold text-[#d5e8df]"><input type="checkbox" checked={protectBackup} onChange={(event) => setProtectBackup(event.target.checked)} className="accent-[#d8a345]" /><LockKeyhole className="size-3.5 text-[#d8a345]" />تشفير النسخة بكلمة مرور</label>{protectBackup && <input type="password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder="كلمة مرور (8 أحرف على الأقل)" className="mt-2 w-full rounded-lg border border-white/15 bg-black/15 px-3 py-2 text-[10px] text-white outline-none placeholder:text-[#91aea2] focus:border-[#d8a345]/65" />}<div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy !== null} onClick={() => void exportBackup()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d8a345] px-3 py-2.5 text-[10px] font-bold text-[#173f38] transition hover:bg-[#e6b862] disabled:opacity-50"><Download className="size-3.5" />{busy === "export" ? "نُشفّر ونُجهّز…" : "تنزيل نسخة احتياطية"}</button><button type="button" disabled={busy !== null} onClick={() => backupFile.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[10px] font-bold text-[#e2f1ea] transition hover:bg-white/10 disabled:opacity-50"><FileUp className="size-3.5 text-[#d8a345]" />استعادة نسخة</button><input ref={backupFile} type="file" accept=".pmi,.json" className="hidden" onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = ""; }} /></div><div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} placeholder="كلمة مرور الاستعادة إذا كانت النسخة مشفرة" className="rounded-lg border border-white/12 bg-black/10 px-3 py-2 text-[10px] text-white outline-none placeholder:text-[#91aea2] focus:border-[#d8a345]/65" /><div className="flex rounded-lg border border-white/12 p-0.5 text-[9px] font-bold"><button type="button" onClick={() => setRestoreMode("merge")} className={`rounded-md px-2 py-1.5 ${restoreMode === "merge" ? "bg-[#76bda3]/25 text-white" : "text-[#a9c5ba]"}`}>دمج</button><button type="button" onClick={() => setRestoreMode("replace")} className={`rounded-md px-2 py-1.5 ${restoreMode === "replace" ? "bg-[#a8624f]/25 text-white" : "text-[#a9c5ba]"}`}>استبدال</button></div></div></div>
    {notice && <p className="mt-3 rounded-lg border border-[#9fceb9]/30 bg-[#76bda3]/10 px-3 py-2 text-[10px] font-semibold leading-5 text-[#d8eee5]">{notice}</p>}{error && <p className="mt-3 rounded-lg border border-[#edaaa1]/30 bg-[#b64c42]/15 px-3 py-2 text-[10px] font-semibold leading-5 text-[#ffd9d5]">{error}</p>}
  </section>;
}
