import type { ProductMovementAnalysis } from "./productMovementEngine";

export type MovementQuickFilter = "all" | "zero-balance" | "high-priority";

const filterColors: Record<MovementQuickFilter, { active: string; inactive: string }> = {
  all: { active: "border-[#1c735e] bg-[#e8f5ef] text-[#176950]", inactive: "border-[#d7e5df] bg-[#fbfcfa] text-[#557168]" },
  "zero-balance": { active: "border-[#d1847b] bg-[#fbeceb] text-[#a94c44]", inactive: "border-[#ead1cd] bg-[#fff8f7] text-[#9a574f]" },
  "high-priority": { active: "border-[#d7a448] bg-[#fff3dd] text-[#8f6416]", inactive: "border-[#ead8b5] bg-[#fffbf2] text-[#8f6d2d]" },
};

export function getMovementQuickFilterClassName(selected: MovementQuickFilter, button: MovementQuickFilter) {
  return `rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${selected === button ? filterColors[button].active : filterColors[button].inactive}`;
}

export function getMovementQuickFilterView(analysis: ProductMovementAnalysis, filter: MovementQuickFilter) {
  const highPriority = analysis.coverageGaps.filter((item) => item.priority === "عاجل" || item.priority === "مرتفع");
  return {
    highPriority,
    showZeroBalanceAndMovement: filter !== "high-priority",
    showCoverage: filter !== "zero-balance",
    showStopped: filter === "all",
    coverageItems: filter === "high-priority" ? highPriority : analysis.coverageGaps,
  };
}
