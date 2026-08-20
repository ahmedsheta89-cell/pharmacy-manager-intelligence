import { describe, expect, it } from "vitest";
import { analyzeProductMovement } from "./productMovementEngine";
import { applyPriceFile, monthFromFileName, resolveMonthlyAssignments } from "./multiPeriodImport";
import type { ImportInspection, SheetInspection } from "./pharmacyEngine";

function inspection(fileName: string, mappings: SheetInspection["mappings"], records: Array<Record<string, unknown>>): ImportInspection {
  return {
    fileName, fileType: "xlsx", fileSize: 1, fileFingerprint: fileName, detectedAt: new Date(),
    sheets: [{ name: "بيانات", mappings, cleanRecords: records.map((record) => ({ ...record, __metrics: {}, __rowIndex: 2, __sheetName: "بيانات" })), headerRowIndex: 0, headerDataOffset: 0, headers: [], rawRecords: [], excludedRows: 0, rows: 1, columns: mappings.length, preview: [], quality: { score: 100, validRecords: records.length, excludedRecords: 0, emptyCriticalCells: 0, invalidNumericValues: 0, invalidDates: 0, negativeValues: 0, duplicates: 0, totalRows: records.length, issues: [], recognizedFields: [], unknownColumns: [] } } as unknown as SheetInspection],
  };
}

const field = (sourceColumn: string, fieldName: SheetInspection["mappings"][number]["field"]) => ({ sourceColumn, field: fieldName, confidence: "عالية" as const, score: 100, reason: "اختبار", sample: "" });

describe("multiPeriodImport", () => {
  it("يتعرف على أسماء الأشهر العربية والإنجليزية والأرقام", () => {
    expect(monthFromFileName("يونيو.xlsx")).toBe(6);
    expect(monthFromFileName("July-report.xlsx")).toBe(7);
    expect(monthFromFileName("8.xlsx")).toBe(8);
    expect(monthFromFileName("current.xlsx")).toBeUndefined();
  });

  it("يقبل اختيار الشهر يدويًا للأسماء غير القياسية ويمنع الفترة المكررة", () => {
    expect(resolveMonthlyAssignments(["تقرير-أ.xlsx", "تقرير-ب.xlsx"], [6, 7])).toEqual([
      { month: 6, source: "اختيار يدوي" }, { month: 7, source: "اختيار يدوي" },
    ]);
    expect(() => resolveMonthlyAssignments(["تقرير-أ.xlsx", "تقرير-ب.xlsx"], [6, 6])).toThrow("أكثر من ملف للشهر 6");
    expect(() => resolveMonthlyAssignments(["تقرير-أ.xlsx", "يوليو.xlsx"], [undefined, undefined])).toThrow("اختر الشهر يدويًا");
  });

  it("يطابق ملف الأسعار بالكود أولًا ويعيد احتساب القيمة والهامش دون افتراض", () => {
    const base = inspection("رصيد.xlsx", [field("الكود", "item_code"), field("الصنف", "item_name"), field("الرصيد", "stock_quantity"), field("الكمية", "quantity_sold"), field("الإجمالي", "sales_total")], [{ "الكود": "A-10", "الصنف": "صنف تجريبي", "الرصيد": 3, "الكمية": 0, "الإجمالي": 0 }]);
    const prices = inspection("أسعار.xlsx", [field("الكود", "item_code"), field("الصنف", "item_name"), field("شراء", "cost_price"), field("جمهور", "sale_price")], [{ "الكود": "A10", "الصنف": "اسم مختلف", "شراء": 12, "جمهور": 20 }]);
    const result = applyPriceFile(base, prices);
    const movement = analyzeProductMovement(result.inspection.sheets);
    expect(result.report).toMatchObject({ matchedRecords: 1, matchedByCode: 1, matchedByName: 0, hasPurchasePrices: true, hasPublicPrices: true });
    expect(movement.zeroMovement[0]).toMatchObject({ purchaseValue: 36, publicValue: 60, potentialGrossProfit: 24, purchasePriceSource: "price_file", publicPriceSource: "price_file" });
  });

  it("يعرض نسبة المطابقة وقائمتي الأصناف غير المطابقة والأسعار غير المستخدمة", () => {
    const base = inspection("رصيد.xlsx", [field("الكود", "item_code"), field("الصنف", "item_name"), field("الرصيد", "stock_quantity")], [
      { "الكود": "A-10", "الصنف": "صنف مطابق", "الرصيد": 3 },
      { "الكود": "B-20", "الصنف": "صنف غير مطابق", "الرصيد": 1 },
    ]);
    const prices = inspection("أسعار.xlsx", [field("الكود", "item_code"), field("الصنف", "item_name"), field("شراء", "cost_price"), field("جمهور", "sale_price")], [
      { "الكود": "A10", "الصنف": "اسم مختلف", "شراء": 12, "جمهور": 20 },
      { "الكود": "C-30", "الصنف": "سعر زائد", "شراء": 7, "جمهور": 10 },
    ]);

    const result = applyPriceFile(base, prices);

    expect(result.report).toMatchObject({
      baseRecords: 2, matchedRecords: 1, unmatchedRecords: 1, matchRate: 50,
      unmatchedUniqueItems: 1, unusedPriceRows: 1,
    });
    expect(result.report.unmatchedItems[0]).toMatchObject({ itemCode: "B-20", itemName: "صنف غير مطابق", occurrences: 1, reason: "غير موجود في ملف الأسعار" });
    expect(result.report.unusedPriceItems[0]).toMatchObject({ itemCode: "C-30", itemName: "سعر زائد" });
  });
});
