import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductMovementWorkbook, exportProductMovementWorkbook } from "./productMovementExport";
import type { ProductMovementAnalysis } from "./productMovementEngine";

describe("buildProductMovementWorkbook", () => {
  it("ينشئ أوراق الملخص والحركة الصفرية والتوقف وأولوية الطلب حتى مع غياب بعض البيانات", () => {
    const analysis = {
      available: true,
      sourceNote: "اختبار محلي",
      periods: [],
      dataGaps: ["سعر الشراء غير متاح"],
      items: [],
      zeroBalance: [],
      zeroMovement: [],
      zeroSales: [],
      stoppedAfterBaseline: [],
      coverageGaps: [],
      metrics: { zeroBalanceCount: 0, zeroMovementCount: 0 },
    } as ProductMovementAnalysis;

    const workbook = buildProductMovementWorkbook(analysis);
    expect(workbook.SheetNames).toEqual(["ملخص حركة الأصناف", "حركة صفرية", "رصيد صفري", "أصناف متوقفة", "أولوية الطلب", "حدود المصدر"]);
    expect(workbook.Sheets["ملخص حركة الأصناف"]?.["A2"]?.v).toBe("وقت إنشاء الملف");
  });

  it("ينزّل تقرير Excel محليًا باسم عربي متوقع دون أي مسار رفع بيانات", () => {
    const analysis = {
      available: true,
      sourceNote: "اختبار تنزيل محلي",
      periods: [],
      dataGaps: [],
      items: [],
      zeroBalance: [],
      zeroMovement: [],
      zeroSales: [],
      stoppedAfterBaseline: [],
      coverageGaps: [],
      metrics: { zeroBalanceCount: 0, zeroMovementCount: 0 },
    } as ProductMovementAnalysis;
    const filename = `تقرير_حركة_الأصناف_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const exportedPath = resolve(process.cwd(), filename);

    try {
      exportProductMovementWorkbook(analysis);
      expect(existsSync(exportedPath)).toBe(true);
    } finally {
      if (existsSync(exportedPath)) unlinkSync(exportedPath);
    }
  });
});
