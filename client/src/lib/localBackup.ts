/**
 * نبض العيادة التنفيذي — نسخة احتياطية محلية قابلة للنقل.
 * يختار المستخدم ملف JSON عاديًا أو مشفّرًا بكلمة مرور؛ لا ترفع البيانات خارج المتصفح.
 */
import { analysisSessionsStorageKey, loadAnalysisSessions, replaceAnalysisSessions, reviveInspection, type LocalAnalysisSession } from "./analysisSessions";
import type { ImportInspection } from "./pharmacyEngine";
import { loadReorderRuleHistory, loadReorderRules, reorderRuleHistoryStorageKey, reorderRulesStorageKey, replaceReorderRuleHistory, replaceReorderRules, type ReorderRuleHistoryEntry, type ReorderRules } from "./reorderRules";
import { defaultReportPreferences, loadReportPreferences, reportPreferencesKey, saveReportPreferences, type ReportPreferences } from "./reportSettings";
import { loadReportLock, reportLockStorageKey, saveReportLockState, type ReportLockState } from "./reportLock";

const importHistoryKey = "pmi-import-history";
const backupFormat = "pmi-local-backup";
const backupIterations = 210000;
export type BackupRestoreMode = "merge" | "replace";

export interface LocalBackup {
  schemaVersion: 1;
  createdAt: string;
  sessions: LocalAnalysisSession[];
  reorderRules: ReorderRules;
  reorderRulesHistory: ReorderRuleHistoryEntry[];
  reportPreferences: ReportPreferences;
  reportLock: ReportLockState;
  importHistory: unknown[];
}

export interface EncryptedLocalBackup {
  format: typeof backupFormat;
  schemaVersion: 1;
  encrypted: true;
  crypto: { algorithm: "AES-GCM"; kdf: "PBKDF2-SHA-256"; iterations: number; salt: string; iv: string };
  ciphertext: string;
}

export interface BackupRestoreResult { sessions: LocalAnalysisSession[]; rules: ReorderRules; history: ReorderRuleHistoryEntry[]; preferences: ReportPreferences; lock: ReportLockState; sessionCount: number; rulesCount: number; mode: BackupRestoreMode; encrypted: boolean; }
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const encoder = new TextEncoder(); const decoder = new TextDecoder();
const encode = (source: ArrayBuffer | Uint8Array) => { const bytes = source instanceof Uint8Array ? source : new Uint8Array(source); let text = ""; bytes.forEach((byte) => { text += String.fromCharCode(byte); }); return btoa(text); };
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

function safePreferences(value: unknown): ReportPreferences {
  const raw = isRecord(value) ? value : {}; const profile = isRecord(raw.profile) ? raw.profile : {}; const delivery = isRecord(raw.delivery) ? raw.delivery : {};
  return { profile: { ...defaultReportPreferences.profile, ...profile }, delivery: { ...defaultReportPreferences.delivery, ...delivery } as ReportPreferences["delivery"] };
}
function safeLock(value: unknown): ReportLockState { if (!isRecord(value)) return { configured: false }; return value.configured === true && typeof value.salt === "string" && typeof value.verifier === "string" ? { configured: true, salt: value.salt, verifier: value.verifier } : { configured: false }; }

export function createLocalBackup(): LocalBackup {
  let importHistory: unknown[] = [];
  try { const parsed = JSON.parse(localStorage.getItem(importHistoryKey) ?? "[]"); importHistory = Array.isArray(parsed) ? parsed : []; } catch { /* اختياري. */ }
  return { schemaVersion: 1, createdAt: new Date().toISOString(), sessions: loadAnalysisSessions(), reorderRules: loadReorderRules(), reorderRulesHistory: loadReorderRuleHistory(), reportPreferences: loadReportPreferences(), reportLock: loadReportLock(), importHistory };
}

async function deriveBackupKey(password: string, salt: Uint8Array, usages: KeyUsage[]) {
  if (!crypto.subtle) throw new Error("لا يدعم هذا المتصفح التشفير المحلي المطلوب للنسخة الاحتياطية.");
  if (password.trim().length < 8) throw new Error("استخدم كلمة مرور من 8 أحرف أو أرقام على الأقل لحماية النسخة.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: backupIterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, usages);
}

export async function createEncryptedBackup(backup: LocalBackup, password: string): Promise<EncryptedLocalBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(backup)));
  return { format: backupFormat, schemaVersion: 1, encrypted: true, crypto: { algorithm: "AES-GCM", kdf: "PBKDF2-SHA-256", iterations: backupIterations, salt: encode(salt), iv: encode(iv) }, ciphertext: encode(ciphertext) };
}

function downloadBackup(text: string, encrypted: boolean) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = `نسخة_احتياطية_ذكاء_الصيدلية_${new Date().toISOString().slice(0, 10)}${encrypted ? "_مشفرة.pmi" : ".json"}`; link.click(); URL.revokeObjectURL(url);
}

export async function exportLocalBackup(password?: string) {
  const backup = createLocalBackup(); const protectedBackup = Boolean(password?.trim());
  const payload = protectedBackup ? await createEncryptedBackup(backup, password!.trim()) : backup;
  downloadBackup(JSON.stringify(payload, null, 2), protectedBackup);
}

