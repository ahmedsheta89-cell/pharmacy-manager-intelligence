import { loadReportLock, removeLocalReportPasscode, setLocalReportPasscode, verifyLocalReportPasscode } from "../client/src/lib/reportLock";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} });

const configured = await setLocalReportPasscode("مدير2026");
if (!configured.configured || !configured.verifier || configured.verifier.includes("مدير2026")) throw new Error("لم يُخزَّن رمز التقرير كقيمة مشتقة آمنة.");
if (await verifyLocalReportPasscode("غير-صحيح", configured)) throw new Error("تم قبول رمز مرور غير صحيح.");
if (!(await verifyLocalReportPasscode("مدير2026", loadReportLock()))) throw new Error("لم يُقبل رمز المدير الصحيح.");
removeLocalReportPasscode();
if (loadReportLock().configured) throw new Error("لم تتم إزالة قفل التقرير المحلي.");
console.log("تم التحقق من قفل إعدادات التقرير محليًا.");
