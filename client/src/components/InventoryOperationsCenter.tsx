/**
 * نبض العيادة التنفيذي — لوحات المخزون والفروع.
 * تعرض الأولوية والدليل المتاح، وتسمح بقواعد محلية فوق حد المصدر دون إرسال أو طلب تلقائي.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpDown, Boxes, Building2, Camera, CheckCircle2, Clock3, FileDown, FileUp, GitCompareArrows, History, PackagePlus, Search, SlidersHorizontal } from "lucide-react";
import { formatNumber } from "@/lib/pharmacyEngine";
import type { InventoryItem, InventoryOperations } from "@/lib/inventoryEngine";
import { defaultProductExplorerFilters, filterAndSortProducts, type ExplorerSort, type ProductExplorerFilters, type StockFilter } from "@/lib/productExplorer";
import type { ReorderRuleHistoryEntry, ReorderRules } from "@/lib/reorderRules";
import { captureRulesSnapshot, compareRulesSnapshots, diffKindMeta, type RulesSnapshot } from "@/lib/rulesComparison";
import type { ReorderRulesImportResult } from "@/lib/reorderRulesImport";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

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

type InventoryPanelProps = { operations: InventoryOperations; rules?: ReorderRules; history?: ReorderRuleHistoryEntry[]; onSaveRule?: (itemId: string, reorderLevel: number, targetStock?: number) => void; onRemoveRule?: (itemId: string) => void; onExport?: () => void; onImportRules?: (file: File) => Promise<ReorderRulesImportResult>; };

export function InventoryOperationsCenter({ operations, mode, rules = {}, history = [], onSaveRule, onRemoveRule, onExport, onImportRules, onExportAudit }: InventoryPanelProps & { mode: "inventory" | "branches"; onExportAudit?: () => void }) {
  return mode === "branches" ? <BranchComparison operations={operations} /> : <InventoryDashboard operations={operations} rules={rules} history={history} onSaveRule={onSaveRule} onRemoveRule={onRemoveRule} onExport={onExport} onImportRules={onImportRules} onExportAudit={onExportAudit} />;
}

function InventoryDashboard({ operations, rules = {}, history = [], onSaveRule, onRemoveRule, onExport, onImportRules, onExportAudit }: InventoryPanelProps & { onExportAudit?: () => void }) {
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [reorderLevel, setReorderLevel] = useState("");
  const [targetStock, setTargetStock] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [orderApprovalOpen, setOrderApprovalOpen] = useState(false);
  const ruleFileInput = useRef<HTMLInputElement>(null);
  const maxSuggested = Math.max(...operations.suggestions.map((item) => item.suggestedQuantity ?? 0), 1);
  const alerts = [...operations.nearExpiry, ...operations.lowStock].slice(0, 14);
  const zeroBalanceItems = operations.items.filter((item) => item.stock === 0);
  const authenticatedUser = trpc.auth.me.useQuery(undefined, { retry: false });
  const persistentWorkspaces = trpc.workspace.list.useQuery(undefined, { enabled: Boolean(authenticatedUser.data), retry: false });
  const activePersistentWorkspace = persistentWorkspaces.data?.[0];
  const savePersistentOrder = trpc.orders.saveApproved.useMutation({
    onSuccess: () => { setNotice("حُفظ الطلب المعتمد في مساحة العمل. لم يُرسل طلب إلى مورد ولم تُخصم كميات تلقائيًا."); setOrderApprovalOpen(false); },
    onError: () => setError("تعذر حفظ الطلب الدائم. بقيت قائمة الاقتراحات محلية ولم يُرسل أي طلب."),
  });

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

  const approveSuggestedOrder = () => {
    if (!activePersistentWorkspace) return;
    const lines = operations.suggestions.filter((item) => (item.suggestedQuantity ?? 0) > 0).map((item) => ({ ...(item.itemCode ? { productCode: item.itemCode } : {}), productName: item.itemName, requestedQuantity: (item.suggestedQuantity ?? 0).toFixed(3), unitLabel: "وحدة" }));
    if (!lines.length) { setError("لا توجد كميات موجبة لاعتماد طلب دائم."); return; }
    savePersistentOrder.mutate({ workspaceId: activePersistentWorkspace.workspaceId, reference: `اقتراح ${new Date().toLocaleDateString("en-CA")}`, lines });
  };

  return <>
    <div className="mx-auto max-w-[1350px] space-y-5">
      <header className="entry-rise flex flex-wrap items-end justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#9a721f]"><span className="h-px w-7 bg-[#d8a345]" />حركة تشغيلية مبنية على بياناتك</div><h2 className="display-font text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">المخزون والطلبات المقترحة</h2><p className="mt-1 max-w-3xl text-xs leading-6 text-[#6e827a]">{operations.note}</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-[#c9e4d8] bg-[#eff9f3] px-3 py-2 text-[10px] font-bold text-[#287159]">تحليل محلي · لا إرسال تلقائي للطلبات</span>{activePersistentWorkspace && operations.suggestions.length > 0 && <button type="button" onClick={() => setOrderApprovalOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-[#e2c478] bg-[#fff8e8] px-3.5 py-2.5 text-[11px] font-bold text-[#795a17] transition hover:bg-[#fff1cf]"><CheckCircle2 className="size-4" />اعتماد الطلب بعد المراجعة</button>}<input ref={ruleFileInput} onChange={(event) => { void importRules(event.target.files?.[0]); event.target.value = ""; }} type="file" accept=".xlsx,.xls,.csv" className="hidden" /><button type="button" onClick={() => ruleFileInput.current?.click()} disabled={!operations.available || importing} className="inline-flex items-center gap-2 rounded-xl border border-[#b7d8cb] bg-white px-3.5 py-2.5 text-[11px] font-bold text-[#1d6251] transition hover:bg-[#eff8f3] disabled:cursor-not-allowed disabled:opacity-50"><FileUp className="size-4 text-[#0a6d59]" />{importing ? "نراجع القواعد…" : "استيراد قواعد"}</button><button type="button" onClick={onExport} disabled={!operations.available} className="inline-flex items-center gap-2 rounded-xl bg-[#123c37] px-3.5 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#17564c] disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownToLine className="size-4 text-[#d8a345]" />تصدير Excel</button></div>
      </header>
      {!operations.available ? <EmptyState title="لوحة المخزون تحتاج حقولًا إضافية" description={operations.note} /> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="أصناف رصيدها صفر" value={zeroBalanceItems.length} note="يمكن فحص كل الأصناف من المستكشف أدناه" tone="rose" /><Metric label="أصناف قرب الانتهاء" value={operations.nearExpiry.length} note="تنتهي خلال 90 يومًا أو أقل" tone="rose" /><Metric label="رصيد عند حد الطلب" value={operations.lowStock.length} note="الرصيد عند أو دون الحد المسجل" tone="amber" /><Metric label="طلبات مقترحة" value={operations.suggestions.length} note="كميات محسوبة من الحد أو مبيعات الفترة" tone="green" /></div>
        <ProductExplorerExportButton />
        <ProductExplorer operations={operations} />
        <div className="grid gap-5 xl:grid-cols-[1.06fr_.94fr]">
          <section className="panel-shadow overflow-hidden rounded-2xl border border-[#e4d7cd] bg-[#fcfcf8]"><div className="border-b border-[#eee3db] px-5 py-5"><div className="flex items-center gap-2"><Clock3 className="size-4 text-[#ba5d49]" /><div><p className="font-bold text-[#274d43]">تنبيهات الانتهاء والمخزون</p><p className="mt-1 text-[11px] text-[#758880]">ترتيب حسب أقرب تاريخ انتهاء ثم أولوية الرصيد.</p></div></div></div><div className="scrollbar-thin max-h-[430px] divide-y divide-[#edf1ed] overflow-auto">{alerts.map((item) => <AlertRow key={`${item.status}-${item.id}`} item={item} />)}{alerts.length === 0 && <div className="p-6"><EmptyState title="لا توجد تنبيهات من الحقول المتاحة" description="لم نجد تاريخ انتهاء قريبًا أو رصيدًا عند حد إعادة الطلب ضمن الملف الحالي." /></div>}</div></section>
          <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="border-b border-[#e6eee9] px-5 py-5"><div className="flex items-center gap-2"><PackagePlus className="size-4 text-[#0a6d59]" /><div><p className="font-bold text-[#274d43]">قائمة الطلب المقترحة</p><p className="mt-1 text-[11px] text-[#758880]">اقتراح كمية، لا أمر شراء. راجع المورد والحدود قبل الاعتماد.</p></div></div></div><div className="scrollbar-thin max-h-[430px] divide-y divide-[#edf1ed] overflow-auto">{operations.suggestions.slice(0, 12).map((item) => <SuggestionRow key={item.id} item={item} maxSuggested={maxSuggested} />)}{operations.suggestions.length === 0 && <div className="p-6"><EmptyState title="لا توجد كمية طلب مؤكدة" description="تحتاج القائمة إلى رصيد المخزون مع حد إعادة الطلب أو كمية مبيعات في الملف." /></div>}</div></section>
        </div>
        <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e6eee9] px-5 py-5"><div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-[#0a6d59]" /><p className="font-bold text-[#274d43]">قواعد إعادة الطلب لكل صنف</p></div><p className="mt-1 text-[11px] leading-5 text-[#758880]">القاعدة المخصصة تُقدَّم على حد الملف لهذا المتصفح فقط؛ يمكن إزالتها في أي وقت. للاستيراد الجماعي، استخدم ملف التصدير نفسه أو أعمدة «معرّف الصنف» و«حد إعادة الطلب».</p></div><span className="rounded-lg border border-[#cae3d8] bg-[#eff8f3] px-2.5 py-1.5 text-[10px] font-bold text-[#287059]">{formatNumber(Object.keys(rules).length)} قاعدة مفعلة</span></div>{notice && <div className="border-b border-[#dcece3] bg-[#f4faf6] px-5 py-3 text-[11px] font-semibold text-[#287059]">{notice}</div>}{error && <div className="border-b border-[#f0d9d0] bg-[#fff7f4] px-5 py-3 text-[11px] font-semibold text-[#a04e40]">{error}</div>}<div className="scrollbar-thin max-h-[390px] divide-y divide-[#edf1ed] overflow-auto">{operations.items.map((item) => <RuleRow key={item.id} item={item} hasCustom={Boolean(rules[item.id])} onEdit={() => openRule(item)} onRemove={() => clearRule(item)} />)}{operations.items.length === 0 && <div className="p-6"><EmptyState title="لا توجد أصناف قابلة للتخصيص" description="أضف اسم الصنف ورصيد المخزون إلى الملف ثم أعد القراءة." /></div>}</div></section>
        <RulesComparePanel currentRules={rules} onExportAudit={onExportAudit} />
        <RuleHistoryPanel history={history} />
      </>}
    </div>
    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}><DialogContent className="border-[#d9e7df] bg-[#fcfcf8] text-right" dir="rtl"><DialogHeader className="text-right"><DialogTitle className="display-font text-xl text-[#183f38]">قاعدة إعادة طلب مخصصة</DialogTitle><DialogDescription className="mt-2 text-xs leading-6 text-[#6e827a]">{editing?.itemName} — تُحفظ هذه القاعدة على هذا المتصفح وتُستخدم فوق الحد الوارد من الملف.</DialogDescription></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><label className="text-xs font-bold text-[#31574d]">حد إعادة الطلب<input autoFocus inputMode="numeric" type="number" min="0" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} className="mt-2 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 py-2.5 text-sm text-[#183f38] outline-none focus:border-[#0b6b5b]" /></label><label className="text-xs font-bold text-[#31574d]">رصيد الهدف <span className="font-normal text-[#81928b]">اختياري</span><input inputMode="numeric" type="number" min="0" value={targetStock} onChange={(event) => setTargetStock(event.target.value)} placeholder="يُحسب تلقائيًا من الحد والمبيعات" className="mt-2 w-full rounded-xl border border-[#cfe0d8] bg-white px-3 py-2.5 text-sm text-[#183f38] outline-none focus:border-[#0b6b5b]" /></label></div>{error && <p className="rounded-lg bg-[#fff0ec] px-3 py-2 text-xs font-semibold text-[#a04e40]">{error}</p>}<p className="text-[10px] leading-5 text-[#74867e]">عند ترك رصيد الهدف فارغًا، يحسب النظام هدفه من ضعف الحد أو مبيعات الفترة المتاحة، أيهما أعلى.</p><DialogFooter className="gap-2 sm:justify-start"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-[#d7e5de] bg-white px-4 py-2.5 text-xs font-bold text-[#55736a]">إلغاء</button><button type="button" onClick={saveRule} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c]">حفظ القاعدة</button></DialogFooter></DialogContent></Dialog>
    <Dialog open={orderApprovalOpen} onOpenChange={setOrderApprovalOpen}><DialogContent className="border-[#d9e7df] bg-[#fcfcf8] text-right" dir="rtl"><DialogHeader className="text-right"><DialogTitle className="display-font text-xl text-[#183f38]">اعتماد قائمة الطلب المقترحة</DialogTitle><DialogDescription className="mt-2 text-xs leading-6 text-[#6e827a]">ستحفظ هذه الخطوة طلبًا معتمدًا من {formatNumber(operations.suggestions.filter((item) => (item.suggestedQuantity ?? 0) > 0).length)} أصناف في مساحة العمل. لا ترسل رسالة أو أمرًا إلى المورد، ولا تخصم أي فاتورة أو مخزون.</DialogDescription></DialogHeader><div className="max-h-52 divide-y divide-[#e7eee9] overflow-auto rounded-xl border border-[#e0e9e3] bg-white">{operations.suggestions.filter((item) => (item.suggestedQuantity ?? 0) > 0).slice(0, 12).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[10px]"><span className="font-bold text-[#31574d]">{item.itemName}</span><span className="font-bold text-[#26705a]">{formatNumber(item.suggestedQuantity ?? 0)} وحدة</span></div>)}</div><DialogFooter className="gap-2 sm:justify-start"><button type="button" onClick={() => setOrderApprovalOpen(false)} className="rounded-xl border border-[#d7e5de] bg-white px-4 py-2.5 text-xs font-bold text-[#55736a]">عودة للمراجعة</button><button type="button" disabled={savePersistentOrder.isPending} onClick={approveSuggestedOrder} className="rounded-xl bg-[#123c37] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#17564c] disabled:opacity-60">{savePersistentOrder.isPending ? "يجري الحفظ…" : "أعتمد الطلب يدويًا"}</button></DialogFooter></DialogContent></Dialog>
  </>;
}

function explorerNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function explorerCurrency(value?: number) {
  return value === undefined ? "غير متاح" : `${formatNumber(value)} ج.م`;
}

function ProductExplorerExportButton() {
  return <div className="flex justify-end"><button type="button" onClick={() => window.dispatchEvent(new Event("pharmacy:export-product-explorer"))} className="inline-flex items-center gap-2 rounded-xl border border-[#b7d8cb] bg-white px-3.5 py-2.5 text-[11px] font-bold text-[#1d6251] transition hover:bg-[#eff8f3]"><FileDown className="size-4 text-[#0a6d59]" />تصدير نتائج المستكشف الحالية</button></div>;
}

function ProductExplorer({ operations }: { operations: InventoryOperations }) {
  const [filters, setFilters] = useState<ProductExplorerFilters>(defaultProductExplorerFilters);
  const rows = useMemo(() => filterAndSortProducts(operations.items, filters), [operations.items, filters]);
  const zeroRows = operations.items.filter((item) => item.stock === 0);
  const zeroSalesValue = zeroRows.reduce((total, item) => total + (item.sales ?? 0), 0);
  const zeroSalesAvailable = zeroRows.some((item) => item.sales !== undefined);
  const patch = (next: Partial<ProductExplorerFilters>) => setFilters((current) => ({ ...current, ...next }));

  useEffect(() => {
    const exportCurrentRows = () => {
      if (!rows.length) return;
      void import("@/lib/inventoryExport").then(({ exportProductExplorerWorkbook }) => exportProductExplorerWorkbook(rows, filters));
    };
    window.addEventListener("pharmacy:export-product-explorer", exportCurrentRows);
    return () => window.removeEventListener("pharmacy:export-product-explorer", exportCurrentRows);
  }, [filters, rows]);

  return <section className="panel-shadow overflow-hidden rounded-2xl border border-[#cfe3d8] bg-[#fcfdfb]"><div className="border-b border-[#e4eee8] bg-[linear-gradient(115deg,#f0faf4,#fdfcf8)] px-5 py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[#dff2e8] text-[#156650]"><Search className="size-4" /></div><div><h3 className="font-bold text-[#214b41]">مستكشف الأصناف الكامل</h3><p className="mt-1 max-w-3xl text-[11px] leading-5 text-[#6e827a]">يعرض جميع النتائج المطابقة دون سقف عرض. سعر البيع المحسوب يستخرج من «إجمالي البيع ÷ كمية الصرف» عند توفرهما؛ التكلفة والربح لا يظهران بلا سعر شراء مصدر.</p></div></div><button type="button" onClick={() => setFilters(defaultProductExplorerFilters)} className="rounded-lg border border-[#bfdacc] bg-white px-3 py-2 text-[10px] font-bold text-[#276a56] hover:bg-[#eff8f3]">إعادة ضبط الفلاتر</button></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6"><label className="relative block lg:col-span-2"><Search className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[#688178]" /><input value={filters.query} onChange={(event) => patch({ query: event.target.value })} placeholder="اسم الصنف أو الكود أو الشركة" className="min-h-10 w-full rounded-xl border border-[#cfdfd7] bg-white py-2 pr-9 pl-3 text-[10px] font-bold text-[#244d44] outline-none focus:border-[#168369]" /></label><select value={filters.stock} onChange={(event) => patch({ stock: event.target.value as StockFilter })} className="min-h-10 rounded-xl border border-[#cfdfd7] bg-white px-3 text-[10px] font-bold text-[#244d44] outline-none focus:border-[#168369]"><option value="all">كل الأرصدة</option><option value="zero">رصيد صفري</option><option value="positive">رصيد موجب</option><option value="unknown">رصيد غير متاح</option></select><select value={filters.sort} onChange={(event) => patch({ sort: event.target.value as ExplorerSort })} className="min-h-10 rounded-xl border border-[#cfdfd7] bg-white px-3 text-[10px] font-bold text-[#244d44] outline-none focus:border-[#168369]"><option value="priority">أولوية المراجعة</option><option value="salesQuantity">كمية الصرف</option><option value="stock">الرصيد</option><option value="salePrice">سعر البيع المحسوب</option><option value="cost">سعر الشراء</option><option value="margin">الهامش</option><option value="stockValue">قيمة الرصيد بسعر البيع</option><option value="name">اسم الصنف</option></select><button type="button" onClick={() => patch({ descending: !filters.descending })} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[#cfdfd7] bg-white px-3 text-[10px] font-bold text-[#276a56] hover:bg-[#eff8f3]"><ArrowUpDown className="size-3.5" />{filters.descending ? "تنازلي" : "تصاعدي"}</button></div><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><NumberFilter label="سعر البيع المحسوب من" onChange={(value) => patch({ minSalePrice: value })} /><NumberFilter label="سعر البيع المحسوب إلى" onChange={(value) => patch({ maxSalePrice: value })} /><NumberFilter label="سعر الشراء من" onChange={(value) => patch({ minCost: value })} /><NumberFilter label="هامش الربح % من" onChange={(value) => patch({ minMargin: value })} /><NumberFilter label="كمية الصرف من" onChange={(value) => patch({ minSalesQuantity: value })} /></div></div><div className="grid gap-2 border-b border-[#e4eee8] bg-[#f7fbf8] px-5 py-3 sm:grid-cols-3"><div className="rounded-xl border border-[#d3e8dc] bg-white px-3 py-2"><p className="text-[9px] font-bold text-[#71877e]">أصناف رصيدها صفر</p><p className="metric-number mt-1 text-lg font-bold text-[#a25343]">{formatNumber(zeroRows.length)}</p></div><div className="rounded-xl border border-[#d3e8dc] bg-white px-3 py-2"><p className="text-[9px] font-bold text-[#71877e]">إجمالي البيع المسجل للأصناف الصفرية</p><p className="metric-number mt-1 text-sm font-bold text-[#275f51]">{zeroSalesAvailable ? explorerCurrency(zeroSalesValue) : "غير متاح"}</p></div><div className="rounded-xl border border-[#d3e8dc] bg-white px-3 py-2"><p className="text-[9px] font-bold text-[#71877e]">سعر الشراء والربح</p><p className="mt-1 text-[10px] font-bold text-[#7d6b43]">غير متاحين بلا عمود سعر شراء</p></div></div><div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[10px] text-[#617a70]"><span>يعرض الآن <b className="text-[#1f604f]">{formatNumber(rows.length)}</b> من أصل {formatNumber(operations.items.length)} صنفًا.</span><span>القيم غير المتاحة تعني أن العمود غير موجود أو لم يُعتمد، وليست صفرًا.</span></div><div className="scrollbar-thin max-h-[650px] overflow-auto border-t border-[#e8efea]"><table className="min-w-[1220px] w-full text-right"><thead className="sticky top-0 bg-[#f3f8f4] text-[9px] text-[#647d73]"><tr><th className="px-4 py-3 font-bold">الصنف / الكود</th><th className="px-3 py-3 font-bold">الرصيد</th><th className="px-3 py-3 font-bold">سعر البيع المحسوب</th><th className="px-3 py-3 font-bold">سعر الشراء</th><th className="px-3 py-3 font-bold">قيمة الرصيد</th><th className="px-3 py-3 font-bold">كمية الصرف</th><th className="px-3 py-3 font-bold">إجمالي البيع</th><th className="px-3 py-3 font-bold">الربح / الهامش</th><th className="px-3 py-3 font-bold">القرار</th></tr></thead><tbody className="divide-y divide-[#edf2ee]">{rows.map((item) => <tr key={item.id} className={item.stock === 0 ? "bg-[#fffaf4]" : "bg-white hover:bg-[#fbfdfb]"}><td className="max-w-[260px] px-4 py-3"><p className="truncate text-[11px] font-bold text-[#254d42]">{item.itemName}</p><p className="mt-1 text-[9px] text-[#73877f]">{item.itemCode ?? "بلا كود"}{item.company ? ` · ${item.company}` : ""}</p></td><td className={`px-3 py-3 text-[11px] font-bold ${item.stock === 0 ? "text-[#a25343]" : "text-[#365d52]"}`}>{item.stock === undefined ? "غير متاح" : formatNumber(item.stock)}</td><td className="px-3 py-3 text-[10px] text-[#365d52]">{explorerCurrency(item.unitSalePrice)}</td><td className="px-3 py-3 text-[10px] text-[#365d52]">{explorerCurrency(item.unitCost)}</td><td className="px-3 py-3 text-[10px] text-[#365d52]"><p>{explorerCurrency(item.stockSaleValue)}</p><p className="mt-1 text-[9px] text-[#83928d]">تكلفة: {explorerCurrency(item.stockCostValue)}</p></td><td className="px-3 py-3 text-[10px] font-bold text-[#365d52]">{item.salesQuantity === undefined ? "غير متاح" : formatNumber(item.salesQuantity)}</td><td className="px-3 py-3 text-[10px] text-[#365d52]">{explorerCurrency(item.sales)}</td><td className="px-3 py-3 text-[10px] text-[#365d52]"><p>{explorerCurrency(item.profit)}</p><p className="mt-1 text-[9px] text-[#83928d]">{item.profitMargin === undefined ? "هامش غير متاح" : `${formatNumber(item.profitMargin)}%`}</p></td><td className="min-w-[190px] px-3 py-3"><p className="text-[10px] leading-5 text-[#607970]">{item.note}</p>{item.stock === 0 && <span className="mt-1 inline-block rounded-md bg-[#fff0e9] px-1.5 py-0.5 text-[8px] font-bold text-[#a25343]">رصيد صفري</span>}</td></tr>)}{rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-xs text-[#70847b]">لا توجد أصناف تطابق الفلاتر الحالية. أعد ضبط الفلاتر أو راجع اعتماد خريطة الأعمدة.</td></tr>}</tbody></table></div></section>;
}

function NumberFilter({ label, onChange }: { label: string; onChange: (value: number | undefined) => void }) {
  return <label className="text-[9px] font-bold text-[#6c8178]">{label}<input type="number" min="0" inputMode="decimal" onChange={(event) => onChange(explorerNumber(event.target.value))} className="mt-1 min-h-9 w-full rounded-lg border border-[#cfdfd7] bg-white px-2 text-[10px] font-bold text-[#244d44] outline-none focus:border-[#168369]" /></label>;
}

function AlertRow({ item }: { item: InventoryItem }) { const meta = statusMeta(item); const Icon = meta.Icon; return <div className="flex items-start gap-3 px-5 py-4"><div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border ${meta.classes}`}><Icon className="size-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-bold text-[#31574d]">{item.itemName}</p><span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${meta.classes}`}>{meta.label}</span>{item.reorderSource === "custom" && <span className="rounded-md bg-[#e9f3ee] px-1.5 py-0.5 text-[9px] font-bold text-[#28705a]">قاعدة خاصة</span>}</div><p className="mt-1 text-[11px] leading-5 text-[#72857e]">{item.note}</p></div><div className="shrink-0 text-left"><p className="text-[10px] font-bold text-[#667e75]">{item.stock === undefined ? "—" : `${formatNumber(item.stock)} رصيد`}</p>{item.daysToExpiry !== undefined && <p className="mt-1 text-[10px] font-bold text-[#ad5546]">{item.daysToExpiry < 0 ? "منتهٍ" : `${formatNumber(item.daysToExpiry)} يومًا`}</p>}</div></div>; }
function SuggestionRow({ item, maxSuggested }: { item: InventoryOperations["suggestions"][number]; maxSuggested: number }) { const progress = Math.max(7, ((item.suggestedQuantity ?? 0) / maxSuggested) * 100); return <div className="px-5 py-4"><div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate text-xs font-bold text-[#31574d]">{item.itemName}</p><span className="metric-number shrink-0 rounded-lg bg-[#e9f6ef] px-2 py-1 text-xs font-bold text-[#247059]">+{formatNumber(item.suggestedQuantity ?? 0)} وحدة</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eaf0ec]"><div className="h-full rounded-full bg-[#1c8069]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-[10px] leading-5 text-[#768981]">الرصيد: {formatNumber(item.currentStock ?? 0)} · الحد: {item.reorderLevel === undefined ? "غير مسجل" : formatNumber(item.reorderLevel)} · {item.reason}</p></div>; }
function RuleRow({ item, hasCustom, onEdit, onRemove }: { item: InventoryItem; hasCustom: boolean; onEdit: () => void; onRemove: () => void }) { return <div className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-[#31574d]">{item.itemName}</p>{item.itemCode && <span className="rounded bg-[#f0f5f2] px-1.5 py-0.5 text-[9px] font-bold text-[#6d8279]">{item.itemCode}</span>}{hasCustom && <span className="rounded bg-[#eaf6ef] px-1.5 py-0.5 text-[9px] font-bold text-[#23715a]">مخصص</span>}</div><p className="mt-1 text-[10px] text-[#73867f]">الرصيد: {item.stock === undefined ? "غير متاح" : formatNumber(item.stock)} · حد التحليل: {item.reorderLevel === undefined ? "غير مسجل" : formatNumber(item.reorderLevel)}{item.targetStock !== undefined ? ` · الهدف: ${formatNumber(item.targetStock)}` : ""}</p></div><div className="flex items-center gap-2"><button type="button" onClick={onEdit} className="rounded-lg border border-[#b9d9cc] bg-white px-3 py-2 text-[10px] font-bold text-[#1d6251] hover:bg-[#eff8f3]">{hasCustom ? "تعديل القاعدة" : "تخصيص الحد"}</button>{hasCustom && <button type="button" onClick={onRemove} className="rounded-lg px-2 py-2 text-[10px] font-bold text-[#8a665d] hover:bg-[#fff3ec]">إزالة</button>}</div></div>; }

/**
 * لوحة مقارنة نسختين من قواعد إعادة الطلب.
 * لقطة مرجعية تُثبَّت يدويًا، ثم تتتبع الفروق الفورية (جديد / معدّل / مُزال).
 */
