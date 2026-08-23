import { describe, expect, it } from "vitest";
import { deriveBranchIntelligence, deriveOperatingPriorities, deriveSupplierLedger } from "./operationsIntelligence";

describe("عمليات مدير الصيدلية", () => {
  it("يرتب غرفة العمليات من التنبيهات الفعلية ولا يتجاوز ثلاث أولويات", () => {
    const priorities = deriveOperatingPriorities({ alerts: [
      { id: "watch", level: "watch", title: "مراقبة", detail: "تفصيل", evidence: "دليل مراقبة", action: "إجراء مراقبة" },
      { id: "urgent", level: "urgent", title: "عاجل", detail: "تفصيل", evidence: "دليل عاجل", action: "إجراء عاجل" },
    ] } as never, { lowStock: [], nearExpiry: [] } as never, []);
    expect(priorities).toHaveLength(2);
    expect(priorities[0]?.title).toBe("عاجل");
    expect(priorities[0]?.evidence).toBe("دليل عاجل");
  });

  it("يبني دفتر المورد من قرار تسوية ولا ينسب تأخيرًا أو سعرًا غير موثقين", () => {
    const ledger = deriveSupplierLedger([{ id: "settlement-1", supplierName: "Scope Pharma", invoiceDate: "2026-08-23", settledAt: 1, lines: [
      { itemName: "صنف أ", quantity: 10, proposedDeduction: 7, matchMethod: "code", matchConfidence: 100 },
    ] }]);
    expect(ledger.available).toBe(true);
    expect(ledger.entries[0]).toMatchObject({ supplierName: "Scope Pharma", acceptedQuantity: 7, shortQuantity: 3, exactMatches: 1 });
    expect(ledger.entries[0]?.note).toContain("لا يحسب التأخير");
  });

  it("يقترح نقلًا يدويًا فقط عند ظهور عجز وفائض محافظ لنفس الصنف بين فرعين", () => {
    const intelligence = deriveBranchIntelligence([{
      mappings: [
        { sourceColumn: "الفرع", field: "branch" },
        { sourceColumn: "الصنف", field: "item_name" },
        { sourceColumn: "الكود", field: "item_code" },
        { sourceColumn: "الرصيد", field: "stock_quantity" },
        { sourceColumn: "الحد", field: "reorder_level" },
      ],
      cleanRecords: [
        { "الفرع": "فرع المعادي", "الصنف": "صنف تجريبي", "الكود": "A-1", "الرصيد": 30, "الحد": 5 },
        { "الفرع": "فرع مدينة نصر", "الصنف": "صنف تجريبي", "الكود": "A-1", "الرصيد": 1, "الحد": 10 },
      ],
    }] as never);
    expect(intelligence.available).toBe(true);
    expect(intelligence.suggestions[0]).toMatchObject({ fromBranch: "فرع المعادي", toBranch: "فرع مدينة نصر", suggestedQuantity: 9 });
    expect(intelligence.suggestions[0]?.action).toContain("يدويًا");
  });
});
