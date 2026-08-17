/** قفل إعدادات التقرير — رمز المدير يبقى مشفّرًا داخل هذا المتصفح فقط. */
export interface ReportLockState { configured: boolean; salt?: string; verifier?: string; }
export const reportLockStorageKey = "pmi-report-lock";
const defaults: ReportLockState = { configured: false };

const encode = (bytes: Uint8Array) => { let text = ""; bytes.forEach((byte) => { text += String.fromCharCode(byte); }); return btoa(text); };
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const derive = async (passcode: string, salt: Uint8Array) => {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, material, 256);
  return encode(new Uint8Array(bits));
};

export function loadReportLock(): ReportLockState {
  try { const stored = localStorage.getItem(reportLockStorageKey); return stored ? { ...defaults, ...JSON.parse(stored) as ReportLockState } : defaults; } catch { return defaults; }
}
export async function setLocalReportPasscode(passcode: string): Promise<ReportLockState> {
  if (passcode.trim().length < 4) throw new Error("استخدم رمزًا من 4 أحرف أو أرقام على الأقل.");
  if (!crypto.subtle) throw new Error("لا يدعم هذا المتصفح التشفير المحلي المطلوب للقفل.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const state: ReportLockState = { configured: true, salt: encode(salt), verifier: await derive(passcode, salt) };
  localStorage.setItem(reportLockStorageKey, JSON.stringify(state));
  return state;
}
export async function verifyLocalReportPasscode(passcode: string, state: ReportLockState): Promise<boolean> {
  if (!state.configured || !state.salt || !state.verifier) return true;
  if (!crypto.subtle) return false;
  return (await derive(passcode, decode(state.salt))) === state.verifier;
}
export function removeLocalReportPasscode() { localStorage.removeItem(reportLockStorageKey); return defaults; }

/** يستعيد المعرّف المشتق فقط؛ لا توجد كلمة مرور خام في التخزين أو النسخة الاحتياطية. */
export function saveReportLockState(state: ReportLockState): ReportLockState {
  const safe = state.configured && typeof state.salt === "string" && typeof state.verifier === "string" ? { configured: true, salt: state.salt, verifier: state.verifier } : defaults;
  try { localStorage.setItem(reportLockStorageKey, JSON.stringify(safe)); } catch { /* تظل الحالة في الواجهة. */ }
  return safe;
}
