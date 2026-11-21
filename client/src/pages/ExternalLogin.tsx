import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRoundCheck } from "lucide-react";
import { getExternalAuthConfiguration, isExternalAuthEnabled, sendExternalRecoveryCode, signInWithExternalPassword, signOutExternalUser, signUpExternalUser, updateExternalPassword, verifyExternalRecoveryCode } from "@/lib/supabaseAuth";

type LoginMode = "sign-in" | "sign-up";
type LoginView = "sign-in" | "recover" | "reset";

const accessNotes = [
  { icon: ShieldCheck, title: "المدير", description: "لوحة الإدارة، التحليل، الاعتمادات وإدارة الفريق." },
  { icon: UserRoundCheck, title: "زميل الطلبات", description: "شاشة واحدة لتسجيل طلب العميل باسمك فقط." },
] as const;

function friendlyAuthMessage(error: unknown, mode: LoginMode) {
  if (mode === "sign-in") return "تعذر التحقق من بيانات الدخول. راجع البريد وكلمة المرور وحاول مرة أخرى.";
  return error instanceof Error && error.message.includes("already")
    ? "هذا البريد مسجل بالفعل. استخدم تسجيل الدخول بعد تأكيد البريد."
    : "تعذر إنشاء الحساب الآن. تأكد من البريد وكلمة المرور وحاول مرة أخرى.";
}

