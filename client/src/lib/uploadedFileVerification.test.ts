import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectPharmacyFile } from "./pharmacyEngine";
import { analyzeProductMovement } from "./productMovementEngine";

describe("ملف الصيدلية المرسل 6-8.xlsx", () => {
  it("يصحح انزياح العناوين ويستخرج الحقول التي ثبت وجودها دون اختلاق أسعار أو تواريخ", async () => {
    const bytes = await readFile("/home/ubuntu/upload/6-8.xlsx");
    const inspection = await inspectPharmacyFile(new File([bytes], "6-8.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const sheet = inspection.sheets[0];
    const movement = analyzeProductMovement(inspection.sheets);

    expect(inspection.sheets).toHaveLength(1);
    expect(sheet.headerDataOffset).toBe(1);
    expect(sheet.quality.validRecords).toBe(2761);
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الإسم")?.field).toBe("item_name");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "إجمالى س.بيع")?.field).toBe("sales_total");
    expect(sheet.mappings.find((mapping) => mapping.sourceColumn === "الرصيد")?.field).toBe("stock_quantity");
    expect(sheet.mappings.some((mapping) => mapping.field === "cost_price")).toBe(false);
    expect(sheet.mappings.some((mapping) => mapping.field === "sale_price")).toBe(false);
    expect(movement.metrics.zeroBalanceCount).toBe(441);
    expect(movement.metrics.zeroBalanceRecordCount).toBe(442);
    expect(movement.metrics.zeroBalanceRawRecordCount).toBe(442);
    expect(movement.metrics.zeroBalanceUnidentifiedRecordCount).toBe(0);
    expect(movement.periods).toHaveLength(0);
  });
});
