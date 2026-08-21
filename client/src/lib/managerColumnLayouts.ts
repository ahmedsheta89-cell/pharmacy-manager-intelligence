import type { SheetEditorConfig } from "./pharmacyEngine";

const STORAGE_KEY = "pharmacy-manager-column-layouts-v1";

export type ManagerColumnLayout = {
  id: string;
  managerName: string;
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

export function saveManagerColumnLayout(managerName: string, sourceColumnCount: number, config: SheetEditorConfig): ManagerColumnLayout {
  const cleanName = managerName.trim();
  if (!cleanName) throw new Error("اكتب اسم المدير أولًا لحفظ الترتيب.");
  const now = Date.now();
  const layout: ManagerColumnLayout = {
    id: `manager-layout-${now}-${Math.random().toString(36).slice(2, 8)}`,
    managerName: cleanName,
    savedAt: now,
    sourceColumnCount,
    headerOverrides: { ...config.headerOverrides },
    ignoredColumnIndexes: [...config.ignoredColumnIndexes],
  };
  const previous = loadManagerColumnLayouts().filter((entry) => entry.managerName.trim().toLocaleLowerCase("ar") !== cleanName.toLocaleLowerCase("ar"));
  saveAll([layout, ...previous].slice(0, 20));
  return layout;
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
