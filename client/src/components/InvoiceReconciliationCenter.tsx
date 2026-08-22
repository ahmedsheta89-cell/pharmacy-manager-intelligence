import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ClipboardCheck, FileImage, FileText, LoaderCircle, Minus, Plus, RefreshCw, ScanLine, ShieldCheck } from "lucide-react";
import type { ReorderSuggestion } from "@/lib/inventoryEngine";
import { formatNumber } from "@/lib/pharmacyEngine";
import { calculateInvoiceDeductions, loadInvoiceSettlementRecords, parseInvoiceText, reconcileInvoiceLines, saveInvoiceSettlementRecord, type InvoiceLineCandidate, type InvoiceSettlementRecord } from "@/lib/invoiceReconciliation";

type InvoiceReconciliationCenterProps = {
  openOrders: ReorderSuggestion[];
  onApplyDeductions: (deductions: Record<string, number>, record: InvoiceSettlementRecord) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

const statusMeta = {
  ready: { label: "جاهز للمراجعة", classes: "border-[#b8dec9] bg-[#eef9f2] text-[#23705a]" },
  partial: { label: "توريد جزئي", classes: "border-[#ead8a7] bg-[#fff9e9] text-[#8a6618]" },
  exceeds_open_order: { label: "أعلى من الطلب", classes: "border-[#f1c9bd] bg-[#fff2ee] text-[#9a4838]" },
  needs_review: { label: "يحتاج مراجعة", classes: "border-[#ead8a7] bg-[#fff9e9] text-[#8a6618]" },
  not_found: { label: "غير مطابق", classes: "border-[#eccdc5] bg-[#fff2ee] text-[#9a4838]" },
} as const;

function makeManualLine(index: number): InvoiceLineCandidate {
  return { id: `manual-invoice-line-${Date.now()}-${index}`, rawLine: "", itemName: "", source: "manual" };
}

export function InvoiceReconciliationCenter({ openOrders, onApplyDeductions }: InvoiceReconciliationCenterProps) {
  const [supplierName, setSupplierName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [invoiceFiles, setInvoiceFiles] = useState<string[]>([]);
  const [rawText, setRawText] = useState("");
  const [lines, setLines] = useState<InvoiceLineCandidate[]>([]);
  const [deductionInputs, setDeductionInputs] = useState<Record<string, number>>({});
  const [ocrState, setOcrState] = useState<"idle" | "reading" | "done" | "failed">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [records, setRecords] = useState(() => loadInvoiceSettlementRecords());
  const [applied, setApplied] = useState(false);

  const settlementLines = useMemo(() => reconcileInvoiceLines(lines, openOrders), [lines, openOrders]);
  const settlementSignature = settlementLines.map((line) => `${line.id}:${line.proposedDeduction ?? 0}`).join("|");
  const deductions = useMemo(() => calculateInvoiceDeductions(settlementLines, deductionInputs), [settlementLines, deductionInputs]);
  const deductionCount = Object.keys(deductions).length;
  const totalDeduction = Object.values(deductions).reduce((sum, quantity) => sum + quantity, 0);
  const reviewCount = settlementLines.filter((line) => line.status === "needs_review" || line.status === "not_found").length;

  useEffect(() => {
    setDeductionInputs((current) => {
      const next: Record<string, number> = {};
      settlementLines.forEach((line) => { next[line.id] = current[line.id] ?? line.proposedDeduction ?? 0; });
      return next;
    });
  }, [settlementSignature]);

  const parseRawText = () => {
    const parsed = parseInvoiceText(rawText);
    setLines(parsed);
    setApplied(false);
    setNotice(parsed.length ? `استخرجنا ${parsed.length} سطورًا محليًا. راجع الاسم والكود والكمية قبل الخصم المقترح.` : "لم نجد سطور أصناف قابلة للقراءة. أضفها يدويًا أو صحح نص الفاتورة.");
  };

  const readInvoiceImages = async (files: File[]) => {
    if (!files.length) return;
    setOcrState("reading");
    setOcrProgress(3);
    setNotice("يجري قراءة صور الفواتير داخل المتصفح؛ لا تُرسل الصور أو النصوص إلى خادم.");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["ara", "eng"], 1, { logger: (message) => { if (message.status === "recognizing text" && typeof message.progress === "number") setOcrProgress(Math.round(message.progress * 100)); } });
      const texts: string[] = [];
      for (const file of files) {
        const result = await worker.recognize(file);
        texts.push(result.data.text);
      }
      await worker.terminate();
      const combined = texts.join("\n");
      setInvoiceFiles(files.map((file) => file.name));
      setRawText(combined);
      const parsed = parseInvoiceText(combined);
      setLines(parsed);
      setApplied(false);
      setOcrProgress(100);
      setOcrState("done");
      setNotice(parsed.length ? `اكتملت القراءة المحلية. استخرجنا ${parsed.length} سطورًا أولية تحتاج مراجعتك قبل التسوية.` : "اكتملت القراءة لكن لم نجد سطورًا كافية. استخدم محرر البنود اليدوي أدناه.");
    } catch (error) {
      setOcrState("failed");
      setNotice(error instanceof Error ? `تعذر قراءة الصورة محليًا: ${error.message}` : "تعذر قراءة الصورة محليًا. يمكنك إدخال البنود يدويًا.");
    }
  };

  const updateLine = (id: string, patch: Partial<InvoiceLineCandidate>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch, source: "manual" } : line));
    setApplied(false);
  };

  const approveSettlement = () => {
    if (!confirmed) { setNotice("أكد أنك راجعت المطابقات والكميات قبل تطبيق الخصم على الطلبات المفتوحة."); return; }
    if (!deductionCount || totalDeduction <= 0) { setNotice("لا توجد كمية صالحة للخصم من الطلبات المفتوحة بعد."); return; }
    const record: InvoiceSettlementRecord = {
      id: `invoice-settlement-${Date.now()}`,
      supplierName: supplierName.trim() || "مورد غير مسمى",
      invoiceDate,
      settledAt: Date.now(),
      lines: settlementLines.filter((line) => (deductionInputs[line.id] ?? 0) > 0 && line.orderId).map((line) => ({ orderId: line.orderId, orderItemName: line.orderItemName, itemName: line.itemName, itemCode: line.itemCode, quantity: line.quantity, proposedDeduction: deductionInputs[line.id], remainingAfterDeduction: Math.max(0, (line.requestedQuantity ?? 0) - (deductionInputs[line.id] ?? 0)), matchMethod: line.matchMethod, matchConfidence: line.matchConfidence })),
    };
    saveInvoiceSettlementRecord(record);
    setRecords(loadInvoiceSettlementRecords());
    onApplyDeductions(deductions, record);
    setApplied(true);
    setNotice(`اعتمدت تسوية ${deductionCount} أصناف يدويًا. خُصمت الكميات من الطلبات المفتوحة في جلسة الشيت الحالية، ولم تُحفظ صور الفواتير.`);
  };

  if (!openOrders.length) return <div data-testid="invoice-reconciliation-center" className="mx-auto max-w-[1180px] rounded-3xl border border-[#ead9ad] bg-[#fffaf0] p-8 text-center"><FileImage className="mx-auto size-8 text-[#aa7b24]" /><h2 className="mt-3 text-lg font-bold text-[#315a4f]">لا توجد أصناف صفراء أو طلبات مفتوحة لتسويتها بعد</h2><p className="mx-auto mt-2 max-w-xl text-xs leading-6 text-[#758880]">افتح «الطلبات والمخزون» أولًا وتأكد من وجود رصيد وحد إعادة طلب أو مبيعات تسمح بحساب كمية طلب مقترحة. بعدها ستظهر هنا بنود الطلب المفتوح لتخصم منها كميات الفاتورة.</p></div>;

  return <div className="mx-auto max-w-[1280px] space-y-5" data-testid="invoice-reconciliation-center">
    <header className="rounded-3xl border border-[#c9e0d3] bg-gradient-to-l from-[#143f38] to-[#1d6052] p-5 text-white sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-[11px] font-bold text-[#ead79d]"><span className="h-px w-7 bg-[#e3ba54]" />تسوية محلية بموافقة المدير</div><h2 className="display-font mt-2 text-2xl font-semibold">فواتير الموردين مقابل الطلب المفتوح</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-[#d7ebe2]">ارفع صور الفواتير، راجع السطور التي قرأها المتصفح، ثم شاهد خصمًا مقترحًا من الأصناف الصفراء. لا تتغير قائمة الطلب إلا عندما تؤكد أنت القرار.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right"><p className="text-[10px] text-[#cfe5da]">طلبات مفتوحة الآن</p><p className="mt-1 text-2xl font-bold">{formatNumber(openOrders.length)}</p></div></div></header>

    <section className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]"><div className="rounded-2xl border border-[#d9e8df] bg-white p-4 sm:p-5"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf8f1] text-[#23705a]"><ScanLine className="size-4" /></div><div><h3 className="text-sm font-bold text-[#274d43]">1. قراءة الفاتورة داخل المتصفح</h3><p className="mt-1 text-[10px] leading-5 text-[#72857e]">لا نحفظ الصورة ولا نرفعها. قد يحتاج محرك القراءة في المرة الأولى إلى تنزيل بيانات لغة OCR فقط، من دون إرسال الفاتورة.</p></div></div><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#9bc5b0] bg-[#f4fbf7] px-4 py-5 text-xs font-bold text-[#2b6b59] hover:bg-[#edf8f2]"><FileImage className="size-4" />رفع صور فواتير المورد<input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => readInvoiceImages(Array.from(event.target.files ?? []))} /></label>{ocrState === "reading" && <div className="mt-3"><div className="flex justify-between text-[10px] font-bold text-[#55736a]"><span>جاري القراءة المحلية</span><span>{ocrProgress}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e7f0eb]"><div className="h-full rounded-full bg-[#218167] style={{ width: `${ocrProgress}%` }}" /></div></div>}{invoiceFiles.length > 0 && <div className="mt-3 rounded-xl bg-[#f7faf8] p-3 text-[10px] text-[#58746a]"><p className="font-bold text-[#315a4f]">صور هذه التسوية</p><p className="mt-1 leading-5">{invoiceFiles.join(" · ")}</p></div>}<textarea value={rawText} onChange={(event) => { setRawText(event.target.value); setApplied(false); }} placeholder="يمكنك لصق نص الفاتورة هنا أو تصحيح النص الذي قرأته الصورة..." className="mt-3 min-h-32 w-full rounded-xl border border-[#d7e5de] bg-[#fbfdfb] p-3 text-xs leading-6 text-[#31574d] outline-none focus:border-[#0d765e]" /><button type="button" onClick={parseRawText} className="mt-2 w-full rounded-xl border border-[#bdd9ca] bg-white px-3 py-2.5 text-xs font-bold text-[#26705a] hover:bg-[#f1faf5]"><RefreshCw className="ml-1 inline size-3.5" />تحويل النص إلى بنود قابلة للمراجعة</button></div>

      <div className="rounded-2xl border border-[#ead9ad] bg-[#fffdf7] p-4 sm:p-5"><div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff3d8] text-[#9a711c]"><ClipboardCheck className="size-4" /></div><div><h3 className="text-sm font-bold text-[#51451d]">2. أثر التسوية على الأصناف الصفراء</h3><p className="mt-1 text-[10px] leading-5 text-[#7e7043]">الكمية المقترحة لا تتجاوز الطلب المفتوح. عدّلها يدويًا عند وجود توريد جزئي أو صنف مختلف.</p></div></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="بنود الفاتورة" value={settlementLines.length} /><Metric label="مطابقات تحتاج مراجعة" value={reviewCount} tone="amber" /><Metric label="وحدات خصم مقترحة" value={totalDeduction} tone="green" /></div>{notice && <p role="status" className="mt-3 rounded-xl border border-[#d9e7df] bg-white px-3 py-2.5 text-[10px] leading-5 text-[#55736a]">{notice}</p>}<p className="mt-3 rounded-xl border border-[#d8e7de] bg-[#f4fbf7] px-3 py-3 text-[10px] leading-5 text-[#466a5e]"><ShieldCheck className="ml-1 inline size-3.5 text-[#23705a]" />لا يُطبَّق الخصم على الشيت أو قائمة الطلب إلا بعد تأكيد المدير أدناه.</p></div></section>

    <section className="overflow-hidden rounded-2xl border border-[#dce8e1] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5eee9] px-4 py-4 sm:px-5"><div><h3 className="text-sm font-bold text-[#274d43]">3. مراجعة بنود الفاتورة والمطابقة</h3><p className="mt-1 text-[10px] text-[#72857e]">صحح اسم الصنف أو كوده أو كميته. كل سطر واضح في سبب مطابقته أو عدمها.</p></div><button type="button" onClick={() => { setLines((current) => [...current, makeManualLine(current.length + 1)]); setApplied(false); }} className="rounded-lg border border-[#bdd9ca] bg-[#f5fbf7] px-3 py-2 text-[10px] font-bold text-[#26705a]"><Plus className="ml-1 inline size-3.5" />بند يدوي</button></div>{lines.length === 0 ? <div className="p-8 text-center text-xs leading-6 text-[#71857d]">ارفع صورة فاتورة أو ألصق نصها، ثم راجع البنود المستخرجة هنا.</div> : <div className="overflow-x-auto"><table className="min-w-[1050px] w-full text-right"><thead className="bg-[#f6faf7] text-[9px] font-bold text-[#647b72]"><tr><th className="px-3 py-3">بيان الفاتورة</th><th className="px-3 py-3">الكود</th><th className="px-3 py-3">الكمية</th><th className="px-3 py-3">الطلب الأصفر المطابق</th><th className="px-3 py-3">الثقة</th><th className="px-3 py-3">خصم مقترح</th><th className="px-3 py-3">المتبقي</th><th className="px-3 py-3">الحالة</th><th className="px-3 py-3" /></tr></thead><tbody className="divide-y divide-[#edf1ed]">{settlementLines.map((line) => { const meta = statusMeta[line.status]; return <tr key={line.id}><td className="px-3 py-3"><input value={line.itemName} onChange={(event) => updateLine(line.id, { itemName: event.target.value })} placeholder="اسم الصنف" className="w-44 rounded-lg border border-[#d7e5de] bg-white px-2 py-1.5 text-[10px] font-bold text-[#31574d]" /><p className="mt-1 max-w-44 truncate text-[8px] text-[#8a9a93]">{line.rawLine || "إدخال يدوي"}</p></td><td className="px-3 py-3"><input value={line.itemCode ?? ""} onChange={(event) => updateLine(line.id, { itemCode: event.target.value || undefined })} placeholder="اختياري" className="w-24 rounded-lg border border-[#d7e5de] bg-white px-2 py-1.5 text-[10px] text-[#31574d]" /></td><td className="px-3 py-3"><input type="number" min="0" value={line.quantity ?? ""} onChange={(event) => updateLine(line.id, { quantity: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="—" className="w-20 rounded-lg border border-[#d7e5de] bg-white px-2 py-1.5 text-[10px] font-bold text-[#31574d]" /></td><td className="px-3 py-3"><p className="max-w-48 text-[10px] font-bold text-[#31574d]">{line.orderItemName ?? "—"}</p><p className="mt-1 text-[9px] text-[#73867f]">طلب: {line.requestedQuantity === undefined ? "—" : formatNumber(line.requestedQuantity)}</p></td><td className="px-3 py-3"><span className="rounded-md bg-[#f1f6f3] px-2 py-1 text-[9px] font-bold text-[#466e61]">{line.matchConfidence}% · {line.matchMethod === "code" ? "كود" : line.matchMethod === "name" ? "اسم" : line.matchMethod === "similar" ? "تشابه" : "—"}</span></td><td className="px-3 py-3"><input type="number" min="0" max={line.requestedQuantity ?? 0} disabled={!line.orderId} value={deductionInputs[line.id] ?? ""} onChange={(event) => setDeductionInputs((current) => ({ ...current, [line.id]: Math.max(0, Number(event.target.value) || 0) }))} className="w-20 rounded-lg border border-[#c5dfd0] bg-[#f7fcf8] px-2 py-1.5 text-[10px] font-bold text-[#26705a] disabled:cursor-not-allowed disabled:opacity-40" /></td><td className="px-3 py-3 text-[10px] font-bold text-[#6d7d76]">{line.requestedQuantity === undefined ? "—" : formatNumber(Math.max(0, line.requestedQuantity - (deductionInputs[line.id] ?? 0)))}</td><td className="px-3 py-3"><span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${meta.classes}`}>{meta.label}</span><p className="mt-1 max-w-52 text-[8px] leading-4 text-[#73867f]">{line.reason}</p></td><td className="px-3 py-3"><button type="button" onClick={() => { setLines((current) => current.filter((item) => item.id !== line.id)); setApplied(false); }} className="rounded p-1 text-[#a35242] hover:bg-[#fff1ed]" aria-label={`حذف بند ${line.itemName || "الفاتورة"}`}><Minus className="size-3.5" /></button></td></tr>; })}</tbody></table></div>}</section>

    <section className="rounded-2xl border border-[#d5e5da] bg-[#f4fbf7] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-sm font-bold text-[#274d43]">4. اعتماد خصم الفاتورة من الطلب المفتوح</h3><p className="mt-1 max-w-2xl text-[10px] leading-5 text-[#72857e]">سيؤثر الاعتماد على قائمة الطلب المفتوح في جلسة الشيت الحالية فقط. يحتفظ السجل المحلي ببيانات القرار والكميات، ولا يحتفظ بصورة الفاتورة أو نصها.</p></div><div className="rounded-xl border border-[#c9dfd2] bg-white px-4 py-2 text-center"><p className="text-[9px] font-bold text-[#768b82]">إجمالي الخصم</p><p className="mt-1 text-lg font-bold text-[#23705a]">{formatNumber(totalDeduction)} وحدة</p></div></div><label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-[#d5e5da] bg-white p-3 text-[10px] leading-5 text-[#55736a]"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 size-4 accent-[#19725d]" /><span>راجعت اسم الصنف، كود الصنف، كمية الفاتورة، وكمية الخصم المتبقية من الطلب المفتوح. أفهم أن الصورة نفسها لن تُخزَّن.</span></label><button type="button" onClick={approveSettlement} disabled={applied || !settlementLines.length} data-testid="approve-invoice-settlement" className="mt-3 rounded-xl bg-[#173f38] px-4 py-3 text-xs font-bold text-white hover:bg-[#17564c] disabled:cursor-not-allowed disabled:bg-[#8da59c]"><Check className="ml-1 inline size-4" />{applied ? "تم اعتماد التسوية لهذه الفاتورة" : "اعتماد الخصم من الطلب المفتوح"}</button></section>

    {records.length > 0 && <section className="rounded-2xl border border-[#e1e9e4] bg-white p-4 sm:p-5"><div className="flex items-center gap-2"><FileText className="size-4 text-[#9a721f]" /><h3 className="text-sm font-bold text-[#31574d]">آخر قرارات التسوية المحلية</h3></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{records.slice(0, 6).map((record) => <div key={record.id} className="rounded-xl border border-[#e2ebe5] bg-[#fbfdfb] p-3"><p className="text-[10px] font-bold text-[#31574d]">{record.supplierName}</p><p className="mt-1 text-[9px] text-[#758880]">{record.invoiceDate} · {record.lines.length} بنود</p><p className="mt-2 text-[9px] text-[#55736a]">خصم معتمد: {formatNumber(record.lines.reduce((sum, line) => sum + (line.proposedDeduction ?? 0), 0))} وحدة</p></div>)}</div></section>}
  </div>;
}

function Metric({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "amber" | "green" }) {
  const colors = { slate: "border-[#dce8e1] bg-white text-[#31574d]", amber: "border-[#ead8a7] bg-[#fffaf0] text-[#8a6618]", green: "border-[#c5e1d1] bg-[#f4fbf7] text-[#23705a]" };
  return <div className={`rounded-xl border p-3 text-center ${colors[tone]}`}><p className="text-[9px] font-bold opacity-70">{label}</p><p className="mt-1 text-lg font-bold">{formatNumber(value)}</p></div>;
}
