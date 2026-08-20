import { describe, expect, it } from "vitest";
import { analyzeProductMovement } from "./productMovementEngine";
import type { SheetInspection } from "./pharmacyEngine";

function sheet(name: string, rows: Array<Record<string, unknown>>): SheetInspection {
  return {
    name,
    mappings: [
      { sourceColumn: "الصنف", field: "item_name", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
      { sourceColumn: "الرصيد", field: "stock_quantity", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
      { sourceColumn: "إجمالي البيع", field: "sales_total", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
      { sourceColumn: "الكمية", field: "quantity_sold", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
    ],
    cleanRecords: rows.map((row) => ({ ...row, __metrics: {} })),
  } as unknown as SheetInspection;
}

describe("analyzeProductMovement", () => {
  it("يحدد توقف الصنف بعد شهر البداية ويحسب فجوة تغطية الرصيد من متوسط الكمية السابقة", () => {
    const result = analyzeProductMovement([
      sheet("6", [{ "الصنف": "مضاد حيوي", "الرصيد": 5, "إجمالي البيع": 250, "الكمية": 5 }]),
      sheet("7", [{ "الصنف": "مضاد حيوي", "الرصيد": 3, "إجمالي البيع": 0, "الكمية": 3 }]),
      sheet("8", [{ "الصنف": "مضاد حيوي", "الرصيد": 2, "إجمالي البيع": 0, "الكمية": 0 }]),
    ]);

    expect(result.periods.map((period) => period.label)).toEqual(["الشهر 6", "الشهر 7", "الشهر 8"]);
    expect(result.stoppedAfterBaseline).toHaveLength(1);
    expect(result.stoppedAfterBaseline[0]).toMatchObject({ itemName: "مضاد حيوي", baselineSales: 250, followUpSales: 0 });
    expect(result.coverageGaps[0]).toMatchObject({ itemName: "مضاد حيوي", stock: 2, averageHistoricalDemand: 4, requiredQuantity: 4, gap: 2 });
  });

  it("لا يدّعي توافر مبيعات أو فترات عندما لا يقدمها المصدر", () => {
    const result = analyzeProductMovement([
      sheet("تقرير حالي", [{ "الصنف": "صنف برصيد صفر", "الرصيد": 0 }]),
    ]);

    expect(result.metrics.zeroBalanceCount).toBe(1);
    expect(result.metrics.zeroSalesCount).toBeUndefined();
    expect(result.dataGaps.some((gap) => gap.includes("قيمة مبيعات"))).toBe(true);
  });
});
