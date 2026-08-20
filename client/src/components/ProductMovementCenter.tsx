import { useState } from "react";
import { AlertCircle, ArrowLeft, CircleAlert, Download, PackageMinus, PackageSearch, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { formatEGP, formatNumber } from "@/lib/pharmacyEngine";
import type { CoverageGapItem, ProductMovementAnalysis, ProductMovementItem, StoppedProduct, ZeroBalanceItem, ZeroMovementItem } from "@/lib/productMovementEngine";
import { getMovementQuickFilterClassName, getMovementQuickFilterView, type MovementQuickFilter } from "@/lib/productMovementFilters";

function valueOrUnavailable(value: number | undefined, formatter: (value: number | undefined) => string) {
  return value === undefined ? "غير متاح" : formatter(value);
}

function ViewHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="entry-rise"><div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#9a721f]"><span className="h-px w-7 bg-[#d8a345]" />{eyebrow}</div><h2 className="display-font text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-6 text-[#6e827a]">{description}</p></div>;
}

function MetricCard({ label, value, note, tone, icon: Icon }: { label: string; value: string; note: string; tone: string; icon: typeof PackageSearch }) {
  return <section className="panel-shadow rounded-2xl border border-[#dce8e2] bg-[#fcfcf8] p-4"><div className="flex items-start justify-between gap-3"><div className={`grid size-9 place-items-center rounded-xl ${tone}`}><Icon className="size-[18px]" /></div><span className="rounded-md bg-[#f0f5f1] px-2 py-1 text-[9px] font-bold text-[#668078]">مباشر من الملف</span></div><p className="mt-5 text-[11px] font-bold text-[#758780]">{label}</p><p className="metric-number mt-1.5 truncate text-[23px] font-bold text-[#1a473e]">{value}</p><p className="mt-2 min-h-4 text-[10px] leading-4 text-[#82918c]">{note}</p></section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="m-4 rounded-xl border border-dashed border-[#cbded5] bg-[#f7faf7] p-5 text-center text-xs leading-6 text-[#698078]"><PackageSearch className="mx-auto mb-2 size-5 text-[#6b9b8b]" />{text}</div>;
}

function Cell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-top text-xs text-[#506b62] ${className}`}>{children}</td>;
}

function ItemIdentity({ item }: { item: ProductMovementItem }) {
  return <div className="min-w-[155px]"><p className="font-bold text-[#244e44]">{item.itemName}</p><p className="mt-1 text-[10px] text-[#82918c]">{item.itemCode ?? "كود غير متاح"}{item.company ? ` · ${item.company}` : ""}</p></div>;
}

function Price({ value, source }: { value: number | undefined; source: ProductMovementItem["purchasePriceSource"] | ProductMovementItem["publicPriceSource"] }) {
  const note = source === "source" ? "من المصدر" : source === "price_file" ? "ملف الأسعار" : source === "derived" ? "مشتق" : "غير متاح";
  return <div><p>{valueOrUnavailable(value, formatEGP)}</p>{value !== undefined && <p className="mt-1 text-[9px] text-[#82918c]">{note}</p>}</div>;
}

function Margin({ item }: { item: ProductMovementItem }) {
  return <div><p>{item.margin === undefined ? "غير متاح" : `${formatNumber(item.margin)}%`}</p>{item.margin !== undefined && <p className="mt-1 text-[9px] text-[#82918c]">{item.marginSource === "source" ? "من المصدر" : "مشتق"}</p>}</div>;
}

function ZeroBalanceTable({ items }: { items: ZeroBalanceItem[] }) {
  return <TableCard title="أصناف الرصيد الصفري" subtitle="الأصناف التي رصيدها الحالي صفر. لا تُعرض التكلفة أو الهامش إلا إن كانت موجودة أو مشتقة من قيم موثقة."><div className="scrollbar-thin overflow-auto"><table className="w-full min-w-[820px] text-right"><thead><tr><Header>الصنف</Header><Header>رصيد</Header><Header>قيمة المبيعات المسجلة</Header><Header>سعر الشراء</Header><Header>سعر بيع / وحدة</Header><Header>نسبة الربح</Header></tr></thead><tbody>{items.length ? items.slice(0, 100).map((item) => <tr key={item.id} className="border-t border-[#edf2ee]"><Cell><ItemIdentity item={item} /></Cell><Cell><b className="rounded-md bg-[#fbeceb] px-2 py-1 text-[#a94c44]">0</b></Cell><Cell>{valueOrUnavailable(item.sales, formatEGP)}</Cell><Cell><Price value={item.purchasePrice} source={item.purchasePriceSource} /></Cell><Cell><Price value={item.publicPrice} source={item.publicPriceSource} /></Cell><Cell><Margin item={item} /></Cell></tr>) : <tr><td colSpan={6}><EmptyState text="لا توجد أصناف برصيد صفري في الحقول المتاحة." /></td></tr>}</tbody></table></div></TableCard>;
}

