/**
 * نبض العيادة التنفيذي — نسخة احتياطية محلية قابلة للنقل.
 * لا ترفع أي بيانات؛ يختار المستخدم ملف JSON ليحفظه أو يستعيده من جهازه.
 */
import { analysisSessionsStorageKey, loadAnalysisSessions, replaceAnalysisSessions, reviveInspection, type LocalAnalysisSession } from "./analysisSessions";
import type { ImportInspection } from "./pharmacyEngine";
import { loadReorderRules, reorderRulesStorageKey, replaceReorderRules, type ReorderRules } from "./reorderRules";
import { defaultReportPreferences, loadReportPreferences, reportPreferencesKey, saveReportPreferences, type ReportPreferences } from "./reportSettings";
import { loadReportLock, reportLockStorageKey, saveReportLockState, type ReportLockState } from "./reportLock";

const importHistoryKey = "pmi-import-history";
export type BackupRestoreMode = "merge" | "replace";

export interface LocalBackup {
  schemaVersion: 1;
  createdAt: string;
  sessions: LocalAnalysisSession[];
  reorderRules: ReorderRules;
  reportPreferences: ReportPreferences;
  reportLock: ReportLockState;
  importHistory: unknown[];
}

export interface BackupRestoreResult { sessions: LocalAnalysisSession[]; rules: ReorderRules; preferences: ReportPreferences; lock: ReportLockState; sessionCount: number; rulesCount: number; mode: BackupRestoreMode; }
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function safePreferences(value: unknown): ReportPreferences {
  const raw = isRecord(value) ? value : {};
  const profile = isRecord(raw.profile) ? raw.profile : {};
  const delivery = isRecord(raw.delivery) ? raw.delivery : {};
  return { profile: { ...defaultReportPreferences.profile, ...profile }, delivery: { ...defaultReportPreferences.delivery, ...delivery } as ReportPreferences["delivery"] };
}

function safeLock(value: unknown): ReportLockState {
  if (!isRecord(value)) return { configured: false };
  return value.configured === true && typeof value.salt === "string" && typeof value.verifier === "string" ? { configured: true, salt: value.salt, verifier: value.verifier } : { configured: false };
}

export function createLocalBackup(): LocalBackup {
  let importHistory: unknown[] = [];
  try { const parsed = JSON.parse(localStorage.getItem(importHistoryKey) ?? "[]"); importHistory = Array.isArray(parsed) ? parsed : []; } catch { /* اختياري. */ }
  return { schemaVersion: 1, createdAt: new Date().toISOString(), sessions: loadAnalysisSessions(), reorderRules: loadReorderRules(), reportPreferences: loadReportPreferences(), reportLock: loadReportLock(), importHistory };
}

export function exportLocalBackup() {
  const backup = createLocalBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = `نسخة_احتياطية_ذكاء_الصيدلية_${new Date().toISOString().slice(0, 10)}.json`; link.click();
  URL.revokeObjectURL(url);
}

export async function readLocalBackup(file: File): Promise<LocalBackup> {
  if (!/\.json$/i.test(file.name)) throw new Error("اختر ملف النسخة الاحتياطية بصيغة JSON الذي صدره النظام.");
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error("تعذر قراءة النسخة الاحتياطية. تحقق من أن ملف JSON سليم."); }
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.sessions) || !isRecord(raw.reorderRules)) throw new Error("هذا الملف ليس نسخة احتياطية متوافقة مع مركز ذكاء الصيدلية.");
  const sessions = raw.sessions.filter(isRecord).filter((item) => typeof item.id === "string" && isRecord(item.inspection)).map((item) => ({
    id: item.id as string,
    savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
    fileName: typeof item.fileName === "string" ? item.fileName : "جلسة مستعادة",
    fileFingerprint: typeof item.fileFingerprint === "string" ? item.fileFingerprint : `restored-${item.id as string}`,
    rows: typeof item.rows === "number" && Number.isFinite(item.rows) ? item.rows : 0,
    inspection: reviveInspection(item.inspection as ImportInspection),
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
  }));
  return { schemaVersion: 1, createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(), sessions, reorderRules: raw.reorderRules as ReorderRules, reportPreferences: safePreferences(raw.reportPreferences), reportLock: safeLock(raw.reportLock), importHistory: Array.isArray(raw.importHistory) ? raw.importHistory : [] };
}

export async function restoreLocalBackup(file: File, mode: BackupRestoreMode): Promise<BackupRestoreResult> {
  const backup = await readLocalBackup(file);
  const sessions = mode === "replace" ? replaceAnalysisSessions(backup.sessions) : replaceAnalysisSessions([...backup.sessions, ...loadAnalysisSessions()].filter((item, index, all) => all.findIndex((candidate) => candidate.fileFingerprint === item.fileFingerprint) === index));
  const rules = mode === "replace" ? replaceReorderRules(backup.reorderRules) : replaceReorderRules({ ...loadReorderRules(), ...backup.reorderRules });
  const preferences = mode === "replace" ? backup.reportPreferences : loadReportPreferences();
  const lock = mode === "replace" ? backup.reportLock : loadReportLock();
  if (mode === "replace") {
    saveReportPreferences(preferences); saveReportLockState(lock);
    try { localStorage.setItem(importHistoryKey, JSON.stringify(backup.importHistory)); } catch { /* اختياري. */ }
  }
  return { sessions, rules, preferences, lock, sessionCount: sessions.length, rulesCount: Object.keys(rules).length, mode };
}

/** مفاتيح النسخة معلنة للدلالة على نطاق النسخ، ولا تُستخدم لنقل البيانات إلى شبكة. */
export const localBackupStorageKeys = [analysisSessionsStorageKey, reorderRulesStorageKey, reportPreferencesKey, reportLockStorageKey, importHistoryKey];
