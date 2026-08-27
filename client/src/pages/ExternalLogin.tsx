import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { getExternalAuthConfiguration, isExternalAuthEnabled, signInWithExternalPassword, signUpExternalUser } from "@/lib/supabaseAuth";

export default function ExternalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const bootstrapSignup = import.meta.env.VITE_SUPABASE_ALLOW_BOOTSTRAP_SIGNUP === "true";
  const configured = isExternalAuthEnabled() && getExternalAuthConfiguration();

  async function submit(event: FormEvent<HTMLFormElement>, mode: "sign-in" | "sign-up") {
    event.preventDefault();
    setBusy(true); setMessage("");
    try {
      if (mode === "sign-in") await signInWithExternalPassword(email, password);
      else await signUpExternalUser(email, password);
      if (mode === "sign-in") window.location.assign("/");
      else setMessage("تم إرسال خطوة تأكيد إلى البريد. أكمل التأكيد ثم سجّل الدخول.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إتمام الدخول الآمن. راجع بياناتك وحاول مرة أخرى.");
    } finally { setBusy(false); }
  }

  if (!configured) return <main dir="rtl" className="mx-auto flex min-h-screen max-w-2xl items-center p-5"><section className="w-full rounded-[2rem] border border-amber-200 bg-amber-50 p-7 text-center shadow-sm"><ShieldCheck className="mx-auto size-10 text-amber-700" /><h1 className="display-font mt-4 text-2xl font-semibold text-[#244a41]">الدخول الخارجي لم يُهيّأ بعد</h1><p className="mt-3 text-sm leading-7 text-[#627c73]">توقف هذا المسار بأمان إلى أن تُضاف إعدادات Supabase العامة من لوحة Render. لا تدخل أي بيانات هنا الآن.</p></section></main>;

  return <main dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_top_right,#d8efe4,transparent_40%),linear-gradient(135deg,#f9fcfa,#eef6f1)] px-4 py-8"><section className="mx-auto grid max-w-4xl overflow-hidden rounded-[2rem] border border-[#cfe2d8] bg-white shadow-[0_28px_70px_rgba(27,78,64,.14)] md:grid-cols-[.9fr_1.1fr]"><aside className="bg-[linear-gradient(155deg,#103c35,#1c6757)] p-7 text-white sm:p-10"><div className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#ecd17e] text-[#16453c]"><ShieldCheck className="size-6" /></div><p className="mt-9 text-xs font-bold tracking-[.18em] text-[#efd994]">ذكاء مدير الصيدلية</p><h1 className="display-font mt-3 text-3xl leading-tight">دخول مستقل، وصلاحيات لا تُمنح تلقائيًا.</h1><p className="mt-5 text-sm leading-7 text-[#d7ebe3]">أي حساب جديد لا يرى بيانات الصيدلية ولا ينشئ مساحة عمل. المدير المعتمد وحده يضيف الزملاء ويمنحهم دورهم.</p></aside><form className="p-7 sm:p-10" onSubmit={(event) => void submit(event, "sign-in")}><button type="button" onClick={() => window.location.assign("/")} className="inline-flex items-center gap-2 text-xs font-bold text-[#477367]"><ArrowRight className="size-4" />العودة إلى الأداة</button><h2 className="display-font mt-8 text-2xl font-semibold text-[#214b41]">تسجيل الدخول</h2><p className="mt-2 text-xs leading-6 text-[#71867d]">استخدم الحساب الذي وافق عليه مدير الصيدلية. لا تحفظ الأداة كلمة المرور.</p><label className="mt-6 block text-xs font-bold text-[#386357]">البريد الإلكتروني<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="mt-2 block w-full rounded-xl border border-[#cfe0d8] px-3 py-3 text-sm outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label><label className="mt-4 block text-xs font-bold text-[#386357]">كلمة المرور<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" minLength={8} required className="mt-2 block w-full rounded-xl border border-[#cfe0d8] px-3 py-3 text-sm outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label>{message && <p className="mt-4 rounded-xl bg-[#f4f8f5] px-3 py-2 text-xs leading-6 text-[#42695e]">{message}</p>}<button disabled={busy} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#164b40] px-4 text-sm font-bold text-white transition hover:bg-[#1c6656] active:scale-[.98] disabled:opacity-60"><LockKeyhole className="size-4" />{busy ? "جارٍ التحقق…" : "دخول آمن"}</button>{bootstrapSignup && <button type="button" disabled={busy} onClick={(event) => { const form = event.currentTarget.form; if (form?.reportValidity()) void submit({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, "sign-up"); }} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#a8d2c1] px-4 text-xs font-bold text-[#246450] hover:bg-[#f0f8f4] disabled:opacity-60"><Mail className="size-4" />إنشاء حساب التمهيد المؤقت</button>}</form></section></main>;
}
