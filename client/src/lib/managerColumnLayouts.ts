import type { SheetEditorConfig } from "./pharmacyEngine";

const STORAGE_KEY = "pharmacy-manager-column-layouts-v1";

export const MANAGER_LAYOUT_TAG_COLORS = ["green", "gold", "blue", "rose", "purple"] as const;
export type ManagerLayoutTagColor = (typeof MANAGER_LAYOUT_TAG_COLORS)[number];

export type ManagerLayoutTag = {
  id: string;
  label: string;
  color: ManagerLayoutTagColor;
};

export type ManagerColumnLayout = {
  id: string;
  managerName: string;
  layoutName?: string;
  description?: string;
  tags?: ManagerLayoutTag[];
  branchName?: string;
  isBranchSuggested?: boolean;
  savedAt: number;
  sourceColumnCount: number;
  headerOverrides: Record<number, string>;
  ignoredColumnIndexes: number[];
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadManagerColumnLayouts(): ManagerColumnLayout[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is ManagerColumnLayout => Boolean(entry && typeof entry.id === "string" && typeof entry.managerName === "string"))
      : [];
  } catch {
    return [];
  }
}

function saveAll(layouts: ManagerColumnLayout[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
}

export function saveManagerColumnLayout(managerName: string, sourceColumnCount: number, config: SheetEditorConfig, layoutName = "", description = ""): ManagerColumnLayout {
  const cleanName = managerName.trim();
  if (!cleanName) throw new Error("اكتب اسم المدير أولًا لحفظ الترتيب.");
  const cleanLayoutName = layoutName.trim();
  const cleanDescription = description.trim();
  const now = Date.now();
  const layout: ManagerColumnLayout = {
    id: `manager-layout-${now}-${Math.random().toString(36).slice(2, 8)}`,
    managerName: cleanName,
    ...(cleanLayoutName ? { layoutName: cleanLayoutName } : {}),
    ...(cleanDescription ? { description: cleanDescription } : {}),
    savedAt: now,
    sourceColumnCount,
    headerOverrides: { ...config.headerOverrides },
    ignoredColumnIndexes: [...config.ignoredColumnIndexes],
  };
  const previous = loadManagerColumnLayouts().filter((entry) => {
    const sameManager = entry.managerName.trim().toLocaleLowerCase("ar") === cleanName.toLocaleLowerCase("ar");
    const sameLayoutName = (entry.layoutName ?? "").trim().toLocaleLowerCase("ar") === cleanLayoutName.toLocaleLowerCase("ar");
    return !(sameManager && sameLayoutName);
  });
  saveAll([layout, ...previous].slice(0, 20));
  return layout;
}

export function updateManagerColumnLayoutMetadata(
  id: string,
  metadata: Pick<ManagerColumnLayout, "tags" | "branchName">,
): ManagerColumnLayout | null {
  const cleanBranchName = metadata.branchName?.trim() || undefined;
  const cleanedTags = (metadata.tags ?? [])
    .map((tag) => ({
      id: tag.id || `layout-tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: tag.label.trim(),
      color: MANAGER_LAYOUT_TAG_COLORS.includes(tag.color) ? tag.color : "green",
    }))
    .filter((tag) => Boolean(tag.label))
    .slice(0, 5);
  let updated: ManagerColumnLayout | null = null;
  const layouts = loadManagerColumnLayouts().map((layout) => {
    if (layout.id !== id) return layout;
    updated = {
      ...layout,
      ...(cleanBranchName ? { branchName: cleanBranchName } : {}),
      ...(cleanBranchName ? {} : { branchName: undefined, isBranchSuggested: false }),
      tags: cleanedTags,
    };
    return updated;
  });
  saveAll(layouts);
  return updated;
}

export function setSuggestedManagerLayoutForBranch(id: string, branchName: string): ManagerColumnLayout | null {
  const cleanBranchName = branchName.trim();
  if (!cleanBranchName) throw new Error("اكتب اسم الفرع أولًا لتعيين ترتيب مقترح.");
  let updated: ManagerColumnLayout | null = null;
  const layouts = loadManagerColumnLayouts().map((layout) => {
    const belongsToBranch = layout.branchName?.trim().toLocaleLowerCase("ar") === cleanBranchName.toLocaleLowerCase("ar");
    if (layout.id === id) {
      updated = { ...layout, branchName: cleanBranchName, isBranchSuggested: true };
      return updated;
    }
    if (belongsToBranch && layout.isBranchSuggested) return { ...layout, isBranchSuggested: false };
    return layout;
  });
  saveAll(layouts);
  return updated;
}

export function getSuggestedManagerLayoutForBranch(branchName: string): ManagerColumnLayout | null {
  const cleanBranchName = branchName.trim().toLocaleLowerCase("ar");
  if (!cleanBranchName) return null;
  return loadManagerColumnLayouts().find(
    (layout) => layout.isBranchSuggested && layout.branchName?.trim().toLocaleLowerCase("ar") === cleanBranchName,
  ) ?? null;
}

export function deleteManagerColumnLayout(id: string) {
  saveAll(loadManagerColumnLayouts().filter((entry) => entry.id !== id));
}

export function isCompatibleManagerLayout(layout: ManagerColumnLayout, sourceColumnCount: number) {
  return layout.sourceColumnCount === sourceColumnCount;
}

export function managerLayoutPatch(layout: ManagerColumnLayout): Pick<SheetEditorConfig, "headerOverrides" | "ignoredColumnIndexes"> {
  return {
    headerOverrides: { ...layout.headerOverrides },
    ignoredColumnIndexes: [...layout.ignoredColumnIndexes],
  };
}
