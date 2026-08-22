import type { ReorderSuggestion } from "./inventoryEngine";

export type InvoiceLineCandidate = {
  id: string;
  rawLine: string;
  itemName: string;
  itemCode?: string;
  quantity?: number;
  source: "ocr" | "manual";
};

export type InvoiceMatchMethod = "code" | "name" | "similar" | "none";
export type InvoiceMatchStatus = "ready" | "partial" | "needs_review" | "not_found" | "exceeds_open_order";

export type InvoiceSettlementLine = InvoiceLineCandidate & {
  orderId?: string;
  orderItemName?: string;
  requestedQuantity?: number;
  matchMethod: InvoiceMatchMethod;
  matchConfidence: number;
  proposedDeduction?: number;
  remainingAfterDeduction?: number;
  status: InvoiceMatchStatus;
  reason: string;
};

export type InvoiceSettlementRecord = {
  id: string;
  supplierName: string;
  invoiceDate: string;
  settledAt: number;
  lines: Array<Pick<InvoiceSettlementLine, "orderId" | "orderItemName" | "itemName" | "itemCode" | "quantity" | "proposedDeduction" | "remainingAfterDeduction" | "matchMethod" | "matchConfidence">>;
};

const STORAGE_KEY = "pharmacy-manager-invoice-settlements-v1";

