import type { ManagerColumnLayout } from "./managerColumnLayouts";

const STORAGE_KEY = "pharmacy-manager-column-layout-usage-v1";
const UNASSIGNED_BRANCH = "بلا فرع محدد";

export type ManagerColumnLayoutUsage = {
  id: string;
  layoutId: string;
  layoutName: string;
  managerName: string;
  branchName: string;
  usedAt: number;
};

export type BranchLayoutUsageSummary = {
  branchName: string;
  totalUses: number;
  topLayout: {
    layoutId: string;
    layoutName: string;
    managerName: string;
    uses: number;
  } | null;
  suggestedLayoutId?: string;
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function layoutDisplayName(layout: ManagerColumnLayout) {
  return layout.layoutName?.trim() || layout.managerName;
}

export function loadManagerColumnLayoutUsage(): ManagerColumnLayoutUsage[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is ManagerColumnLayoutUsage => Boolean(
        entry && typeof entry.id === "string" && typeof entry.layoutId === "string" && typeof entry.branchName === "string" && typeof entry.usedAt === "number",
      ))
      : [];
  } catch {
    return [];
  }
}

function saveAll(usage: ManagerColumnLayoutUsage[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

export function recordManagerColumnLayoutUse(layout: ManagerColumnLayout, branchName?: string): ManagerColumnLayoutUsage {
  const now = Date.now();
  const usage: ManagerColumnLayoutUsage = {
    id: `layout-use-${now}-${Math.random().toString(36).slice(2, 8)}`,
    layoutId: layout.id,
    layoutName: layoutDisplayName(layout),
    managerName: layout.managerName,
    branchName: branchName?.trim() || layout.branchName?.trim() || UNASSIGNED_BRANCH,
    usedAt: now,
  };
  saveAll([usage, ...loadManagerColumnLayoutUsage()].slice(0, 200));
  return usage;
}

export function getBranchLayoutUsageSummaries(layouts: ManagerColumnLayout[], usage = loadManagerColumnLayoutUsage()): BranchLayoutUsageSummary[] {
  const branchNames = new Map<string, string>();
  layouts.forEach((layout) => {
    const branchName = layout.branchName?.trim();
    if (branchName) branchNames.set(branchName.toLocaleLowerCase("ar"), branchName);
  });
  usage.forEach((item) => branchNames.set(item.branchName.toLocaleLowerCase("ar"), item.branchName));

  return Array.from(branchNames.entries()).map(([normalizedBranchName, branchName]) => {
    const branchUsage = usage.filter((item) => item.branchName.toLocaleLowerCase("ar") === normalizedBranchName);
    const totals = new Map<string, { layoutName: string; managerName: string; uses: number }>();
    branchUsage.forEach((item) => {
      const current = totals.get(item.layoutId) ?? { layoutName: item.layoutName, managerName: item.managerName, uses: 0 };
      totals.set(item.layoutId, { ...current, uses: current.uses + 1 });
    });
    const [topLayoutId, topLayout] = Array.from(totals.entries()).sort((first, second) => second[1].uses - first[1].uses || first[1].layoutName.localeCompare(second[1].layoutName, "ar"))[0] ?? [];
    const suggestedLayout = layouts.find((layout) => layout.isBranchSuggested && layout.branchName?.trim().toLocaleLowerCase("ar") === normalizedBranchName);
    return {
      branchName,
      totalUses: branchUsage.length,
      topLayout: topLayoutId && topLayout ? { layoutId: topLayoutId, ...topLayout } : null,
      ...(suggestedLayout ? { suggestedLayoutId: suggestedLayout.id } : {}),
    };
  }).sort((first, second) => second.totalUses - first.totalUses || first.branchName.localeCompare(second.branchName, "ar"));
}

export function clearManagerColumnLayoutUsage() {
  saveAll([]);
}
