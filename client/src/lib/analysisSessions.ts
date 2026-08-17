/**
 * نبض العيادة التنفيذي — أرشيف جلسات التحليل المحلي.
 * يحفظ ناتج الاستيراد داخل localStorage فقط؛ لا يرفع الملفات أو السجلات إلى أي خدمة.
 */
import type { ImportInspection } from "./pharmacyEngine";

export const analysisSessionsStorageKey = "pmi-analysis-sessions-v1";
const SESSION_LIMIT = 12;

export interface LocalAnalysisSession {
  id: string;
  savedAt: string;
  fileName: string;
  fileFingerprint: string;
  rows: number;
  tags?: string[];
  inspection: ImportInspection;
}

export interface SaveSessionResult {
  sessions: LocalAnalysisSession[];
  saved: boolean;
  message: string;
}

function reviveDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 8);
}

/** يعيد تواريخ المؤشرات إلى كائنات Date بعد قراءة JSON، حتى تبقى تحليلات الاتجاهات دقيقة. */
export function reviveInspection(raw: ImportInspection): ImportInspection {
  return {
    ...raw,
    detectedAt: reviveDate(raw.detectedAt) ?? new Date(),
    sheets: raw.sheets.map((sheet) => ({
      ...sheet,
      cleanRecords: sheet.cleanRecords.map((record) => ({
        ...record,
        __metrics: {
          ...record.__metrics,
          date: reviveDate(record.__metrics.date) ?? undefined,
        },
      })),
    })),
  };
}

function parseSessions(value: string | null): LocalAnalysisSession[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as LocalAnalysisSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((session) => Boolean(session?.id && session?.inspection?.fileName))
      .map((session) => ({ ...session, tags: normalizeTags(session.tags), inspection: reviveInspection(session.inspection) }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } catch {
    return [];
  }
}

export function loadAnalysisSessions(): LocalAnalysisSession[] {
  try {
    return parseSessions(localStorage.getItem(analysisSessionsStorageKey));
  } catch {
    return [];
  }
}

export function saveAnalysisSession(inspection: ImportInspection): SaveSessionResult {
  const now = new Date().toISOString();
  const previous = loadAnalysisSessions();
  const current: LocalAnalysisSession = {
    id: `${inspection.fileFingerprint || inspection.fileName}-${Date.now().toString(36)}`,
    savedAt: now,
    fileName: inspection.fileName,
    fileFingerprint: inspection.fileFingerprint,
    rows: inspection.sheets.reduce((total, sheet) => total + sheet.quality.validRecords, 0),
    tags: previous.find((item) => item.fileFingerprint === inspection.fileFingerprint)?.tags ?? [],
    inspection,
  };
  const sessions = [current, ...previous.filter((item) => item.fileFingerprint !== current.fileFingerprint)].slice(0, SESSION_LIMIT);
  try {
    localStorage.setItem(analysisSessionsStorageKey, JSON.stringify(sessions));
    return { sessions, saved: true, message: "تم حفظ جلسة التحليل على هذا الجهاز." };
  } catch {
    return { sessions: previous, saved: false, message: "تعذر حفظ الجلسة محليًا. قد تكون مساحة المتصفح ممتلئة أو التخزين غير متاح." };
  }
}

export function deleteAnalysisSession(id: string): LocalAnalysisSession[] {
  const sessions = loadAnalysisSessions().filter((session) => session.id !== id);
  try {
    localStorage.setItem(analysisSessionsStorageKey, JSON.stringify(sessions));
  } catch {
    // حذف الجلسة لا ينبغي أن يوقف عمل لوحة التحليل الحالية.
  }
  return sessions;
}

/** تحدّث الوسوم فقط؛ تبقى بيانات التحليل الأصلية دون تغيير. */
export function updateAnalysisSessionTags(id: string, tags: string[]): LocalAnalysisSession[] {
  const sessions = loadAnalysisSessions().map((session) => session.id === id ? { ...session, tags: normalizeTags(tags) } : session);
  try { localStorage.setItem(analysisSessionsStorageKey, JSON.stringify(sessions)); } catch { /* يظل التعديل في الواجهة الحالية. */ }
  return sessions;
}

/** تكتب مجموعة جلسات مستعادة بعد إعادة إحياء التواريخ وتقييدها بالحد المحلي. */
export function replaceAnalysisSessions(sessions: LocalAnalysisSession[]): LocalAnalysisSession[] {
  const normalized = parseSessions(JSON.stringify(sessions)).slice(0, SESSION_LIMIT);
  try { localStorage.setItem(analysisSessionsStorageKey, JSON.stringify(normalized)); } catch { /* لا يوقف الاستعادة في الذاكرة. */ }
  return normalized;
}

export function filterAnalysisSessions(sessions: LocalAnalysisSession[], query: string, tag?: string): LocalAnalysisSession[] {
  const needle = query.trim().toLocaleLowerCase("ar-EG");
  return sessions.filter((session) => {
    const tagged = !tag || session.tags?.includes(tag);
    const searchable = `${session.fileName} ${(session.tags ?? []).join(" ")}`.toLocaleLowerCase("ar-EG");
    return tagged && (!needle || searchable.includes(needle));
  });
}
