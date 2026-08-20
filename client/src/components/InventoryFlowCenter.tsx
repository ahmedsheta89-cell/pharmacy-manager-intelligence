import type { RefObject } from "react";
import { AlertTriangle, ArrowDownToLine, BarChart3, CircleDollarSign, FileDown, PackageCheck, PackageMinus, ShieldAlert, TrendingDown } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { InventoryFlowAnalysis } from "@/lib/inventoryFlowEngine";

type Props = {
  analysis: InventoryFlowAnalysis;
  onExportExcel: () => void;
  onExportPdf: () => void;
  pdfStatus: "idle" | "working" | "done" | "failed";
  pdfError: string;
  reportRef: RefObject<HTMLDivElement | null>;
};

function egp(value?: number) {
  return value === undefined ? "غير متاح" : new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(value);
}

function number(value?: number) {
  return value === undefined ? "غير متاح" : new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(value);
}

function MetricCard({ icon: Icon, label, value, note, tone = "green" }: { icon: typeof PackageCheck; label: string; value: string; note: string; tone?: "green" | "gold" | "rose" }) {
  const tones = {
    green: "border-[#d3e7dd] bg-[#f5faf7] text-[#176851]",
    gold: "border-[#eddba5] bg-[#fffaf0] text-[#926b14]",
    rose: "border-[#efd1ce] bg-[#fff7f5] text-[#ad4936]",
  };
  return <article className={`rounded-2xl border p-4 shadow-[0_10px_24px_rgba(20,57,46,.05)] ${tones[tone]}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold tracking-wide">{label}</p><p className="mt-2 text-xl font-extrabold tracking-[-.03em] text-[#21483d]">{value}</p></div><span className="grid size-9 place-items-center rounded-xl bg-white/80 shadow-sm"><Icon className="size-4" /></span></div>
    <p className="mt-3 border-t border-current/10 pt-2 text-[10px] leading-4 opacity-80">{note}</p>
  </article>;
}

export function InventoryFlowCenter({ analysis, onExportExcel, onExportPdf, pdfStatus, pdfError, reportRef }: Props) {
  const metrics = analysis.metrics;
  const chartData = analysis.months.map((month) => ({
    الشهر: month.label,
    "الخارج (وحدات)": month.outboundUnits,
    "التعويض المستنتج": month.inferredReplenishmentUnits,
    "رصيد صفر": month.zeroBalanceItems,
    "قيمة المبيعات": month.salesValue,
  }));

  return <div ref={reportRef} className="space-y-5" dir="rtl">
    <section className="overflow-hidden rounded-[1.6rem] border border-[#d4e2db] bg-[linear-gradient(130deg,#0e5448,#15483e_55%,#d5a936)] px-5 py-6 text-white shadow-[0_16px_38px_rgba(16,70,57,.17)] sm:px-7">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div className="max-w-2xl"><p className="text-[10px] font-bold tracking-[.17em] text-[#f3d98d]">INVENTORY FLOW INTELLIGENCE</p><h2 className="mt-2 display-font text-2xl font-semibold tracking-[-.03em]">صورة موحّدة لدخول المخزون وخروجه وما يحتاج قرارًا</h2><p className="mt-3 text-sm leading-6 text-[#e6f2ed]">تجمع هذه اللوحة حركة البيع والرصيد والتعويض المستنتج وفرص عدم التوفر من الملفات الشهرية. لا تحوّل القراءة الحسابية إلى خسارة مؤكدة أو تنبؤ.</p></div>
        <div className="no-print flex flex-wrap gap-2"><button onClick={onExportExcel} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#1c594b] shadow-sm hover:bg-[#fffdf7]"><FileDown className="size-4" />تصدير Excel</button><button onClick={onExportPdf} disabled={pdfStatus === "working"} className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-60"><ArrowDownToLine className="size-4" />{pdfStatus === "working" ? "جاري تجهيز PDF…" : "تصدير PDF"}</button></div>
      </div>
      {pdfStatus === "done" && <p className="mt-4 rounded-xl bg-[#e9f7ee]/15 px-3 py-2 text-xs font-semibold text-[#fbf1c8]">تم تجهيز تقرير PDF محليًا.</p>}
      {pdfStatus === "failed" && <p className="mt-4 rounded-xl bg-[#7c2925]/45 px-3 py-2 text-xs font-semibold text-white">{pdfError || "تعذر إنشاء ملف PDF."}</p>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={CircleDollarSign} label="قيمة المخزون الشرائية" value={egp(metrics.currentStockPurchaseValue)} note="تظهر عند مطابقة سعر الشراء من ملف الأسعار." />
      <MetricCard icon={PackageCheck} label="قيمة المخزون بسعر الجمهور" value={egp(metrics.currentStockPublicValue)} note="تستخدم سعر الجمهور المطابق، لا سعرًا مشتقًا." tone="gold" />
      <MetricCard icon={PackageMinus} label="رصيد صفر حاليًا" value={`${number(metrics.currentZeroBalanceCount)} صنف`} note="أصناف لا يحمل أحدث شهر لها رصيدًا موجبًا." tone="rose" />
      <MetricCard icon={ShieldAlert} label="أولوية طلب مرتفعة" value={`${number(metrics.highPriorityCount)} صنف`} note="عاجل أو مرتفع وفق التغطية والحركة المتاحة." tone="rose" />
    </section>

    <section className="grid gap-3 lg:grid-cols-3">
      <MetricCard icon={TrendingDown} label="قيمة حركة صفرية (شراء)" value={egp(metrics.zeroMovementPurchaseValue)} note="قيمة رصيد أصناف لم تتحرك، عند توفر التكلفة." tone="gold" />
      <MetricCard icon={CircleDollarSign} label="فرصة مبيعات غير متحققة" value={egp(metrics.unreplenishedOpportunitySales)} note="قراءة حسابية من الشهر السابق حين ينفد الصنف ولا يتحرك أو يتعوض." tone="rose" />
      <MetricCard icon={AlertTriangle} label="فرصة ربح غير متحققة" value={egp(metrics.unreplenishedOpportunityGrossProfit)} note="لا تظهر إلا عند وجود سعر شراء وجمهور موثّقين." tone="rose" />
    </section>

    {analysis.comparable ? <section className="rounded-2xl border border-[#d9e6df] bg-white p-4 shadow-[0_10px_26px_rgba(20,57,46,.04)] sm:p-5"><div className="mb-4 flex items-start gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#edf7f2] text-[#16735b]"><BarChart3 className="size-4" /></span><div><h3 className="text-sm font-extrabold text-[#244b40]">وتيرة الخروج والتعويض عبر الأشهر</h3><p className="mt-1 text-[11px] leading-5 text-[#74877f]">التعويض مستنتج من تغيّر الرصيد والكمية الخارجة، وقد يتضمن تسويات أو مرتجعات.</p></div></div><div className="h-[260px]" dir="ltr"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{ top: 10, right: 18, left: 0, bottom: 0 }}><CartesianGrid stroke="#e7eee9" vertical={false} /><XAxis dataKey="الشهر" tick={{ fill: "#64786f", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#64786f", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, borderColor: "#d9e6df", direction: "rtl" }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="الخارج (وحدات)" fill="#177b65" radius={[5, 5, 0, 0]} /><Bar dataKey="التعويض المستنتج" fill="#d3a83e" radius={[5, 5, 0, 0]} /><Line type="monotone" dataKey="رصيد صفر" stroke="#c65c49" strokeWidth={2.5} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div></section> : <section className="rounded-2xl border border-dashed border-[#cbdcd4] bg-[#f8fbf8] p-5 text-sm leading-6 text-[#557269]"><strong className="text-[#245144]">الوتيرة الشهرية غير متاحة بعد.</strong> ارفع ملفين شهريين أو أكثر (مثل يونيو ويوليو وأغسطس)، ثم عيّن الشهر يدويًا إذا لم يكن واضحًا في الاسم.</section>}

    <section className="grid gap-4 xl:grid-cols-2"><article className="rounded-2xl border border-[#efd9d3] bg-[#fffaf8] p-4 sm:p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fbe9e5] text-[#ad4936]"><TrendingDown className="size-4" /></span><div><h3 className="text-sm font-extrabold text-[#633b34]">أصناف لم تُعوّض بعد الطلب</h3><p className="text-[11px] text-[#8f6d66]">أعلى الأصناف وفق فرصة المبيعات المحسوبة أو الطلب التاريخي.</p></div></div><div className="mt-4 space-y-2">{analysis.unreplenishedItems.slice(0, 8).map((item) => <div key={`${item.id}-${item.periodLabel}`} className="rounded-xl border border-[#f0dfda] bg-white px-3 py-2.5"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-xs font-bold text-[#5b3c35]">{item.itemName}</p><span className="shrink-0 text-[10px] font-extrabold text-[#b24f3b]">{egp(item.opportunitySales)}</span></div><p className="mt-1 text-[10px] text-[#92716a]">{item.previousPeriodLabel} ← {item.periodLabel} · طلب سابق {number(item.historicalDemand)} · رصيد حالي {number(item.closingStock)}</p></div>)}{analysis.unreplenishedItems.length === 0 && <p className="rounded-xl border border-dashed border-[#edcec7] p-4 text-xs leading-5 text-[#8f6d66]">لا توجد حالة مكتملة الشروط: يلزم شهر سابق بحركة مثبتة ثم رصيد صفر وحركة صفر وعدم تعويض في الشهر اللاحق.</p>}</div></article>
      <article className="rounded-2xl border border-[#e9dfbc] bg-[#fffdf6] p-4 sm:p-5"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f8edca] text-[#946d16]"><AlertTriangle className="size-4" /></span><div><h3 className="text-sm font-extrabold text-[#5f4b1e]">تركيز المدير الآن</h3><p className="text-[11px] text-[#82734e]">أصناف بأولوية عاجلة أو مرتفعة قبل تحولها إلى نفاد.</p></div></div><div className="mt-4 space-y-2">{analysis.focusItems.slice(0, 8).map((item) => <div key={item.id} className="rounded-xl border border-[#eee5c9] bg-white px-3 py-2.5"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-xs font-bold text-[#5f4d22]">{item.itemName}</p><span className="rounded-full bg-[#fbefc7] px-2 py-0.5 text-[10px] font-extrabold text-[#8e6912]">{item.priority}</span></div><p className="mt-1 text-[10px] text-[#897b5c]">الرصيد {number(item.stock)} · تغطية {item.monthsOfCoverage === undefined ? "غير متاحة" : `${item.monthsOfCoverage.toFixed(1)} شهر`}</p></div>)}{analysis.focusItems.length === 0 && <p className="rounded-xl border border-dashed border-[#e7ddb9] p-4 text-xs leading-5 text-[#82734e]">لا توجد أولوية عالية محسوبة بالبيانات الحالية.</p>}</div></article></section>

    <section className="rounded-2xl border border-[#d9e6df] bg-[#f8fbf8] p-4"><h3 className="text-sm font-extrabold text-[#244b40]">حدود القراءة والتدقيق</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-[#58746a]">{[...analysis.notes, ...analysis.dataGaps].slice(0, 5).map((note, index) => <li key={index} className="rounded-lg bg-white px-3 py-2">{note}</li>)}</ul></section>
  </div>;
}
