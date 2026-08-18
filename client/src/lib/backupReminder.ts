/**
 * نبض العيادة التنفيذي — تذكير محلي دوري بالنسخ الاحتياطي.
 * يعمل بالكامل داخل المتصفح: يسجل وقت آخر تنزيل للنسخة الاحتياطية، ويعيد
 * التذكير عند مرور الفترة المحددة أثناء استخدام الأداة. لا يرسل أي بيانات للخارج.
 */
export const backupReminderStorageKey = "pmi-backup-reminder-v1";
export const defaultReminderIntervalDays = 7;
export const defaultReminderEnabled = true;

export interface BackupReminderSettings {
  enabled: boolean;
  intervalDays: number;
}

export interface BackupReminderState {
  settings: BackupReminderSettings;
  lastExportAt?: string;
  lastDismissedAt?: string;
}

const intervalLimits = [3, 7, 14, 30] as const;
export const reminderIntervalOptions = intervalLimits as readonly number[];

export function loadBackupReminderSettings(): BackupReminderState {
  try {
    const parsed = JSON.parse(localStorage.getItem(backupReminderStorageKey) ?? "{}") as Record<string, unknown>;
    const settings: BackupReminderSettings = {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultReminderEnabled,
      intervalDays: typeof parsed.intervalDays === "number" && intervalLimits.includes(parsed.intervalDays as (typeof intervalLimits)[number]) ? parsed.intervalDays : defaultReminderIntervalDays,
    };
    return { settings, lastExportAt: typeof parsed.lastExportAt === "string" ? parsed.lastExportAt : undefined, lastDismissedAt: typeof parsed.lastDismissedAt === "string" ? parsed.lastDismissedAt : undefined };
  } catch {
    return { settings: { enabled: defaultReminderEnabled, intervalDays: defaultReminderIntervalDays } };
  }
}

export function saveBackupReminderSettings(settings: BackupReminderSettings) {
  const current = loadBackupReminderSettings();
  const next: BackupReminderState = { ...current, settings: { ...current.settings, ...settings } };
  try { localStorage.setItem(backupReminderStorageKey, JSON.stringify(next)); } catch { /* اختياري. */ }
  return next;
}

export function recordBackupExport() {
  const current = loadBackupReminderSettings();
  const next: BackupReminderState = { ...current, lastExportAt: new Date().toISOString(), lastDismissedAt: undefined };
  try { localStorage.setItem(backupReminderStorageKey, JSON.stringify(next)); } catch { /* اختياري. */ }
  return next;
}

export function dismissReminder() {
  const current = loadBackupReminderSettings();
  const next: BackupReminderState = { ...current, lastDismissedAt: new Date().toISOString() };
  try { localStorage.setItem(backupReminderStorageKey, JSON.stringify(next)); } catch { /* اختياري. */ }
  return next;
}

function daysSince(iso?: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

/** يقرر ما إذا كان التذكير يجب أن يظهر الآن. التdismissة تعيد العداد فقط لمدة 24 ساعة. */
export function shouldShowBackupReminder(): boolean {
  const state = loadBackupReminderSettings();
  if (!state.settings.enabled) return false;
  const sinceExport = daysSince(state.lastExportAt);
  if (sinceExport < state.settings.intervalDays) return false;
  const sinceDismissal = daysSince(state.lastDismissedAt);
  return sinceDismissal >= 1;
}

/** مدة انتظار مقبولة قبل ظهور التذكير، للتأكيد اللطيف بعد بدء النشاط. */
export const reminderDelayMs = 4500;

export function formatDaysUntil(days: number): string {
  if (!Number.isFinite(days)) return "لم تنزل نسخة احتياطية بعد";
  const whole = Math.round(days);
  if (whole === 0) return "اليوم";
  return whole === 1 ? "يوم واحد" : `${whole} يومًا`;
}
