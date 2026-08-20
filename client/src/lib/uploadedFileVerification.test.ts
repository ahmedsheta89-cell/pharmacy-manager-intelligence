import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectPharmacyFile } from "./pharmacyEngine";
import { analyzeProductMovement } from "./productMovementEngine";
import { approveAllSuggestions } from "./importReview";

describe("ملف الصيدلية المرسل 6-8.xlsx", () => {
  it("يصحح انزياح العناوين ويستخرج الحقول التي ثبت وجودها دون اختلاق أسعار أو تواريخ", async () => {
    const bytes = await readFile("/home/ubuntu/upload/6-8.xlsx");
    const inspection = approveAllSuggestions(await inspectPharmacyFile(new File([bytes], "6-8.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })));
    const sheet = inspection.sheets[0];
    const movement = analyzeProductMovement(inspection.sheets);

    expect(inspection.sheets).toHaveLength(1);
    expect(sheet.headerDataOffset).toBe(1);
    expect(sheet.quality.validRecords).toBe(2761);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الإسم")).toMatchObject({ field: "item_name", dataColumn: "G", headerColumn: "H" });
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الكود")).toMatchObject({ field: "item_code", dataColumn: "H", headerColumn: "I" });
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "إجمالى س.بيع")).toMatchObject({ field: "sales_total", dataColumn: "A", headerColumn: "B" });
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "إجمالى س.بيع")?.reason).toContain("عنوان B");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "إجمالى س.بيع")?.reason).toContain("قيم العمود A");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الرصيد")).toMatchObject({ field: "stock_quantity", dataColumn: "B", headerColumn: "C" });
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الوحدة")).toMatchObject({ field: "unit", dataColumn: "C", headerColumn: "D" });
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الكمية")).toMatchObject({ field: "quantity_sold", dataColumn: "D", headerColumn: "E" });
    expect(sheet.mappings.some((mapping) => mapping.field === "employee")).toBe(false);
    expect(sheet.excludedColumns).toEqual([{ dataColumn: "A", sourceColumn: "الموظف", reason: expect.stringContaining("قرار المدير") }]);
    expect(sheet.layoutNote).toContain("استبعاد عمود A «الموظف»");
    expect(sheet.layoutNote).toContain("عنوان I «الكود» يصف قيم H");
    expect(sheet.mappings.find((mapping) => mapping.dataColumn === "I")).toBeUndefined();
    expect(sheet.cleanRecords[0]).toMatchObject({
      "إجمالى س.بيع": 39,
      "الرصيد": 1.67,
      "الوحدة": "علبة",
      "الكمية": 1,
      "المنشأ": "محلى",
      "الشركة": "SCOPE PHARMA",
      "الإسم": "(C6) conviban 25mg30tab",
      "الكود": "61986",
    });
    expect(sheet.mappings.some((mapping) => mapping.field === "cost_price")).toBe(false);
    expect(sheet.mappings.some((mapping) => mapping.field === "sale_price")).toBe(false);
    expect(movement.metrics.zeroBalanceCount).toBe(441);
    expect(movement.metrics.zeroBalanceRecordCount).toBe(442);
    expect(movement.metrics.zeroBalanceRawRecordCount).toBe(442);
    expect(movement.metrics.zeroBalanceUnidentifiedRecordCount).toBe(0);
    expect(movement.periods).toHaveLength(0);
  });
});