export default function ExternalLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<LoginView>("sign-in");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const bootstrapSignup = import.meta.env.VITE_SUPABASE_ALLOW_BOOTSTRAP_SIGNUP === "true";
  const configured = isExternalAuthEnabled() && getExternalAuthConfiguration();

  async function submit(event: FormEvent<HTMLFormElement>, mode: LoginMode) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const normalizedEmail = email.trim().toLocaleLowerCase();
      if (mode === "sign-in") {
        await signInWithExternalPassword(normalizedEmail, password);
        window.location.assign("/");
      } else {
        await signUpExternalUser(normalizedEmail, password);
        setMessage("أرسلنا رسالة تأكيد إلى بريد المدير. افتحها أولًا، ثم عد لتسجيل الدخول.");
      }
    } catch (error) {
      setMessage(friendlyAuthMessage(error, mode));
    } finally {
      setBusy(false);
    }
  }

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const normalizedEmail = email.trim().toLocaleLowerCase();
      await sendExternalRecoveryCode(normalizedEmail);
      setView("reset");
      setMessage("أرسلنا رمز استعادة إلى بريدك. أدخله هنا مع كلمة مرور جديدة.");
    } catch {
      setMessage("تعذر إرسال رمز الاستعادة الآن. تأكد من البريد وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  async function applyNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const normalizedEmail = email.trim().toLocaleLowerCase();
      if (newPassword.length < 8) throw new Error("short-password");
      if (newPassword !== newPasswordConfirm) throw new Error("mismatch");
      await verifyExternalRecoveryCode(normalizedEmail, recoveryCode.trim());
      await updateExternalPassword(newPassword);
      await signOutExternalUser();
      setPassword("");
      setRecoveryCode("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setView("sign-in");
      setMessage("تم تغيير كلمة المرور بنجاح. سجل دخولك بالكلمة الجديدة.");
    } catch (error) {
      if (error instanceof Error && error.message === "short-password") setMessage("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
      else if (error instanceof Error && error.message === "mismatch") setMessage("كلمتا المرور غير متطابقتين. أعد إدخالهما.");
      else setMessage("تعذر تغيير كلمة المرور. تأكد من الرمز وحاول مرة أخرى، أو أطلب رمزًا جديدًا.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#f5faf7] p-5"><section className="w-full max-w-xl rounded-[2rem] border border-amber-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(42,81,65,.1)]"><ShieldCheck className="mx-auto size-11 text-amber-700" /><h1 className="display-font mt-4 text-2xl font-semibold text-[#244a41]">تجهيز الدخول الآمن جارٍ</h1><p className="mt-3 text-sm leading-7 text-[#627c73]">لن نطلب منك بيانات دخول قبل اكتمال إعداد الهوية. يبقى التطبيق محميًا إلى أن يعتمد المدير إعدادات بيئة العمل الخارجية.</p></section></main>;
  }

  return <main dir="rtl" className="min-h-screen bg-[radial-gradient(circle_at_92%_8%,#d9eee2,transparent_31%),linear-gradient(135deg,#f8fbf8,#edf5f0)] px-4 py-6 sm:py-10"><section className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-[#cfe2d8] bg-white shadow-[0_28px_70px_rgba(27,78,64,.14)] lg:grid-cols-[.92fr_1.08fr]"><aside className="bg-[linear-gradient(155deg,#103c35,#1c6757)] p-7 text-white sm:p-10"><div className="flex items-center gap-3"><span className="inline-flex size-12 items-center justify-center rounded-2xl bg-[#ecd17e] text-[#16453c]"><ShieldCheck className="size-6" /></span><div><p className="text-xs font-bold tracking-[.16em] text-[#efd994]">ذكاء مدير الصيدلية</p><p className="mt-1 text-xs text-[#d7ebe3]">وصول منظم وآمن</p></div></div><h1 className="display-font mt-10 max-w-md text-3xl leading-tight">ادخل بحسابك، وسنفتح لك ما تحتاجه فقط.</h1><p className="mt-4 max-w-md text-sm leading-7 text-[#d7ebe3]">لا تختار دورك من الشاشة. يحدده المدير من داخل النظام بعد دعوتك، لحماية بيانات الصيدلية من الوصول غير المصرح به.</p><div className="mt-8 space-y-3">{accessNotes.map(({ icon: Icon, title, description }) => <div key={title} className="rounded-2xl border border-white/15 bg-white/10 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Icon className="size-4 text-[#efd994]" />{title}</div><p className="mt-2 pr-6 text-xs leading-6 text-[#d7ebe3]">{description}</p></div>)}</div><p className="mt-7 flex items-center gap-2 text-xs leading-6 text-[#c8dfd6]"><CheckCircle2 className="size-4 shrink-0 text-[#efd994]" />كلمة المرور لا تُخزن داخل تطبيق الصيدلية.</p></aside>{view !== "sign-in" ? <form className="p-7 sm:p-10" onSubmit={(event) => void (view === "recover" ? sendRecovery(event) : applyNewPassword(event))}><button type="button" onClick={() => { setView("sign-in"); setMessage(""); }} className="inline-flex items-center gap-2 text-xs font-bold text-[#477367] transition hover:text-[#1c6757]"><ArrowRight className="size-4" />العودة لتسجيل الدخول</button><div className="mt-8"><p className="text-xs font-bold tracking-[.14em] text-[#5e8a7b]">استعادة الوصول</p><h2 className="display-font mt-2 text-3xl font-semibold text-[#214b41]">{view === "recover" ? "نسيت كلمة المرور" : "تعيين كلمة مرور جديدة"}</h2><p className="mt-2 text-sm leading-7 text-[#71867d]">{view === "recover" ? "نرسل رمز تحقق مؤقتًا إلى بريد المدير، وبإدخاله هنا يمكنك تعيين كلمة مرور جديدة فورًا." : "أدخل الرمز الذي وصل بريدك، ثم اختر كلمة المرور الجديدة."}</p></div>{view === "recover" ? <label className="mt-7 block text-xs font-bold text-[#386357]"><span className="flex items-center gap-2"><Mail className="size-4 text-[#5d8a7a]" />البريد الإلكتروني</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" inputMode="email" required className="mt-2 block min-h-12 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 text-sm text-[#214b41] outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label> : <><label className="mt-7 block text-xs font-bold text-[#386357]"><span className="flex items-center gap-2"><Mail className="size-4 text-[#5d8a7a]" />رمز التحقق من البريد</span><input value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" required className="mt-2 block min-h-12 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 text-left text-sm text-[#214b41] outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label><label className="mt-4 block text-xs font-bold text-[#386357]"><span className="flex items-center gap-2"><KeyRound className="size-4 text-[#5d8a7a]" />كلمة المرور الجديدة</span><input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" minLength={8} required className="mt-2 block min-h-12 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 text-sm text-[#214b41] outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label><label className="mt-4 block text-xs font-bold text-[#386357]"><span className="flex items-center gap-2"><KeyRound className="size-4 text-[#5d8a7a]" />تأكيد كلمة المرور الجديدة</span><input value={newPasswordConfirm} onChange={(event) => setNewPasswordConfirm(event.target.value)} type="password" autoComplete="new-password" minLength={8} required className="mt-2 block min-h-12 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 text-sm text-[#214b41] outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label></>}{message && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-[#d5e8dd] bg-[#f4f8f5] px-3 py-3 text-xs leading-6 text-[#42695e]">{message}</p>}<button disabled={busy} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#164b40] px-4 text-sm font-bold text-white transition duration-200 hover:bg-[#1c6656] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"><LockKeyhole className="size-4" />{busy ? "جارٍ التحقق…" : view === "recover" ? "إرسال رمز الاستعادة" : "تعيين كلمة المرور الجديدة"}</button></form> : <form className="p-7 sm:p-10" onSubmit={(event) => void submit(event, "sign-in")}><button type="button" onClick={() => window.location.assign("/")} className="inline-flex items-center gap-2 text-xs font-bold text-[#477367] transition hover:text-[#1c6757]"><ArrowRight className="size-4" />العودة إلى الأداة</button><div className="mt-8"><p className="text-xs font-bold tracking-[.14em] text-[#5e8a7b]">مرحلة واحدة</p><h2 className="display-font mt-2 text-3xl font-semibold text-[#214b41]">تسجيل الدخول</h2><p className="mt-2 text-sm leading-7 text-[#71867d]">استخدم البريد وكلمة المرور اللذين منحك إياهما مدير الصيدلية.</p></div><label className="mt-7 block text-xs font-bold text-[#386357]"><span className="flex items-center gap-2"><Mail className="size-4 text-[#5d8a7a]" />البريد الإلكتروني</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" inputMode="email" required className="mt-2 block min-h-12 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 text-sm text-[#214b41] outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label><label className="mt-4 block text-xs font-bold text-[#386357]"><span className="flex items-center gap-2"><KeyRound className="size-4 text-[#5d8a7a]" />كلمة المرور</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" minLength={8} required className="mt-2 block min-h-12 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 text-sm text-[#214b41] outline-none transition focus:border-[#1b725c] focus:ring-2 focus:ring-[#bfe2d3]" /></label><p className="mt-3 text-xs leading-6 text-[#71867d]">إذا لم يكن لديك حساب أو دعوة، تواصل مع مدير الصيدلية. لا تمنح الحسابات الجديدة وصولًا تلقائيًا.</p>{message && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-[#d5e8dd] bg-[#f4f8f5] px-3 py-3 text-xs leading-6 text-[#42695e]">{message}</p>}<button disabled={busy} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#164b40] px-4 text-sm font-bold text-white transition duration-200 hover:bg-[#1c6656] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"><LockKeyhole className="size-4" />{busy ? "جارٍ التحقق…" : "دخول آمن"}</button><button type="button" disabled={busy} onClick={() => { setView("recover"); setMessage(""); }} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#a8d2c1] px-4 text-xs font-bold text-[#246450] transition hover:bg-[#f0f8f4] disabled:opacity-60"><KeyRound className="size-4" />نسيت كلمة المرور؟</button>{bootstrapSignup && <button type="button" disabled={busy} onClick={(event) => { const form = event.currentTarget.form; if (form?.reportValidity()) void submit({ preventDefault: () => undefined } as FormEvent<HTMLFormElement>, "sign-up"); }} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#a8d2c1] px-4 text-xs font-bold text-[#246450] transition hover:bg-[#f0f8f4] disabled:opacity-60"><Mail className="size-4" />إنشاء حساب المدير الأول</button>}</form>}</section></main>;
}
