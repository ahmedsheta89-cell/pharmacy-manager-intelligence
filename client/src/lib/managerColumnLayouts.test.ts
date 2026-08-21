import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteManagerColumnLayout, isCompatibleManagerLayout, loadManagerColumnLayouts, managerLayoutPatch, saveManagerColumnLayout } from "./managerColumnLayouts";
import type { SheetEditorConfig } from "./pharmacyEngine";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const editorConfig = {
  headerOverrides: { 1: "كود الصنف", 2: "اسم الصنف" },
  ignoredColumnIndexes: [0, 7],
} as SheetEditorConfig;

describe("manager column layouts", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("يحفظ ترتيب المدير محليًا من دون أي محتوى ملف ويعيد تطبيق نسخة مستقلة منه", () => {
    const saved = saveManagerColumnLayout("مدير فرع المعادي", 8, editorConfig);
    const loaded = loadManagerColumnLayouts();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ managerName: "مدير فرع المعادي", sourceColumnCount: 8, headerOverrides: editorConfig.headerOverrides, ignoredColumnIndexes: [0, 7] });
    expect(JSON.stringify(loaded[0])).not.toContain("rawRecords");
    expect(JSON.stringify(loaded[0])).not.toContain("cellOverrides");

    const patch = managerLayoutPatch(saved);
    patch.headerOverrides[1] = "عنوان مختلف";
    patch.ignoredColumnIndexes.push(4);
    expect(saved.headerOverrides[1]).toBe("كود الصنف");
    expect(saved.ignoredColumnIndexes).toEqual([0, 7]);
  });

  it("يستبدل الترتيب السابق للاسم نفسه، ويمنع اختلاف عدد الأعمدة، ويتيح الحذف", () => {
    const first = saveManagerColumnLayout("مدير فرع مدينة نصر", 8, editorConfig);
    const replacement = saveManagerColumnLayout("مدير فرع مدينة نصر", 8, { ...editorConfig, headerOverrides: { 1: "اسم الصنف" } });

    expect(loadManagerColumnLayouts()).toHaveLength(1);
    expect(first.id).not.toBe(replacement.id);
    expect(isCompatibleManagerLayout(replacement, 8)).toBe(true);
    expect(isCompatibleManagerLayout(replacement, 9)).toBe(false);

    deleteManagerColumnLayout(replacement.id);
    expect(loadManagerColumnLayouts()).toEqual([]);
  });

  it("يتطلب اسمًا واضحًا قبل حفظ الترتيب", () => {
    expect(() => saveManagerColumnLayout("   ", 8, editorConfig)).toThrow("اكتب اسم المدير أولًا لحفظ الترتيب.");
  });
});
