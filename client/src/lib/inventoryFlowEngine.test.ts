import { describe, expect, it } from "vitest";
import { analyzeInventoryFlow } from "@/lib/inventoryFlowEngine";
import type { ProductMovementAnalysis } from "@/lib/productMovementEngine";

const baseAnalysis: ProductMovementAnalysis = {
  available: true,
  periods: [{ key: "m6", label: "يونيو", order: 6 }, { key: "m7", label: "يوليو", order: 7 }],
  sourceNote: "", dataGaps: [], zeroBalance: [], zeroMovement: [], zeroSales: [], stoppedAfterBaseline: [], coverageGaps: [],
  items: [{ id: "code:a", itemName: "صنف تجريبي", itemCode: "A", stock: 0, quantity: 20, sales: 2000, purchasePrice: 60, publicPrice: 100, sourceRecordCount: 2, periods: { m6: { stock: 5, quantity: 10, sales: 1000 }, m7: { stock: 0, quantity: 10, sales: 1000 } } }],
  metrics: { zeroBalanceCount: 1, zeroBalanceRecordCount: 1, zeroBalanceRawRecordCount: 1, zeroBalanceUnidentifiedRecordCount: 0, zeroMovementCount: 1, zeroMovementRecordCount: 1, knownZeroMovementPurchaseValue: 0, knownZeroMovementPublicValue: 0, knownZeroMovementPotentialProfit: 0, matchedByCodeRecordCount: 2, matchedByNameRecordCount: 0 },
};

describe("analyzeInventoryFlow", () => {
  it("يستنتج صافي التعويض ويعزل فرصة عدم التوفر الحسابية عن الخسارة المؤكدة", () => {
    const result = analyzeInventoryFlow(baseAnalysis);
    expect(result.comparable).toBe(true);
    expect(result.months[1].inferredReplenishmentUnits).toBe(5);
    expect(result.unreplenishedItems).toHaveLength(0);
    expect(result.metrics.currentStockPurchaseValue).toBe(0);
  });

  it("يسجل فرصة غير محققة فقط عند عدم وجود تعويض وحركة صفرية بعد طلب تاريخي", () => {
    const result = analyzeInventoryFlow({ ...baseAnalysis, items: [{ ...baseAnalysis.items[0], periods: { m6: { stock: 0, quantity: 10, sales: 1000 }, m7: { stock: 0, quantity: 0, sales: 0 } } }] });
    expect(result.unreplenishedItems).toHaveLength(1);
    expect(result.unreplenishedItems[0].opportunitySales).toBe(1000);
    expect(result.unreplenishedItems[0].opportunityGrossProfit).toBe(400);
    expect(result.metrics.unreplenishedOpportunitySales).toBe(1000);
  });

  it("لا يسجل فرصة عدم توفر عندما يخرج الصنف فعليًا حتى إن غابت قيمة المبيعات", () => {
    const result = analyzeInventoryFlow({
      ...baseAnalysis,
      items: [{
        ...baseAnalysis.items[0],
        periods: { m6: { stock: 5, quantity: 10, sales: 1000 }, m7: { stock: 0, quantity: 2, sales: 0 } },
      }],
    });
    expect(result.unreplenishedItems).toHaveLength(0);
  });
});
