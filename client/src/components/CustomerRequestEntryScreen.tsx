import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardPlus, LockKeyhole, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

type RequestForm = { customerName: string; customerPhone: string; productName: string; productCode: string; requestedQuantity: string; note: string };
const emptyForm: RequestForm = { customerName: "", customerPhone: "", productName: "", productCode: "", requestedQuantity: "1", note: "" };

function Field({ label, value, onChange, required, inputMode }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }) {
  return <label className="block text-[11px] font-bold text-[#315a50]">{label}<input value={value} onChange={(event) => onChange(event.target.value)} required={required} inputMode={inputMode} className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#cfe3d9] bg-white px-3.5 text-sm font-semibold text-[#1e493e] outline-none transition focus:border-[#0d8a6c] focus:ring-4 focus:ring-[#cbedde]/70" /></label>;
}

/** شاشة مقصودة للزملاء: تسجيل فقط، بلا قائمة عمل أو بيانات إدارة أو تفاصيل عملاء أخرى. */
export function CustomerRequestEntryScreen({ onOpenManager }: { onOpenManager?: () => void }) {
  const utils = trpc.useUtils();
  const auth = trpc.auth.me.useQuery(undefined, { retry: false });
  const workspaces = trpc.workspace.list.useQuery(undefined, { enabled: Boolean(auth.data), retry: false });
  const [workspaceId, setWorkspaceId] = useState<number>();
  const [form, setForm] = useState<RequestForm>(emptyForm);
  const [notice, setNotice] = useState("");
  const selectedWorkspace = useMemo(() => workspaces.data?.find((workspace) => workspace.workspaceId === workspaceId), [workspaceId, workspaces.data]);
  const isTeamMember = selectedWorkspace?.accessRole === "customer_requests";

  useEffect(() => {
    if (workspaceId || !workspaces.data?.length) return;
    setWorkspaceId(workspaces.data.find((workspace) => workspace.accessRole === "customer_requests")?.workspaceId);
  }, [workspaceId, workspaces.data]);

  const createRequest = trpc.customerRequests.create.useMutation({
    onSuccess: async (result) => {
      setNotice(result.duplicate ? "يوجد طلب مفتوح مسجل مسبقًا لنفس العميل والصنف؛ لم ننشئ تكرارًا." : "تم تسجيل طلب العميل بنجاح وأُرسل للمتابعة الإدارية.");
      if (!result.duplicate) setForm(emptyForm);
      await utils.customerRequests.list.invalidate();
    },
    onError: (error) => setNotice(error.message),
  });

  if (!auth.isLoading && !auth.data) return <section dir="rtl" className="mx-auto max-w-2xl overflow-hidden rounded-[2rem] border border-[#b9ddcf] bg-white shadow-[0_28px_70px_rgba(16,70,57,.14)]"><div className="bg-[radial-gradient(circle_at_80%_0%,#45b993,transparent_42%),linear-gradient(135deg,#123c37,#1e6759)] p-8 text-center text-white"><ShieldCheck className="mx-auto size-10 text-[#f2cb79]" /><h1 className="mt-4 text-2xl font-black">تسجيل طلب عميل</h1><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#d8f0e7]">سجّل الدخول للوصول إلى شاشة التسجيل الآمنة فقط.</p></div><div className="p-6 text-center"><button type="button" onClick={startLogin} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-[#143f37] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#1c5c4d] active:scale-[.97]"><LockKeyhole className="size-4" />تسجيل الدخول الآمن</button></div></section>;

  if (!workspaces.isLoading && !isTeamMember) return <section dir="rtl" className="mx-auto max-w-xl rounded-[2rem] border border-[#d7e7de] bg-white p-7 text-center shadow-sm"><LockKeyhole className="mx-auto size-9 text-[#9c7628]" /><h1 className="mt-3 text-xl font-black text-[#244c42]">بوابة المدير محمية</h1><p className="mt-2 text-sm leading-7 text-[#6d8279]">تم التعرّف على حساب مدير. شاشة التسجيل المخصصة تعرض للزملاء فقط، أما تفاصيل العملاء والقرارات والتوريد فتُفتح من بوابة المدير.</p>{onOpenManager && <button type="button" onClick={onOpenManager} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#153f37] px-4 text-xs font-black text-white transition hover:bg-[#1e604f] active:scale-[.97]"><ArrowLeft className="size-4" />فتح بوابة المدير</button>}</section>;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId) return setNotice("تعذر تحديد مساحة العمل المرتبطة بفريق الطلبات.");
    createRequest.mutate({ workspaceId, ...form, productCode: form.productCode.trim() || undefined, note: form.note.trim() || undefined });
  }

  return <section dir="rtl" className="mx-auto max-w-3xl"><div className="overflow-hidden rounded-[2rem] border border-[#b8dece] bg-white shadow-[0_28px_70px_rgba(17,72,59,.14)]"><header className="relative overflow-hidden bg-[radial-gradient(circle_at_90%_0%,#6ad2ad,transparent_34%),linear-gradient(135deg,#103c35,#237563)] px-6 py-7 text-white sm:px-9"><div className="absolute -left-10 -top-16 size-44 rounded-full border border-white/15" /><div className="relative flex items-start gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f4cf83] text-[#17483d] shadow-lg"><ClipboardPlus className="size-6" /></div><div><div className="flex items-center gap-2 text-[11px] font-bold tracking-[.12em] text-[#d5f0e6]"><Sparkles className="size-3.5" />مساحة الفريق</div><h1 className="mt-1 text-2xl font-black">سجّل طلب العميل بسرعة</h1><p className="mt-2 max-w-xl text-xs leading-6 text-[#d8f1e7]">تدخل البيانات الضرورية فقط. التفاصيل والقرارات والتوريد تبقى ضمن بوابة المدير.</p></div></div></header><form onSubmit={submit} className="p-5 sm:p-8"><div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#d2ebdf] bg-[#f1faf5] p-3.5"><UserRound className="size-5 text-[#16775e]" /><div><p className="text-xs font-black text-[#214c42]">سيُحفظ الطلب باسم حسابك</p><p className="mt-1 text-[11px] text-[#678279]">لا يمكن اختيار أو تعديل اسم زميل آخر من هذه الشاشة.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><Field label="اسم العميل" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} required /><Field label="رقم الهاتف / WhatsApp" value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} inputMode="tel" required /><Field label="اسم الصنف" value={form.productName} onChange={(value) => setForm({ ...form, productName: value })} required /><Field label="كود الصنف (اختياري)" value={form.productCode} onChange={(value) => setForm({ ...form, productCode: value })} /><Field label="الكمية المطلوبة" value={form.requestedQuantity} onChange={(value) => setForm({ ...form, requestedQuantity: value })} inputMode="decimal" required /></div><label className="mt-4 block text-[11px] font-bold text-[#315a50]">ملاحظة اختيارية<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={3000} placeholder="مثال: لا يقبل بديلاً" className="mt-1.5 min-h-28 w-full rounded-2xl border border-[#cfe3d9] bg-white px-3.5 py-3 text-sm font-semibold text-[#1e493e] outline-none transition focus:border-[#0d8a6c] focus:ring-4 focus:ring-[#cbedde]/70" /></label>{notice && <div role="status" className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs font-bold leading-6 ${notice.includes("تم تسجيل") ? "border-[#b6dfc9] bg-[#ecf9f0] text-[#21684f]" : "border-[#ead3b1] bg-[#fff9ea] text-[#82601f]"}`}><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{notice}</div>}<button disabled={createRequest.isPending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#153f37] px-5 text-sm font-black text-white shadow-[0_10px_22px_rgba(17,72,59,.2)] transition hover:bg-[#1e604f] active:scale-[.98] disabled:opacity-60"><ClipboardPlus className="size-4" />{createRequest.isPending ? "جارٍ حفظ الطلب…" : "حفظ طلب العميل"}</button><p className="mt-4 text-center text-[10px] leading-5 text-[#71857d]">يحمي النظام الخصوصية ولا يعرض لك قائمة طلبات أو أرقام عملاء أخرى أو إعدادات الإدارة.</p></form></div></section>;
}