function RulesComparePanel({ currentRules, onExportAudit }: { currentRules: ReorderRules; onExportAudit?: () => void }) {
  const [previous, setPrevious] = useState<RulesSnapshot | null>(null);
  const [takenAt, setTakenAt] = useState("");
  const comparison = previous ? compareRulesSnapshots(previous, captureRulesSnapshot(currentRules)) : null;
  const changed = comparison ? comparison.rows.filter((row) => row.kind !== "unchanged") : [];

  const capture = () => {
    setPrevious(captureRulesSnapshot(currentRules));
    setTakenAt(new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }));
  };
  const clear = () => { setPrevious(null); setTakenAt(""); };

  const kindBadge = (kind: "added" | "changed" | "removed" | "unchanged") => {
    const tone = diffKindMeta[kind].tone;
    if (tone === "green") return "bg-[#e8f5ef] text-[#27705b]";
    if (tone === "amber") return "bg-[#fff5df] text-[#93610c]";
    return "bg-[#f5eeee] text-[#8c5b53]";
  };

  return <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e6eee9] px-5 py-5"><div><div className="flex items-center gap-2"><Camera className="size-4 text-[#0a6d59]" /><p className="font-bold text-[#274d43]">مقارنة نسختين من القواعد</p></div><p className="mt-1 text-[11px] leading-5 text-[#758880]">التقط لقطة حالية قبل تعديل القواعد أو استيراد ملف جديد، ثم راجع الفروق بصريًا بين اللقطة والحالة الحالية.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={capture} className="inline-flex items-center gap-2 rounded-xl border border-[#b7d8cb] bg-white px-3 py-2 text-[11px] font-bold text-[#1d6251] transition hover:bg-[#eff8f3]">{previous ? "تحديث اللقطة" : "التقط لقطة"}</button><button type="button" onClick={onExportAudit} className="inline-flex items-center gap-2 rounded-xl border border-[#b7d8cb] bg-white px-3 py-2 text-[11px] font-bold text-[#1d6251] transition hover:bg-[#eff8f3]"><FileDown className="size-4 text-[#0a6d59]" />تصدير سجل التدقيق</button></div></div>
    {!previous || !comparison ? <div className="px-5 py-5 text-center text-[11px] leading-6 text-[#74867e]">اضغط «التقط لقطة» لتثبيت الحالة الحالية، وأي تعديل لاحق على القواعد سيظهر هنا كفرق فوري حتى تعيد اللقطة.</div> : <>
      <div className="grid gap-3 border-b border-[#e6eee9] bg-[#f6faf7] px-5 py-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#cce4d8] bg-white px-3 py-2.5 text-center"><p className="text-[10px] font-bold text-[#7a8d85]">قاعدة جديدة</p><p className="metric-number mt-1 text-lg font-bold text-[#207059]">{formatNumber(comparison.summary.added)}</p></div>
        <div className="rounded-xl border border-[#f0dfaf] bg-white px-3 py-2.5 text-center"><p className="text-[10px] font-bold text-[#8c7a45]">قاعدة معدّلة</p><p className="metric-number mt-1 text-lg font-bold text-[#95620d]">{formatNumber(comparison.summary.changed)}</p></div>
        <div className="rounded-xl border border-[#f0d9d0] bg-white px-3 py-2.5 text-center"><p className="text-[10px] font-bold text-[#8c5b53]">قاعدة أُزيلت</p><p className="metric-number mt-1 text-lg font-bold text-[#a04e40]">{formatNumber(comparison.summary.removed)}</p></div>
        <div className="rounded-xl border border-[#dce5e0] bg-white px-3 py-2.5 text-center"><p className="text-[10px] font-bold text-[#7a8d85]">بلا تغيير</p><p className="metric-number mt-1 text-lg font-bold text-[#547067]">{formatNumber(comparison.summary.unchanged)}</p></div>
      </div>
      <div className="scrollbar-thin max-h-[330px] divide-y divide-[#edf1ed] overflow-auto">
        {changed.length === 0 ? <div className="px-5 py-5 text-center text-[11px] leading-6 text-[#74867e]">لا فروق عن لقطة {takenAt} — القواعد مطابقة تمامًا.</div> : changed.map((row) => <div key={row.itemId} className="grid gap-3 px-5 py-3.5 sm:grid-cols-[170px_1fr_1fr] sm:items-center">
          <div className="min-w-0"><span className={`rounded-md px-2 py-1 text-[9px] font-bold ${kindBadge(row.kind)}`}>{diffKindMeta[row.kind].label}</span><p className="mt-1.5 truncate text-[11px] font-bold text-[#31574d]" dir="ltr">{row.itemId}</p></div>
          <div className={`rounded-lg border px-3 py-2 text-right text-[10px] ${row.previous ? "border-[#f0d9d0] bg-[#fdf6f4]" : "border-dashed border-[#e0e8e3] bg-[#f6f9f7]"}`}><p className="mb-1 text-[9px] font-bold text-[#8c5b53]">قبل اللقطة</p><p className="font-bold text-[#6d524b]">{row.previous ? <>حد {formatNumber(row.previous.reorderLevel)}{row.previous.targetStock !== undefined ? ` · هدف ${formatNumber(row.previous.targetStock)}` : ""}</> : "لا قاعدة سابقة"}</p></div>
          <div className={`rounded-lg border px-3 py-2 text-right text-[10px] ${row.current ? "border-[#cde6d9] bg-[#f4faf6]" : "border-dashed border-[#e0e8e3] bg-[#f6f9f7]"}`}><p className="mb-1 text-[9px] font-bold text-[#207059]">الحالة الحالية</p><p className="font-bold text-[#3b6659]">{row.current ? <>حد {formatNumber(row.current.reorderLevel)}{row.current.targetStock !== undefined ? ` · هدف ${formatNumber(row.current.targetStock)}` : ""}</> : "لا قاعدة حاليًا"}</p></div>
        </div>)}
      </div>
    </>}
    {previous && <div className="flex items-center justify-between border-t border-[#e6eee9] bg-[#f5f8f5] px-5 py-3"><p className="text-[10px] text-[#6c8078]">لقطة مرجعية مثبّتة بتاريخ {takenAt || "الآن"}</p><button type="button" onClick={clear} className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-[#8a665d] hover:bg-[#fff3ec]">إغلاق المقارنة</button></div>}
  </section>;
}

function RuleHistoryPanel({ history }: { history: ReorderRuleHistoryEntry[] }) { const action = { created: "إضافة", updated: "تعديل", removed: "إزالة", imported: "استيراد", restored: "استعادة" } as const; return <section className="panel-shadow overflow-hidden rounded-2xl border border-[#dae7e0] bg-[#fcfcf8]"><div className="flex items-center justify-between border-b border-[#e6eee9] px-5 py-4"><div className="flex items-center gap-2"><History className="size-4 text-[#a27620]" /><div><p className="text-xs font-bold text-[#274d43]">سجل تغييرات قواعد إعادة الطلب</p><p className="mt-1 text-[10px] text-[#758880]">آخر التعديلات والاستيراد والاستعادة على هذا المتصفح.</p></div></div><span className="rounded-md bg-[#f8f1df] px-2 py-1 text-[9px] font-bold text-[#8c6618]">{formatNumber(history.length)} حدث</span></div><div className="scrollbar-thin max-h-64 divide-y divide-[#edf1ed] overflow-auto">{history.slice(0, 12).map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"><div className="min-w-[160px]"><p className="text-[11px] font-bold text-[#31574d]">{action[entry.action]} قاعدة: <span dir="ltr">{entry.itemId}</span></p><p className="mt-1 text-[10px] text-[#74867e]">{entry.source} · {new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.at))}</p></div><p className="rounded-md bg-[#f2f6f3] px-2 py-1 text-[9px] font-bold text-[#547067]">{entry.after ? `الحد ${formatNumber(entry.after.reorderLevel)}${entry.after.targetStock !== undefined ? ` · الهدف ${formatNumber(entry.after.targetStock)}` : ""}` : "أُزيلت القاعدة"}</p></div>)}{history.length === 0 && <div className="p-5 text-center text-[11px] leading-6 text-[#74867e]">سيظهر هنا كل تعديل يدوي أو استيراد Excel أو استعادة نسخة محلية بعد حدوثه.</div>}</div></section>; }

function BranchComparison({ operations }: { operations: InventoryOperations }) { const maxSales = Math.max(...operations.branches.map((branch) => branch.sales ?? 0), 1); return <div className="mx-auto max-w-[1200px] space-y-5"><header className="entry-rise flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-wide text-[#9a721f]"><span className="h-px w-7 bg-[#d8a345]" />قراءة موحدة عبر الملفات المتوافقة</div><h2 className="display-font text-[28px] font-semibold tracking-[-.035em] text-[#173f38]">مقارنة أداء الفروع</h2><p className="mt-1 max-w-2xl text-xs leading-6 text-[#6e827a]">{operations.branchNote}</p></div><div className="flex items-center gap-2 rounded-xl border border-[#c8e3d7] bg-[#eff9f3] px-3 py-2 text-xs font-bold text-[#287059]"><GitCompareArrows className="size-4" />{formatNumber(operations.branches.length)} فروع قابلة للمقارنة</div></header>{operations.branches.length < 2 ? <EmptyState title="لا توجد مقارنة فروع مكتملة بعد" description="لإظهار هذه اللوحة، استورد ملفًا يتضمن عمود «الفرع» وقيمتين مختلفتين على الأقل، مع حقول المبيعات أو الربح إن توفرت." /> : <section className="panel-shadow overflow-hidden rounded-2xl border border-[#d9e7df] bg-[#fcfcf8]"><div className="hidden grid-cols-[1fr_130px_130px_120px] gap-4 border-b border-[#e7eee9] bg-[#f5f8f5] px-5 py-3 text-[10px] font-bold text-[#6c8078] sm:grid"><span>الفرع</span><span>المبيعات</span><span>الربح الإجمالي</span><span>السجلات</span></div><div className="divide-y divide-[#edf1ed]">{operations.branches.map((branch, index) => <div key={branch.branch} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_130px_130px_120px] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#eaf4ef] text-xs font-bold text-[#236c57]">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-[#31574d]">{branch.branch}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e7efea]"><div className="h-full rounded-full bg-[#197863]" style={{ width: `${Math.max(4, ((branch.sales ?? 0) / maxSales) * 100)}%` }} /></div></div></div></div><p className="metric-number text-sm font-bold text-[#1f5246]">{branch.sales === undefined ? "غير متاح" : `${formatNumber(Math.round(branch.sales))} ج.م`}</p><p className="metric-number text-sm font-bold text-[#1f5246]">{branch.grossProfit === undefined ? "غير متاح" : `${formatNumber(Math.round(branch.grossProfit))} ج.م`}</p><p className="metric-number text-sm font-bold text-[#1f5246]">{formatNumber(branch.records)}</p></div>)}</div><div className="border-t border-[#e7eee9] bg-[#f6faf7] px-5 py-4 text-[11px] leading-6 text-[#637a70]"><Building2 className="ml-1 inline size-4 text-[#197863]" />المقارنة تعرض القيم الفعلية المسجلة لكل فرع؛ «غير متاح» تعني أن الملف لم يتضمن ذلك الحقل لهذا السجل.</div></section>}</div>; }
