import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInventoryFlowWorkbook, exportInventoryFlowWorkbook } from "./inventoryFlowExport";
import type { InventoryFlowAnalysis } from "./inventoryFlowEngine";

const analysis = {
  comparable: false,
  months: [],
  unreplenishedItems: [],
  focusItems: [],
  notes: ["اختبار محلي"],
  dataGaps: ["سعر الشراء غير متاح"],
  metrics: {
    currentZeroBalanceCount: 0,
    highPriorityCount: 0,
    inferredReplenishmentUnits: 0,
  },
} as InventoryFlowAnalysis;

describe("تصدير لوحة تدفق المخزون", () => {
  it("ينشئ أوراق الملخص والوتيرة والاستثناءات وحدود القراءة", () => {
    const workbook = buildInventoryFlowWorkbook(analysis);
    expect(workbook.SheetNames).toEqual(["ملخص القرار", "الوتيرة الشهرية", "غير معوض", "حدود القراءة"]);
    expect(workbook.Sheets["ملخص القرار"]?.["A2"]?.v).toBe("قيمة المخزون الشرائية");
  });

  it("ينشئ ملف Excel محليًا باسم تقرير تدفق المخزون", () => {
    const filename = `تقرير_تدفق_المخزون_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const exportedPath = resolve(process.cwd(), filename);
    try {
      exportInventoryFlowWorkbook(analysis);
      expect(existsSync(exportedPath)).toBe(true);
    } finally {
      if (existsSync(exportedPath)) unlinkSync(exportedPath);
    }
  });
});
