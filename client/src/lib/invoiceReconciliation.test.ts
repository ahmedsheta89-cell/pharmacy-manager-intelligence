import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateInvoiceDeductions, loadInvoiceSettlementRecords, parseInvoiceText, reconcileInvoiceLines, saveInvoiceSettlementRecord } from "./invoiceReconciliation";
import type { ReorderSuggestion } from "./inventoryEngine";

function memoryStorage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

const openOrders: ReorderSuggestion[] = [
  { id: "65075", itemName: "Blissful Hair Gel", itemCode: "65075", suggestedQuantity: 5, reason: "حد إعادة الطلب" },
  { id: "panadol", itemName: "بنادول اكسترا", itemCode: "12345", suggestedQuantity: 3, reason: "حد إعادة الطلب" },
];

describe("invoice reconciliation", () => {
  beforeEach(() => { vi.stubGlobal("window", { localStorage: memoryStorage() }); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("يقرأ سطرًا ويطابقه بالكود ويقترح خصمًا جزئيًا من الطلب المفتوح", () => {
    const lines = parseInvoiceText("65075 Blissful Hair Gel 2");
    const result = reconcileInvoiceLines(lines, openOrders);
    expect(result).toMatchObject([{ itemCode: "65075", quantity: 2, orderId: "65075", matchMethod: "code", status: "partial", proposedDeduction: 2, remainingAfterDeduction: 3 }]);
    expect(calculateInvoiceDeductions(result, { [result[0].id]: 2 })).toEqual({ "65075": 2 });
  });

  it("لا يخصم أكثر من الطلب المفتوح ويترك السطر غير المطابق دون خصم", () => {
    const result = reconcileInvoiceLines([
      { id: "one", rawLine: "12345 بنادول اكسترا 7", itemName: "بنادول اكسترا", itemCode: "12345", quantity: 7, source: "manual" },
      { id: "two", rawLine: "صنف غير موجود 3", itemName: "صنف غير موجود", quantity: 3, source: "manual" },
    ], openOrders);
    expect(result[0]).toMatchObject({ status: "exceeds_open_order", proposedDeduction: 3, remainingAfterDeduction: 0 });
    expect(result[1]?.status).toBe("not_found");
    expect(result[1]?.proposedDeduction).toBeUndefined();
  });

  it("يمنع تكرار بندين من تجاوز الكمية المفتوحة للصنف نفسه", () => {
    const result = reconcileInvoiceLines([
      { id: "first", rawLine: "65075 Blissful 4", itemName: "Blissful Hair Gel", itemCode: "65075", quantity: 4, source: "manual" },
      { id: "second", rawLine: "65075 Blissful 4", itemName: "Blissful Hair Gel", itemCode: "65075", quantity: 4, source: "manual" },
    ], openOrders);
    expect(calculateInvoiceDeductions(result, { first: 4, second: 4 })).toEqual({ "65075": 5 });
  });

  it("يحفظ قرار التسوية محليًا دون نص OCR الخام أو أي محتوى صورة", () => {
    saveInvoiceSettlementRecord({ id: "record-1", supplierName: "مورد الاختبار", invoiceDate: "2026-08-22", settledAt: 1, lines: [{ orderId: "65075", orderItemName: "Blissful Hair Gel", itemName: "Blissful Hair Gel", itemCode: "65075", quantity: 2, proposedDeduction: 2, remainingAfterDeduction: 3, matchMethod: "code", matchConfidence: 100 }] });
    const stored = JSON.stringify(loadInvoiceSettlementRecords());
    expect(stored).toContain("مورد الاختبار");
    expect(stored).not.toContain("rawLine");
    expect(stored).not.toContain("image");
  });
});
