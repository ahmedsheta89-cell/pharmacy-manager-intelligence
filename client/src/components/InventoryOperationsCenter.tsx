/**
 * نبض العيادة التنفيذي — لوحات المخزون والفروع.
 * تعرض الأولوية والدليل المتاح، وتسمح بقواعد محلية فوق حد المصدر دون إرسال أو طلب تلقائي.
 */
import { useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Boxes, Building2, CheckCircle2, Clock3, FileUp, GitCompareArrows, PackagePlus, SlidersHorizontal } from "lucide-react";
import { formatNumber } from "@/lib/pharmacyEngine";
import type { InventoryItem, InventoryOperations } from "@/lib/inventoryEngine";
import type { ReorderRules } from "@/lib/reorderRules";
import type { ReorderRulesImportResult } from "@/lib/reorderRulesImport";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function statusMeta(item: InventoryItem) {
  if (item.status === "near_expiry") return { label: "قرب انتهاء", classes: "border-[#f1c9bd] bg-[#fff0ea] text-[#a64e3e]", Icon: Clock3 };
  if (item.status === "low_stock") return { label: "طلب قريب", classes: "border-[#edda9d] bg-[#fff7df] text-[#99640e]", Icon: AlertTriangle };
  if (item.status === "healthy") return { label: "مستقر", classes: "border-[#c9e6d7] bg-[#eaf7ef] text-[#26735b]", Icon: CheckCircle2 };
  return { label: "مراجعة", classes: "border-[#dce5e0] bg-[#f1f4f2] text-[#687b73]", Icon: AlertTriangle };
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-[#c9dbd3] bg-[#f7faf7] p-6 text-center"><Boxes className="mx-auto size-6 text-[#6b988a]" /><p className="mt-3 text-sm font-bold text-[#31594e]">{title}</p><p className="mx-auto mt-2 max-w-md text-xs leading-6 text-[#72857d]">{description}</p></div>;
}

function Metric({ label, value, note, tone }: { label: string; value: number; note: string; tone: "rose" | "amber" | "green" }) {
  const colors = { rose: "border-[#f0d9d0] bg-[#fff8f5] text-[#ad5546]", amber: "border-[#f0dfaf] bg-[#fffaf0] text-[#95620d]", green: "border-[#cce4d8] bg-[#f4faf6] text-[#207059]" };
  return <div className={`panel-shadow rounded-2xl border p-4 ${colors[tone]}`}><p className="text-[11px] font-bold">{label}</p><p className="metric-number mt-2 text-[25px] font-bold">{formatNumber(value)}</p><p className="mt-1 text-[10px] opacity-80">{note}</p></div>;
}

type InventoryPanelProps = { operations: InventoryOperations; rules?: ReorderRules; onSaveRule?: (itemId: string, reorderLevel: number, targetStock?: number) => void; onRemoveRule?: (itemId: string) => void; onExport?: () => void; onImportRules?: (file: File) => Promise<ReorderRulesImportResult>; };

export function InventoryOperationsCenter({ operations, mode, rules = {}, onSaveRule, onRemoveRule, onExport, onImportRules }: InventoryPanelProps & { mode: "inventory" | "branches" }) {
  return mode === "branches" ? <BranchComparison operations={operations} /> : <InventoryDashboard operations={operations} rules={rules} onSaveRule={onSaveRule} onRemoveRule={onRemoveRule} onExport={onExport} onImportRules={onImportRules} />;
}

function InventoryDashboard({ operations, rules = {}, onSaveRule, onRemoveRule, onExport, onImportRules }: InventoryPanelProps) {
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [reorderLevel, setReorderLevel] = useState("");
  const [targetStock, setTargetStock] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const ruleFileInput = useRef<HTMLInputElement>(null);
  const maxSuggested = Math.max(...operations.suggestions.map((item) => item.suggestedQuantity ?? 0), 1);
  const alerts = [...operations.nearExpiry, ...operations.lowStock].slice(0, 14);

  const openRule = (item: InventoryItem) => {
    const rule = rules[item.id];
    setEditing(item);
    setReorderLevel(rule ? String(rule.reorderLevel) : item.reorderLevel === undefined ? "" : String(item.reorderLevel));
    setTargetStock(rule?.targetStock === undefined ? "" : String(rule.targetStock));
    setError("");
  };

  const saveRule = () => {
    if (!editing || !onSaveRule) return;
    const minimum = Number(reorderLevel);
    const target = targetStock.trim() === "" ? undefined : Number(targetStock);
    if (!Number.isFinite(minimum) || minimum < 0) { setError("أدخل حد إعادة طلب صحيحًا يساوي صفرًا أو أكبر."); return; }
    if (target !== undefined && (!Number.isFinite(target) || target < minimum)) { setError("رصيد الهدف يجب أن يساوي حد إعادة الطلب أو يزيد عنه."); return; }
    onSaveRule(editing.id, minimum, target);
    setNotice(`تم اعتماد قاعدة مخصصة للصنف «${editing.itemName}» على هذا الجهاز.`);
    setEditing(null);
  };

  const clearRule = (item: InventoryItem) => {
    if (!onRemoveRule) return;
    onRemoveRule(item.id);
    setNotice(`عادت قاعدة «${item.itemName}» إلى حد الملف أو مبيعات الفترة.`);
  };

  const importRules = async (file?: File) => {
    if (!file || !onImportRules) return;
    setImporting(true); setError("");
    try { const result = await onImportRules(file); setNotice(`تمت مراجعة ${formatNumber(result.readRows)} صفًا: اعتمدنا ${formatNumber(result.accepted.length)} قاعدة${result.rejected.length ? ` واستبعدنا ${formatNumber(result.rejected.length)} صفًا غير صالح` : ""}.`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر استيراد قواعد إعادة الطلب."); }
    finally { setImporting(false); }
  };

  return <>
    <div className="mx-auto max-w-[1350px] space-y-5">
      <header className="entry-rise flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#9a721f]"><span className="h-px w-7 bg-[#d8a345]" />حركة تشغيلية مبنية على بياناتك</div><h2 className="display-font text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">المخزون والطلبات المقترحة</h2><p className="mt-1 max-w-3xl text-xs leading-6 text-[#6e827a]">{operations.note}</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-[#c9e4d8] bg-[#eff9f3] px-3 py-2 text-[10px] font-bold text-[#287159]">تحليل محلي · لا إرسال تلقائي للطلبات</span><input ref={ruleFileInput} onChange={(event) => { void importRules(event.target.files?.[0]); event.target.value = ""; }} type="file" accept=".xlsx,.xls,.csv" className="hidden" /><button type="button" onClick={() => ruleFileInput.current?.click()} disabled={!operations.available || importing} className="inline-flex items-center gap-2 rounded-xl border border-[#b7d8cb] bg-white px-3.5 py-2.5 text-[11px] font-bold text-[#1d6251] transition hover:bg-[#eff8f3] disabled:cursor-not-allowed disabled:opacity-50"><FileUp className="size-4 text-[#0a6d59]" />{importing ? "نراجع القواعد…" : "استيراد قواعد"}</button><button type="button" onClick={onExport} disabled={!operations.available} className="inline-flex items-center gap-2 rounded-xl bg-[#123c37] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#17564c] disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownToLine className="size-4 text-[#d8a345]" />تصدير Excel</button></div>
      </header>
      {!operations.available ? <EmptyState title="لوحة المخزون تحتاج حقولًا إضافية" description={operations.note} /> : <>
        <div className="grid gap-3 sm:grid-cols-3"><Metric label="أصناف قرب الانتهاء" value={operations.nearExpiry.length} note="تنتهي خلال 90 يومًا أو أقل" tone="rose" /><Metric label="رصيد عند حد الطلب" value={operations.lowStock.length} note="الرصيد عند أو دون الحد المسجل" tone="amber" /><Metric label="طلبات مقترحة" value={operations.suggestions.length} note="كميات محسوبة من الحد أو مبيعات الفترة" tone="green" /></div>
        <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
          <section className="panel-shadow overflow-hidden rounded-2xl border border-[#e4d7cd] bg-[#fcfcf8]"><div className="border-b border-[#eee3db] px-5 py-5"><div className="flex items-center gap-2"><Clock3 className="size-4 text-[#ba5d49]" /><div><p className="font-bold text-[#274d43]">تنبيهات الانتهاء والمخزون</p><p className="mt-1 text-[11px] text-[#758880]">ترتيب حسب أقرب تاريخ انتهاء ثم أولوية الرصيد.</p></div></div></div><div className="scrollbar-thin max-h-[430px] divide-y divide-[#edf1ed] overflow-auto">{alerts.map((item) => <AlertRow key={`${item.status}-${item.id}`} item={item} />)}{alerts.length === 0 && <div className="p-6"><EmptyState title="لا توجد تنبيهات من الحقول المتاحة" description="لم نجد تاريخ انتهاء قريبًا أو رصيدًا عند حد إعادة الطلب ضمن الملف الحالي." /></div>}</div></section>
          <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="border-b border-[#e6eee9] px-5 py-5"><div className="flex items-center gap-2"><PackagePlus className="size-4 text-[#0a6d59]" /><div><p className="font-bold text-[#274d43]">قائمة الطلب المقترحة</p><p className="mt-1 text-[11px] text-[#758880]">اقتراح كمية، لا أمر شراء. راجع المورد والحدود قبل الاعتماد.</p></div></div></div><div className="scrollbar-thin max-h-[430px] divide-y divide-[#edf1ed] overflow-auto">{operations.suggestions.slice(0, 12).map((item) => <SuggestionRow key={item.id} item={item} maxSuggested={maxSuggested} />)}{operations.suggestions.length === 0 && <div className="p-6"><EmptyState title="لا توجد كمية طلب مؤكدة" description="تحتاج القائمة إلى رصيد المخزون مع حد إعادة الطلب أو كمية مبيعات في الملف." /></div>}</div></section>
        </div>
        <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e6eee9] px-5 py-5"><div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#0a6d59]" /><p className="font-bold text-[#274d43]">قواعد إعادة الطلب لكل صنف</p></div><p className="mt-1 text-[11px] leading-5 text-[#758880]">القاعدة المخصصة تُقدَّم على حد الملف لهذا المتصفح فقط؛ يمكن إزالتها في أي وقت. للاستيراد الجماعي، استخدم ملف التصدير نفسه أو أعمدة «معرّف الصنف» و«حد إعادة الطلب».</p></div><span className="rounded-lg border border-[#cae3d8] bg-[#eff8f3] px-2.5 py-1.5 text-[10px] font-bold text-[#287059]">{formatNumber(Object.keys(rules).length)} قاعدة مفعلة</span></div>{notice && <div className="border-b border-[#dcece3] bg-[#f4faf6] px-5 py-3 text-[11px] font-semibold text-[#287059]">{notice}</div>}{error && <div className="border-b border-[#f0d9d0] bg-[#fff7f4] px-5 py-3 text-[11px] font-semibold text-[#a04e40]">{error}</div>}<div className="scrollbar-thin max-h-[390px] divide-y divide-[#edf1ed] overflow-auto">{operations.items.map((item) => <RuleRow key={item.id} item={item} hasCustom={Boolean(rules[item.id])} onEdit={() => openRule(item)} onRemove={() => clearRule(item)} />)}{operations.items.length === 0 && <div className="p-6"><EmptyState title="لا توجد أصناف قابلة للتخصيص" description="أضف اسم الصنف ورصيد المخزون إلى الملف ثم أعد القراءة." /></div>}</div></section>
      </>}
    </div>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent className="border-[#d9e7df] bg-[#fcfcf8] text-right" dir="rtl"><DialogHeader className="text-right"><DialogTitle className="display-font text-xl text-[#183f38]">قاعدة إعادة طلب مخصصة</DialogTitle><DialogDescription className="mt-2 text-xs leading-6 text-[#6e827a]">{editing?.itemName} — تُحفظ هذه القاعدة على هذا المتصفح وتُستخدم فوق الحد الوارد من الملف.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="text-xs font-bold text-[#31574d]">حد إعادة الطلب<input autoFocus inputMode="numeric" type="number" min="0" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 py-2.5 text-sm text-[#183f38] outline-none focus:border-[#0b6b5b]" /></label><label className="text-xs font-bold text-[#31574d]">رصيد الهدف <span className="font-normal text-[#81928b]">اختياري</span><input inputMode="numeric" type="number" min="0" value={targetStock} onChange={(event) => setTargetStock(event.target.value)} placeholder="يُحسب تلقائيًا من الحد والمبيعات" className="mt-2 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 py-2.5 text-sm text-[#183f38] outline-none focus:border-[#0b6b5b]" /></label></div>{error && <p className="rounded-lg bg-[#fff0ec] px-3 py-2 text-xs font-semibold text-[#a04e40]">{error}</p>}<p className="text-[10px] leading-5 text-[#74867e]">عند ترك رصيد الهدف فارغًا، يحسب النظام هدفه من ضعف الحد أو مبيعات الفترة المتاحة، أيهما أعلى.</p><DialogFooter className="gap-2 sm:justify-start"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-[#d7e5de] bg-white px-4 py-2.5 text-xs font-bold text-[#55736a]">إلغاء</button><button type="button" onClick={saveRule} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c]">حفظ القاعدة</button></DialogFooter></DialogContent></Dialog>
  </>;
}

function AlertRow({ item }: { item: InventoryItem }) { const meta = statusMeta(item); const Icon = meta.Icon; return <div className="flex items-start gap-3 px-5 py-4"><div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border ${meta.classes}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-bold text-[#31574d]">{item.itemName}</p><span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${meta.classes}`}>{meta.label}</span>{item.reorderSource === "custom" && <span className="rounded-md bg-[#e9f3ee] px-1.5 py-0.5 text-[9px] font-bold text-[#28705a]">قاعدة خاصة</span>}</div><p className="mt-1 text-[11px] leading-5 text-[#72857e]">{item.note}</p></div><div className="shrink-0 text-left"><p className="text-[10px] font-bold text-[#667e75]">{item.stock === undefined ? "—" : `${formatNumber(item.stock)} رصيد`}</p>{item.daysToExpiry !== undefined && <p className="mt-1 text-[10px] font-bold text-[#ad5546]">{item.daysToExpiry < 0 ? "منتهٍ" : `${formatNumber(item.daysToExpiry)} يومًا`}</p>}</div></div>; }
function SuggestionRow({ item, maxSuggested }: { item: InventoryOperations["suggestions"][number]; maxSuggested: number }) { const progress = Math.max(7, ((item.suggestedQuantity ?? 0) / maxSuggested) * 100); return <div className="px-5 py-4"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-xs font-bold text-[#31574d]">{item.itemName}</p><span className="metric-number shrink-0 rounded-lg bg-[#e9f6ef] px-2 py-1 text-xs font-bold text-[#247059]">+{formatNumber(item.suggestedQuantity ?? 0)} وحدة</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eaf0ec]"><div className="h-full rounded-full bg-[#1c8069]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[10px] leading-5 text-[#768981]">الرصيد: {formatNumber(item.currentStock ?? 0)} · الحد: {item.reorderLevel === undefined ? "غير مسجل" : formatNumber(item.reorderLevel)} · {item.reason}</p></div>; }
function RuleRow({ item, hasCustom, onEdit, onRemove }: { item: InventoryItem; hasCustom: boolean; onEdit: () => void; onRemove: () => void }) { return <div className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-[#31574d]">{item.itemName}</p>{item.itemCode && <span className="rounded bg-[#f0f5f2] px-1.5 py-0.5 text-[9px] font-bold text-[#6d8279]">{item.itemCode}</span>}{hasCustom && <span className="rounded bg-[#eaf6ef] px-1.5 py-0.5 text-[9px] font-bold text-[#23715a]">مخصص</span>}</div><p className="mt-1 text-[10px] text-[#73867f]">الرصيد: {item.stock === undefined ? "غير متاح" : formatNumber(item.stock)} · حد التحليل: {item.reorderLevel === undefined ? "غير مسجل" : formatNumber(item.reorderLevel)}{item.targetStock !== undefined ? ` · الهدف: ${formatNumber(item.targetStock)}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" onClick={onEdit} className="rounded-lg border border-[#b9d9cc] bg-white px-3 py-2 text-[10px] font-bold text-[#1d6251] hover:bg-[#eff8f3]">{hasCustom ? "تعديل القاعدة" : "تخصيص الحد"}</button>{hasCustom && <button type="button" onClick={onRemove} className="rounded-lg px-2 py-2 text-[10px] font-bold text-[#8a665d] hover:bg-[#fff3ec]">إزالة</button>}</div></div>; }

function BranchComparison({ operations }: { operations: InventoryOperations }) { const maxSales = Math.max(...operations.branches.map((branch) => branch.sales ?? 0), 1); return <div className="mx-auto max-w-[1200px] space-y-5"><header className="entry-rise flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#9a721f]"><span className="h-px w-7 bg-[#d8a345]" />قراءة موحدة عبر الملفات المتوافقة</div><h2 className="display-font text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">مقارنة أداء الفروع</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-[#6e827a]">{operations.branchNote}</p></div><div className="flex items-center gap-2 rounded-xl border border-[#c8e3d7] bg-[#eff9f3] px-3 py-2 text-xs font-bold text-[#287059]"><GitCompareArrows className="size-4" />{formatNumber(operations.branches.length)} فروع قابلة للمقارنة</div></header>{operations.branches.length < 2 ? <EmptyState title="لا توجد مقارنة فروع مكتملة بعد" description="لإظهار هذه اللوحة، استورد ملفًا يتضمن عمود «الفرع» وقيمتين مختلفتين على الأقل، مع حقول المبيعات أو الربح إن توفرت." /> : <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="hidden grid-cols-[1fr_130px_130px_120px] gap-4 border-b border-[#e7eee9] bg-[#f5f8f5] px-5 py-3 text-[10px] font-bold text-[#6c8078] sm:grid"><span>الفرع</span><span>المبيعات</span><span>الربح الإجمالي</span><span>السجلات</span></div><div className="divide-y divide-[#edf1ed]">{operations.branches.map((branch, index) => <div key={branch.branch} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_130px_130px_120px] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#eaf4ef] text-xs font-bold text-[#236c57]">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-[#31574d]">{branch.branch}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e7efea]"><div className="h-full rounded-full bg-[#197863]" style={{ width: `${Math.max(4, ((branch.sales ?? 0) / maxSales) * 100)}%` }} /></div></div></div></div><p className="metric-number text-sm font-bold text-[#1f5246]">{branch.sales === undefined ? "غير متاح" : `${formatNumber(Math.round(branch.sales))} ج.م`}</p><p className="metric-number text-sm font-bold text-[#1f5246]">{branch.grossProfit === undefined ? "غير متاح" : `${formatNumber(Math.round(branch.grossProfit))} ج.م`}</p><p className="metric-number text-sm font-bold text-[#1f5246]">{formatNumber(branch.records)}</p></div>)}</div><div className="border-t border-[#e7eee9] bg-[#f6faf7] px-5 py-4 text-[11px] leading-6 text-[#637a70]"><Building2 className="ml-1 inline size-4 text-[#197863]" />المقارنة تعرض القيم الفعلية المسجلة لكل فرع؛ «غير متاح» تعني أن الملف لم يتضمن ذلك الحقل لهذا السجل.</div></section>}</div>; }
