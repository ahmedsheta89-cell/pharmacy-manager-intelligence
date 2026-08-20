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
      { sourceColumn: "سعر الشراء", field: "cost_price", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
      { sourceColumn: "سعر البيع", field: "sale_price", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
      { sourceColumn: "الهامش", field: "profit_margin", confidence: "عالية", score: 100, reason: "اختبار", sample: "" },
    ],
    cleanRecords: rows.map((row) => ({ ...row, __metrics: {} })),
  } as unknown as SheetInspection;
}

describe("analyzeProductMovement", () => {
  it("يحدد توقف الصنف بعد شهر البداية ويحسب فجوة تغطية الرصيد من متوسط الكمية السابقة", () => {
    const result = analyzeProductMovement([
      sheet("6", [
        { "الصنف": "مضاد حيوي", "الرصيد": 5, "إجمالي البيع": 250, "الكمية": 5 },
        { "الصنف": "مكمل مستمر", "الرصيد": 5, "إجمالي البيع": 100, "الكمية": 5 },
      ]),
      sheet("7", [
        { "الصنف": "مضاد حيوي", "الرصيد": 3, "إجمالي البيع": 0, "الكمية": 0 },
        { "الصنف": "مكمل مستمر", "الرصيد": 3, "إجمالي البيع": 90, "الكمية": 3 },
      ]),
      sheet("8", [
        { "الصنف": "مضاد حيوي", "الرصيد": 2, "إجمالي البيع": 0, "الكمية": 0 },
        { "الصنف": "مكمل مستمر", "الرصيد": 2, "إجمالي البيع": 0, "الكمية": 0 },
      ]),
    ]);

    expect(result.periods.map((period) => period.label)).toEqual(["الشهر 6", "الشهر 7", "الشهر 8"]);
    expect(result.stoppedAfterBaseline).toHaveLength(1);
    expect(result.stoppedAfterBaseline[0]).toMatchObject({ itemName: "مضاد حيوي", baselineSales: 250, followUpSales: 0 });
    expect(result.coverageGaps[0]).toMatchObject({ itemName: "مكمل مستمر", stock: 2, averageHistoricalDemand: 4, requiredQuantity: 4, gap: 2, monthsOfCoverage: 0.5, priority: "مرتفع" });
  });

  it("لا يدّعي توافر مبيعات أو فترات عندما لا يقدمها المصدر", () => {
    const result = analyzeProductMovement([
      sheet("تقرير حالي", [{ "الصنف": "صنف برصيد صفر", "الرصيد": 0 }]),
    ]);

    expect(result.metrics.zeroBalanceCount).toBe(1);
    expect(result.metrics.zeroSalesCount).toBeUndefined();
    expect(result.dataGaps.some((gap) => gap.includes("قيمة مبيعات"))).toBe(true);
  });

  it("يفصل الحركة الصفرية عن الرصيد الصفري ويحسب قيمة المخزون فقط من الأسعار الموجودة فعليًا", () => {
    const result = analyzeProductMovement([
      sheet("لقطة حالية", [{ "الصنف": "مكمل غذائي", "الرصيد": 12, "إجمالي البيع": 0, "الكمية": 0, "سعر الشراء": 20, "سعر البيع": 30, "الهامش": 33.33 }]),
    ]);

    expect(result.metrics.zeroBalanceCount).toBe(0);
    expect(result.metrics.zeroMovementCount).toBe(1);
    expect(result.zeroMovement[0]).toMatchObject({
      itemName: "مكمل غذائي",
      purchaseValue: 240,
      publicValue: 360,
      potentialGrossProfit: 120,
      purchasePriceSource: "source",
      publicPriceSource: "source",
    });
  });

  it("يجمع سجلات الأشهر بالكود بعد تطبيعه ثم بالاسم عند غياب الكود", () => {
    const june = sheet("6", [{ "الصنف": "اسم قديم", "الرصيد": 5, "إجمالي البيع": 100, "الكمية": 2, "الكود": "SKU- 10" }]);
    const july = sheet("7", [{ "الصنف": "اسم محدث", "الرصيد": 3, "إجمالي البيع": 80, "الكمية": 2, "الكود": "sku10" }]);
    const august = sheet("8", [{ "الصنف": "بدون كود", "الرصيد": 2, "إجمالي البيع": 0, "الكمية": 0 }]);
    june.mappings.push({ sourceColumn: "الكود", field: "item_code", confidence: "عالية", score: 100, reason: "اختبار", sample: "" });
    july.mappings.push({ sourceColumn: "الكود", field: "item_code", confidence: "عالية", score: 100, reason: "اختبار", sample: "" });

    const result = analyzeProductMovement([june, july, august]);
    expect(result.items).toHaveLength(2);
    expect(result.items.find((item) => item.itemCode === "SKU- 10")).toMatchObject({ sourceRecordCount: 2, periods: { "sheet-month-6": { sales: 100 }, "sheet-month-7": { sales: 80 } } });
    expect(result.metrics).toMatchObject({ matchedByCodeRecordCount: 2, matchedByNameRecordCount: 1 });
  });
});