function reviveBackup(raw: unknown): LocalBackup {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !Array.isArray(raw.sessions) || !isRecord(raw.reorderRules)) throw new Error("هذا الملف ليس نسخة احتياطية متوافقة مع مركز ذكاء الصيدلية.");
  const sessions = raw.sessions.filter(isRecord).filter((item) => typeof item.id === "string" && isRecord(item.inspection)).map((item) => ({ id: item.id as string, savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(), fileName: typeof item.fileName === "string" ? item.fileName : "جلسة مستعادة", fileFingerprint: typeof item.fileFingerprint === "string" ? item.fileFingerprint : `restored-${item.id as string}`, rows: typeof item.rows === "number" && Number.isFinite(item.rows) ? item.rows : 0, inspection: reviveInspection(item.inspection as ImportInspection), tags: Array.isArray(item.tags) ? item.tags.map(String) : [] }));
  const history = Array.isArray(raw.reorderRulesHistory) ? raw.reorderRulesHistory.filter(isRecord).filter((entry) => typeof entry.id === "string" && typeof entry.itemId === "string" && typeof entry.at === "string") as unknown as ReorderRuleHistoryEntry[] : [];
  return { schemaVersion: 1, createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(), sessions, reorderRules: raw.reorderRules as ReorderRules, reorderRulesHistory: history, reportPreferences: safePreferences(raw.reportPreferences), reportLock: safeLock(raw.reportLock), importHistory: Array.isArray(raw.importHistory) ? raw.importHistory : [] };
}

export async function parseLocalBackupText(text: string, password?: string): Promise<{ backup: LocalBackup; encrypted: boolean }> {
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new Error("تعذر قراءة النسخة الاحتياطية. تحقق من أن ملف JSON سليم."); }
  if (isRecord(raw) && raw.encrypted === true) {
    const meta = isRecord(raw.crypto) ? raw.crypto : undefined;
    if (raw.format !== backupFormat || raw.schemaVersion !== 1 || !meta || meta.algorithm !== "AES-GCM" || meta.kdf !== "PBKDF2-SHA-256" || typeof meta.salt !== "string" || typeof meta.iv !== "string" || typeof raw.ciphertext !== "string") throw new Error("تنسيق النسخة المشفرة غير مدعوم أو تالف.");
    if (!password) throw new Error("أدخل كلمة مرور النسخة المشفرة لاستعادتها.");
    try {
      const iterations = typeof meta.iterations === "number" && Number.isFinite(meta.iterations) ? meta.iterations : backupIterations;
      const salt = decode(meta.salt); const iv = decode(meta.iv);
      if (!crypto.subtle || password.trim().length < 8) throw new Error("كلمة المرور غير صالحة.");
      const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, decode(raw.ciphertext));
      return { backup: reviveBackup(JSON.parse(decoder.decode(plain))), encrypted: true };
    } catch { throw new Error("تعذر فتح النسخة المشفرة. تحقق من كلمة المرور أو سلامة الملف."); }
  }
  return { backup: reviveBackup(raw), encrypted: false };
}

export async function readLocalBackup(file: File, password?: string): Promise<{ backup: LocalBackup; encrypted: boolean }> {
  if (!/\.(json|pmi)$/i.test(file.name)) throw new Error("اختر ملف نسخة احتياطية بصيغة JSON أو PMI.");
  return parseLocalBackupText(await file.text(), password);
}

export async function restoreLocalBackup(file: File, mode: BackupRestoreMode, password?: string): Promise<BackupRestoreResult> {
  const { backup, encrypted } = await readLocalBackup(file, password);
  const sessions = mode === "replace" ? replaceAnalysisSessions(backup.sessions) : replaceAnalysisSessions([...backup.sessions, ...loadAnalysisSessions()].filter((item, index, all) => all.findIndex((candidate) => candidate.fileFingerprint === item.fileFingerprint) === index));
  const rules = mode === "replace" ? replaceReorderRules(backup.reorderRules) : replaceReorderRules({ ...loadReorderRules(), ...backup.reorderRules });
  const history = mode === "replace" ? replaceReorderRuleHistory(backup.reorderRulesHistory) : replaceReorderRuleHistory([...backup.reorderRulesHistory, ...loadReorderRuleHistory()]);
  const preferences = mode === "replace" ? backup.reportPreferences : loadReportPreferences(); const lock = mode === "replace" ? backup.reportLock : loadReportLock();
  if (mode === "replace") { saveReportPreferences(preferences); saveReportLockState(lock); try { localStorage.setItem(importHistoryKey, JSON.stringify(backup.importHistory)); } catch { /* اختياري. */ } }
  return { sessions, rules, history, preferences, lock, sessionCount: sessions.length, rulesCount: Object.keys(rules).length, mode, encrypted };
}

/** مفاتيح النسخة معلنة للدلالة على نطاق النسخ، ولا تُستخدم لنقل البيانات إلى شبكة. */
export const localBackupStorageKeys = [analysisSessionsStorageKey, reorderRulesStorageKey, reorderRuleHistoryStorageKey, reportPreferencesKey, reportLockStorageKey, importHistoryKey];