const ARABIC_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", "٬": "," };
const STOP_WORDS = new Set(["صنف", "عبوة", "علبة", "عدد", "كمية", "qty", "quantity", "item", "code", "code", "egp", "جنيه"]);

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function normalizeInvoiceText(value: string) {
  return value
    .toLocaleLowerCase("ar")
    .replace(/[٠-٩٫٬]/g, (character) => ARABIC_DIGITS[character] ?? character)
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalizeInvoiceText(value).split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function nameScore(first: string, second: string) {
  const normalizedFirst = normalizeInvoiceText(first);
  const normalizedSecond = normalizeInvoiceText(second);
  if (!normalizedFirst || !normalizedSecond) return 0;
  if (normalizedFirst === normalizedSecond) return 100;
  if (normalizedFirst.includes(normalizedSecond) || normalizedSecond.includes(normalizedFirst)) return 90;
  const firstTokens = new Set(tokens(first));
  const secondTokens = new Set(tokens(second));
  if (!firstTokens.size || !secondTokens.size) return 0;
  const shared = Array.from(firstTokens).filter((token) => secondTokens.has(token)).length;
  return Math.round((shared / Math.max(firstTokens.size, secondTokens.size)) * 100);
}

function parseArabicNumber(value: string) {
  const normalized = value.replace(/[٠-٩٫٬]/g, (character) => ARABIC_DIGITS[character] ?? character).replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * يستخرج سطورًا قابلة للمراجعة من OCR. لا يفترض أن الرقم المستخرج صحيح: 
 * كل سطر يبقى مرئيًا وقابلاً للتعديل قبل التسوية.
 */
export function parseInvoiceText(rawText: string): InvoiceLineCandidate[] {
  return rawText.split(/\r?\n/).map((rawLine, index) => {
    const trimmed = rawLine.trim();
    const numberMatches = Array.from(trimmed.matchAll(/(?:^|\s)([٠-٩\d]+(?:[٫.,][٠-٩\d]+)?)(?=\s|$)/g));
    const lastNumber = numberMatches.at(-1);
    const quantity = lastNumber ? parseArabicNumber(lastNumber[1]) : undefined;
    const codeMatch = trimmed.match(/(?:^|\s)(\d{4,})(?=\s|$)/);
    const itemName = trimmed
      .replace(codeMatch?.[1] ?? "", " ")
      .replace(lastNumber?.[0] ?? "", " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      id: `ocr-line-${index + 1}`,
      rawLine: trimmed,
      itemName,
      ...(codeMatch ? { itemCode: codeMatch[1] } : {}),
      ...(quantity ? { quantity } : {}),
      source: "ocr" as const,
    };
  }).filter((line) => line.rawLine.length > 2 && (line.itemName.length > 1 || Boolean(line.itemCode)));
}

function matchLine(line: InvoiceLineCandidate, openOrders: ReorderSuggestion[]) {
  const code = normalizeInvoiceText(line.itemCode ?? "");
  if (code) {
    const byCode = openOrders.find((order) => normalizeInvoiceText(order.itemCode ?? "") === code);
    if (byCode) return { order: byCode, method: "code" as const, confidence: 100 };
  }
  const scored = openOrders.map((order) => ({ order, score: nameScore(line.itemName, order.itemName) })).sort((first, second) => second.score - first.score);
  const best = scored[0];
  if (!best || best.score < 55) return { order: undefined, method: "none" as const, confidence: best?.score ?? 0 };
  return { order: best.order, method: best.score >= 90 ? "name" as const : "similar" as const, confidence: best.score };
}

export function reconcileInvoiceLines(invoiceLines: InvoiceLineCandidate[], openOrders: ReorderSuggestion[]): InvoiceSettlementLine[] {
  return invoiceLines.map((line) => {
    const { order, method, confidence } = matchLine(line, openOrders);
    if (!order) return { ...line, matchMethod: "none", matchConfidence: confidence, status: "not_found", reason: "لم نجد طلبًا مفتوحًا مطابقًا بالاسم أو الكود." };
    const requestedQuantity = Math.max(0, order.suggestedQuantity ?? 0);
    if (!line.quantity) return { ...line, orderId: order.id, orderItemName: order.itemName, requestedQuantity, matchMethod: method, matchConfidence: confidence, status: "needs_review", reason: "لم نستخرج كمية مؤكدة من السطر. اكتبها يدويًا قبل اقتراح الخصم." };
    if (confidence < 75) return { ...line, orderId: order.id, orderItemName: order.itemName, requestedQuantity, matchMethod: method, matchConfidence: confidence, status: "needs_review", reason: "تشابه الاسم غير كافٍ للخصم. راجع المطابقة أو اختر الصنف يدويًا." };
    const proposedDeduction = Math.min(line.quantity, requestedQuantity);
    const remainingAfterDeduction = Math.max(0, requestedQuantity - proposedDeduction);
    if (line.quantity > requestedQuantity) return { ...line, orderId: order.id, orderItemName: order.itemName, requestedQuantity, matchMethod: method, matchConfidence: confidence, proposedDeduction, remainingAfterDeduction, status: "exceeds_open_order", reason: "كمية الفاتورة أعلى من الطلب المفتوح؛ سيُقترح خصم الحد المتبقي فقط." };
    return { ...line, orderId: order.id, orderItemName: order.itemName, requestedQuantity, matchMethod: method, matchConfidence: confidence, proposedDeduction, remainingAfterDeduction, status: line.quantity < requestedQuantity ? "partial" : "ready", reason: line.quantity < requestedQuantity ? "الكمية الواردة جزئية؛ سيبقى جزء من الطلب مفتوحًا." : "مطابقة مؤكدة بين الفاتورة والطلب المفتوح." };
  });
}

export function calculateInvoiceDeductions(lines: InvoiceSettlementLine[], selectedDeductions: Record<string, number>) {
  return lines.reduce<Record<string, number>>((result, line) => {
    if (!line.orderId) return result;
    const requested = Math.max(0, line.requestedQuantity ?? 0);
    const alreadyDeducted = result[line.orderId] ?? 0;
    const remainingOpenQuantity = Math.max(0, requested - alreadyDeducted);
    const value = Math.min(remainingOpenQuantity, Math.max(0, selectedDeductions[line.id] ?? line.proposedDeduction ?? 0));
    if (value > 0) result[line.orderId] = alreadyDeducted + value;
    return result;
  }, {});
}

export function loadInvoiceSettlementRecords(): InvoiceSettlementRecord[] {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((record): record is InvoiceSettlementRecord => Boolean(record && typeof record.id === "string" && Array.isArray(record.lines))) : [];
  } catch {
    return [];
  }
}

export function saveInvoiceSettlementRecord(record: InvoiceSettlementRecord) {
  if (!canUseStorage()) return record;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...loadInvoiceSettlementRecords()].slice(0, 30)));
  return record;
}