function ZeroMovementTable({ items }: { items: ZeroMovementItem[] }) {
  return <TableCard title="أصناف بلا حركة" subtitle="كمية الحركة المسجلة تساوي صفرًا في اللقطة الحالية. قيمة المخزون هي الرصيد × السعر المتاح، وليست قيمة مبيعات فترة مفقودة."><div className="scrollbar-thin overflow-auto"><table className="w-full min-w-[980px] text-right"><thead><tr><Header>الصنف</Header><Header>الرصيد</Header><Header>سعر الشراء</Header><Header>سعر بيع / وحدة</Header><Header>قيمة المخزون بالتكلفة</Header><Header>قيمة المخزون بسعر البيع</Header><Header>نسبة الربح</Header></tr></thead><tbody>{items.length ? items.slice(0, 100).map((item) => <tr key={item.id} className="border-t border-[#edf2ee]"><Cell><ItemIdentity item={item} /></Cell><Cell>{formatNumber(item.stock)}</Cell><Cell><Price value={item.purchasePrice} source={item.purchasePriceSource} /></Cell><Cell><Price value={item.publicPrice} source={item.publicPriceSource} /></Cell><Cell>{valueOrUnavailable(item.purchaseValue, formatEGP)}</Cell><Cell><b className="text-[#9a6411]">{valueOrUnavailable(item.publicValue, formatEGP)}</b></Cell><Cell><Margin item={item} /></Cell></tr>) : <tr><td colSpan={7}><EmptyState text="لا توجد أصناف بحركة صفرية في الحقول المتاحة." /></td></tr>}</tbody></table></div></TableCard>;
}

function StoppedTable({ items }: { items: StoppedProduct[] }) {
  return <TableCard title="أصناف توقفت حركتها بعد أول فترة" subtitle="صنف له مبيعات موجبة في أول فترة مكتشفة، ثم لم تظهر له أي مبيعات في الفترات التالية."><div className="scrollbar-thin overflow-auto"><table className="w-full min-w-[720px] text-right"><thead><tr><Header>الصنف</Header><Header>الفترة المرجعية</Header><Header>مبيعاتها</Header><Header>الفترة الأخيرة</Header><Header>مبيعات ما بعدها</Header></tr></thead><tbody>{items.length ? items.slice(0, 100).map((item) => <tr key={item.id} className="border-t border-[#edf2ee]"><Cell><ItemIdentity item={item} /></Cell><Cell>{item.baselinePeriod}</Cell><Cell><b className="text-[#1f6856]">{formatEGP(item.baselineSales)}</b></Cell><Cell>{item.followUpPeriod}</Cell><Cell><span className="rounded-md bg-[#fbeceb] px-2 py-1 font-bold text-[#a94c44]">صفر</span></Cell></tr>) : <tr><td colSpan={5}><EmptyState text="لا توجد أصناف متوقفة بحسب الفترات القابلة للمقارنة في الملف." /></td></tr>}</tbody></table></div></TableCard>;
}

