import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { inspectPharmacyFile, refreshImportedInspection } from "./pharmacyEngine";
import { analyzeProductMovement } from "./productMovementEngine";
import { analyzePharmacyData } from "./analyticsEngine";
import { approveAllSuggestions } from "./importReview";

describe("inspectPharmacyFile", () => {
  it("يصحح انزياح رأس تقرير البرنامج ويلتقط الاسم والرصيد والمبيعات من المواضع الفعلية", async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["الموظف", "إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود"],
      [1250, 0, "علبة", 5, "محلي", "شركة اختبار", "صنف برصيد صفر", "A-01", null],
      [360, 3, "علبة", 2, "محلي", "شركة اختبار", "صنف متاح", "A-02", null],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "program-export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const inspection = approveAllSuggestions(await inspectPharmacyFile(file));
    const sheet = inspection.sheets[0];
    const movement = analyzeProductMovement(inspection.sheets);

    expect(sheet.headers).toEqual(["إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود"]);
    expect(sheet.excludedColumns).toEqual([]);
    expect(sheet.removedHeaders).toEqual([expect.objectContaining({ headerColumn: "A", title: "الموظف", reason: expect.stringContaining("قيم العمود A محفوظة") })]);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الإسم")?.field).toBe("item_name");
    expect(sheet.cleanRecords[0]?.["الإسم"]).toBe("صنف برصيد صفر");
    expect(sheet.cleanRecords[0]?.["الرصيد"]).toBe(0);
    expect(sheet.cleanRecords[0]?.["إجمالى س.بيع"]).toBe(1250);
    expect(sheet.headerDataOffset).toBe(1);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "إجمالى س.بيع")).toMatchObject({ dataColumn: "A", headerColumn: "B", adjustedForHeaderShift: true });
    expect(sheet.cleanRecords[0]?.__metrics.unitSalePrice).toBe(250);
    expect(movement.metrics.zeroBalanceCount).toBe(1);
    expect(movement.zeroBalance[0]).toMatchObject({ itemName: "صنف برصيد صفر", sales: 1250 });
  });

  it("لا يخترع ربحًا أو هامشًا عندما يفتقد التقرير تكلفة الشراء", async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود"],
      [1250, 0, "علبة", 5, "محلي", "شركة اختبار", "صنف بلا تكلفة", "A-01"],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "no-cost-export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const inspection = approveAllSuggestions(await inspectPharmacyFile(file));
    const analytics = analyzePharmacyData(inspection.sheets);

    expect(analytics?.metrics.sales).toMatchObject({ value: 1250, availability: "available" });
    expect(analytics?.metrics.cost.availability).toBe("unavailable");
    expect(analytics?.metrics.grossProfit.availability).toBe("unavailable");
    expect(analytics?.metrics.grossMargin.availability).toBe("unavailable");
    expect(analytics?.summary.recommendations.join(" ")).toContain("تكلفة الشراء");
  });

  it("يلتقط سعر الشراء وسعر الجمهور العربيين ويحسب الربح عندما يردان كحقول صريحة", async () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
      ["كود الصنف", "اسم الصنف", "سعر الشراء", "سعر الجمهور", "الرصيد", "الكمية المباعة", "إجمالي البيع"],
      ["A-11", "صنف بأسعار صريحة", 40, 65, 12, 4, 260],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "priced-export.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const inspection = approveAllSuggestions(await inspectPharmacyFile(file));
    const sheet = inspection.sheets[0];
    const analytics = analyzePharmacyData(inspection.sheets);

    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "سعر الشراء")?.field).toBe("cost_price");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "سعر الجمهور")?.field).toBe("sale_price");
    expect(sheet.cleanRecords[0]?.__metrics.unitCost).toBe(40);
    expect(sheet.cleanRecords[0]?.__metrics.unitSalePrice).toBe(65);
    expect(analytics?.metrics.cost).toMatchObject({ value: 160, availability: "available" });
    expect(analytics?.metrics.grossProfit).toMatchObject({ value: 100, availability: "available" });
  });

  it("يعيد احتساب جلسة قديمة ولا يبقي ربحًا أو هامشًا مصطنعين دون تكلفة", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["إجمالي المبيعات", "الكمية", "اسم الصنف"],
      [150, 3, "صنف تحقق"],
    ]), "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "stale-session.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const inspection = await inspectPharmacyFile(file);
    const stale = structuredClone(inspection);
    stale.sheets[0].cleanRecords[0].__metrics = { sales: 150, quantity: 3, cost: 0, profit: 150, profitMargin: 100 };

    const refreshed = refreshImportedInspection(stale);
    expect(refreshed.sheets[0].cleanRecords[0].__metrics.cost).toBeUndefined();
    expect(refreshed.sheets[0].cleanRecords[0].__metrics.profit).toBeUndefined();
    expect(refreshed.sheets[0].cleanRecords[0].__metrics.profitMargin).toBeUndefined();
  });
});
