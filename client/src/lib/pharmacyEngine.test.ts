import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { inspectPharmacyFile } from "./pharmacyEngine";
import { analyzeProductMovement } from "./productMovementEngine";
import { analyzePharmacyData } from "./analyticsEngine";

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

    const inspection = await inspectPharmacyFile(file);
    const sheet = inspection.sheets[0];
    const movement = analyzeProductMovement(inspection.sheets);

    expect(sheet.headers).toEqual(["إجمالى س.بيع", "الرصيد", "الوحدة", "الكمية", "المنشأ", "الشركة", "الإسم", "الكود", "الموظف (غير مستخدم)"]);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الإسم")?.field).toBe("item_name");
    expect(sheet.cleanRecords[0]?.["الإسم"]).toBe("صنف برصيد صفر");
    expect(sheet.cleanRecords[0]?.["الرصيد"]).toBe(0);
    expect(sheet.cleanRecords[0]?.["إجمالى س.بيع"]).toBe(1250);
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

    const inspection = await inspectPharmacyFile(file);
    const analytics = analyzePharmacyData(inspection.sheets);

    expect(analytics?.metrics.sales).toMatchObject({ value: 1250, availability: "available" });
    expect(analytics?.metrics.cost.availability).toBe("unavailable");
    expect(analytics?.metrics.grossProfit.availability).toBe("unavailable");
    expect(analytics?.metrics.grossMargin.availability).toBe("unavailable");
    expect(analytics?.summary.recommendations.join(" ")).toContain("تكلفة الشراء");
  });
});