function CoverageTable({ items }: { items: CoverageGapItem[] }) {
  return <TableCard title="فجوة الرصيد وأولوية الطلب" subtitle="يُقاس الغطاء بالرصيد الحالي ÷ متوسط الطلب التاريخي. الكمية المقترحة هي الفارق للوصول إلى معدل شهر واحد، وليست أمر شراء آليًا."><div className="scrollbar-thin overflow-auto"><table className="w-full min-w-[860px] text-right"><thead><tr><Header>الصنف</Header><Header>الرصيد الحالي</Header><Header>متوسط الطلب السابق</Header><Header>غطاء الرصيد</Header><Header>فجوة الطلب</Header><Header>الأولوية</Header></tr></thead><tbody>{items.length ? items.slice(0, 100).map((item) => <tr key={item.id} className="border-t border-[#edf2ee]"><Cell><ItemIdentity item={item} /></Cell><Cell>{formatNumber(item.stock)}</Cell><Cell>{formatNumber(item.averageHistoricalDemand)}</Cell><Cell>{formatNumber(item.monthsOfCoverage)} شهر</Cell><Cell><b className="text-[#a26915]">{formatNumber(item.gap)}</b></Cell><Cell><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${item.priority === "عاجل" ? "bg-[#fbeceb] text-[#a94c44]" : item.priority === "مرتفع" ? "bg-[#fff3dd] text-[#8f6416]" : "bg-[#e7f4ee] text-[#176f5b]"}`}>{item.priority}</span></Cell></tr>) : <tr><td colSpan={6}><EmptyState text="لا تظهر فجوة تغطية قابلة للقياس من البيانات الحالية." /></td></tr>}</tbody></table></div></TableCard>;
}

function TableCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="panel-shadow overflow-hidden rounded-2xl border border-[#dce8e2] bg-[#fcfcf8]"><div className="border-b border-[#e5eee9] px-5 py-4"><p className="font-bold text-[#214a41]">{title}</p><p className="mt-1 text-[11px] leading-5 text-[#74867f]">{subtitle}</p></div>{children}</section>;
}

function Header({ children }: { children: React.ReactNode }) {
  return <th className="bg-[#f5f8f5] px-3 py-3 text-[10px] font-bold text-[#71837b]">{children}</th>;
}

export function ProductMovementCenter({ analysis, onExportExcel, onExportPdf, pdfStatus = "idle", pdfError, reportRef }: { analysis: ProductMovementAnalysis; onExportExcel?: () => void; onExportPdf?: () => void; pdfStatus?: "idle" | "working" | "done" | "failed"; pdfError?: string; reportRef?: React.RefObject<HTMLDivElement | null> }) {
  const [quickFilter, setQuickFilter] = useState<MovementQuickFilter>("all");
  if (!analysis.available) return <div className="mx-auto max-w-[1350px]"><ViewHeading eyebrow="حركة المخزون" title="متابعة حركة الأصناف" description="تحتاج هذه اللوحة إلى اسم الصنف على الأقل داخل شيت قابل للقراءة." /><EmptyState text="لم نتعرف على اسم صنف صالح داخل الملف الحالي." /></div>;
  const periodText = analysis.periods.length ? analysis.periods.map((period) => period.label).join(" ← ") : "لا توجد فترات زمنية قابلة للمقارنة";
  const filterView = getMovementQuickFilterView(analysis, quickFilter);
  return <div className="mx-auto max-w-[1350px] space-y-5"><div className="flex flex-wrap items-end justify-between gap-4"><ViewHeading eyebrow="المخزون · الطلب · الفجوة" title="متابعة حركة الأصناف" description="شاشة قرار لقراءة الرصيد والحركة الصفرية، توقف الحركة بين الشهور، وكمية التغطية المطلوبة مقارنةً بالمعدل السابق — دون اختراع سعر أو تاريخ غير موجود." /><div className="no-print flex gap-2"><button onClick={onExportExcel} className="inline-flex items-center gap-2 rounded-xl border border-[#b9d8cc] bg-white px-3 py-2.5 text-xs font-bold text-[#236353] hover:bg-[#eff8f2]"><Download className="size-4" />Excel</button><button onClick={onExportPdf} disabled={pdfStatus === "working"} className="inline-flex items-center gap-2 rounded-xl bg-[#123c37] px-3 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] disabled:opacity-60"><Printer className="size-4" />{pdfStatus === "working" ? "جارٍ إعداد PDF…" : "PDF"}</button></div></div>
    {pdfError && <section className="no-print rounded-xl border border-[#f0c5be] bg-[#fff2f0] px-4 py-3 text-xs text-[#9d4841]">{pdfError}</section>}
    {pdfStatus === "done" && <section className="no-print rounded-xl border border-[#c5e1d3] bg-[#eff9f3] px-4 py-3 text-xs font-bold text-[#27705b]">تم تجهيز تقرير PDF محليًا.</section>}
    <div className="no-print flex flex-wrap gap-2 rounded-2xl border border-[#d8e7df] bg-white p-3"><span className="self-center pl-1 text-[11px] font-bold text-[#587168]">تصفية سريعة:</span><button onClick={() => setQuickFilter("all")} className={getMovementQuickFilterClassName(quickFilter, "all")}>كل المؤشرات</button><button onClick={() => setQuickFilter("zero-balance")} className={getMovementQuickFilterClassName(quickFilter, "zero-balance")}><PackageMinus className="ml-1 inline size-3.5" />رصيد صفري · {formatNumber(analysis.metrics.zeroBalanceCount)}</button><button onClick={() => setQuickFilter("high-priority")} className={getMovementQuickFilterClassName(quickFilter, "high-priority")}><CircleAlert className="ml-1 inline size-3.5" />طلب مرتفع/عاجل · {formatNumber(filterView.highPriority.length)}</button></div>
    <div ref={reportRef} className="space-y-5">
    <section className="rounded-2xl border border-[#c8dfd4] bg-[#eff8f2] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d8eee3] text-[#16715b]"><TrendingUp className="size-5" /></div><div><p className="text-xs font-bold text-[#245448]">مصدر المقارنة: {periodText}</p><p className="mt-1 text-[11px] leading-5 text-[#5b786e]">{analysis.sourceNote}</p><p className="mt-1 text-[10px] font-semibold text-[#397361]">ربط السجلات: {formatNumber(analysis.metrics.matchedByCodeRecordCount)} بالكود، و{formatNumber(analysis.metrics.matchedByNameRecordCount)} بالاسم عند غياب الكود.</p></div></div><span className="rounded-lg border border-[#bdd9cc] bg-white/80 px-2.5 py-1.5 text-[10px] font-bold text-[#367764]">{formatNumber(analysis.items.length)} صنف</span></div></section>
    {analysis.dataGaps.length > 0 && <section className="rounded-2xl border border-[#ead39f] bg-[#fff9e8] p-4"><div className="flex gap-3"><AlertCircle className="mt-0.5 size-5 shrink-0 text-[#a87419]" /><div><p className="text-xs font-bold text-[#745917]">ما الذي لا يمكن إثباته من هذا الملف؟</p><ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#896f2e]">{analysis.dataGaps.map((gap) => <li key={gap}>• {gap}</li>)}</ul></div></div></section>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="أصناف برصيد صفر" value={formatNumber(analysis.metrics.zeroBalanceCount)} note={`${formatNumber(analysis.metrics.zeroBalanceRawRecordCount)} إشارة خام؛ ${formatNumber(analysis.metrics.zeroBalanceRecordCount)} سجلًا باسم صنف${analysis.metrics.zeroBalanceUnidentifiedRecordCount ? `، ومنها ${formatNumber(analysis.metrics.zeroBalanceUnidentifiedRecordCount)} بلا اسم.` : "."}`} tone="bg-[#fbeceb] text-[#ab5048]" icon={PackageMinus} /><MetricCard label="أصناف بحركة صفرية" value={analysis.metrics.zeroMovementCount === undefined ? "غير متاح" : formatNumber(analysis.metrics.zeroMovementCount)} note={analysis.metrics.zeroMovementRecordCount === undefined ? "كمية الحركة غير متاحة." : `${formatNumber(analysis.metrics.zeroMovementRecordCount)} سجل حركة صفرية.`} tone="bg-[#fff4dd] text-[#9a6411]" icon={TrendingDown} /><MetricCard label="قيمة بيع مخزون الحركة الصفرية" value={valueOrUnavailable(analysis.metrics.knownZeroMovementPublicValue, formatEGP)} note="تستلزم سعر وحدة متاحًا أو مشتقًا." tone="bg-[#fff4dd] text-[#9a6411]" icon={TrendingDown} /><MetricCard label="أصناف توقفت بعد البداية" value={analysis.metrics.stoppedCount === undefined ? "غير متاح" : formatNumber(analysis.metrics.stoppedCount)} note="تستلزم فترتين أو أكثر." tone="bg-[#fbeceb] text-[#ab5048]" icon={CircleAlert} /><MetricCard label="فجوات تغطية قابلة للقياس" value={analysis.metrics.coverageGapCount === undefined ? "غير متاح" : formatNumber(analysis.metrics.coverageGapCount)} note="مقارنة بالرصد التاريخي المتاح." tone="bg-[#e7f4ee] text-[#0c705c]" icon={TrendingUp} /></div>
    {filterView.showZeroBalanceAndMovement && <div className="grid gap-5 xl:grid-cols-2"><ZeroMovementTable items={analysis.zeroMovement} /><ZeroBalanceTable items={analysis.zeroBalance} /></div>}
    {filterView.showCoverage && <CoverageTable items={filterView.coverageItems} />}
    {filterView.showStopped && <StoppedTable items={analysis.stoppedAfterBaseline} />}
    <section className="rounded-2xl border border-[#d9e6df] bg-[#fafcf9] px-5 py-4 text-[11px] leading-6 text-[#688077]"><ArrowLeft className="ml-1 inline size-3.5 text-[#0b6b5b]" /><b className="text-[#32594e]">طريقة الاستخدام المثلى:</b> عند تصدير يونيو ويوليو وأغسطس، ضع كل شهر في شيت منفصل باسم <b>6</b> و<b>7</b> و<b>8</b>، أو أضف عمود <b>تاريخ البيع</b> إلى التقرير. وقتها ستظهر تلقائيًا الأصناف التي كانت مباعة في يونيو ثم توقفت في يوليو وأغسطس، وكمية التغطية المقترحة بحسب المعدل السابق.</section>
    </div></div>;
}
