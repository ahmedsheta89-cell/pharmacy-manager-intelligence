import { describe, expect, it } from "vitest";
import { getMovementQuickFilterClassName, getMovementQuickFilterView } from "./productMovementFilters";
import type { ProductMovementAnalysis } from "./productMovementEngine";

const analysis = {
  coverageGaps: [
    { id: "urgent", priority: "عاجل" },
    { id: "high", priority: "مرتفع" },
    { id: "medium", priority: "متوسط" },
  ],
} as unknown as ProductMovementAnalysis;

describe("getMovementQuickFilterView", () => {
  it("يحصر عرض الرصيد الصفري ويخفي تغطية الطلب عند فلتر الرصيد الصفري", () => {
    const view = getMovementQuickFilterView(analysis, "zero-balance");
    expect(view.showZeroBalanceAndMovement).toBe(true);
    expect(view.showCoverage).toBe(false);
    expect(view.showStopped).toBe(false);
  });

  it("يحصر جدول التغطية في الأولوية العاجلة والمرتفعة عند فلتر الأولوية", () => {
    const view = getMovementQuickFilterView(analysis, "high-priority");
    expect(view.showZeroBalanceAndMovement).toBe(false);
    expect(view.showCoverage).toBe(true);
    expect(view.showStopped).toBe(false);
    expect(view.highPriority.map((item) => item.id)).toEqual(["urgent", "high"]);
    expect(view.coverageItems.map((item) => item.id)).toEqual(["urgent", "high"]);
  });

  it("يمنح أزرار الرصيد الصفري والأولوية العالية ألوان التحذير النشطة الصحيحة", () => {
    expect(getMovementQuickFilterClassName("zero-balance", "zero-balance")).toContain("bg-[#fbeceb]");
    expect(getMovementQuickFilterClassName("zero-balance", "high-priority")).toContain("bg-[#fffbf2]");
    expect(getMovementQuickFilterClassName("high-priority", "high-priority")).toContain("bg-[#fff3dd]");
    expect(getMovementQuickFilterClassName("high-priority", "zero-balance")).toContain("bg-[#fff8f7]");
  });
});
