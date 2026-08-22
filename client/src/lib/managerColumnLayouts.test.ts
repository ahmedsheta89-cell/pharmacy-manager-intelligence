import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteManagerColumnLayout, getSuggestedManagerLayoutForBranch, isCompatibleManagerLayout, loadManagerColumnLayouts, managerLayoutPatch, saveManagerColumnLayout, setSuggestedManagerLayoutForBranch, updateManagerColumnLayoutMetadata } from "./managerColumnLayouts";
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

  it("يحفظ ترتيب المدير محليًا مع الاسم والوصف الاختياريين ومن دون أي محتوى ملف", () => {
    const saved = saveManagerColumnLayout("مدير فرع المعادي", 8, editorConfig, "جرد الصباح", "ترتيب مخصص لمراجعة بداية الوردية");
    const loaded = loadManagerColumnLayouts();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ managerName: "مدير فرع المعادي", layoutName: "جرد الصباح", description: "ترتيب مخصص لمراجعة بداية الوردية", sourceColumnCount: 8, headerOverrides: editorConfig.headerOverrides, ignoredColumnIndexes: [0, 7] });
    expect(JSON.stringify(loaded[0])).not.toContain("rawRecords");
    expect(JSON.stringify(loaded[0])).not.toContain("cellOverrides");

    const patch = managerLayoutPatch(saved);
    patch.headerOverrides[1] = "عنوان مختلف";
    patch.ignoredColumnIndexes.push(4);
    expect(saved.headerOverrides[1]).toBe("كود الصنف");
    expect(saved.ignoredColumnIndexes).toEqual([0, 7]);
  });

  it("يحتفظ بأكثر من ترتيب مسمى للمدير نفسه ويستبدل الترتيب ذي الاسم نفسه فقط", () => {
    const first = saveManagerColumnLayout("مدير فرع مدينة نصر", 8, editorConfig, "جرد الصباح");
    const secondary = saveManagerColumnLayout("مدير فرع مدينة نصر", 8, editorConfig, "جرد المساء");
    const replacement = saveManagerColumnLayout("مدير فرع مدينة نصر", 8, { ...editorConfig, headerOverrides: { 1: "اسم الصنف" } }, "جرد الصباح", "نسخة محدثة");

    expect(loadManagerColumnLayouts()).toHaveLength(2);
    expect(first.id).not.toBe(replacement.id);
    expect(loadManagerColumnLayouts().find((layout) => layout.id === replacement.id)?.description).toBe("نسخة محدثة");
    expect(isCompatibleManagerLayout(replacement, 8)).toBe(true);
    expect(isCompatibleManagerLayout(replacement, 9)).toBe(false);

    deleteManagerColumnLayout(replacement.id);
    expect(loadManagerColumnLayouts()).toEqual([secondary]);
  });

  it("يقرأ الترتيبات السابقة التي لا تحتوي اسمًا أو وصفًا إضافيين", () => {
    window.localStorage.setItem("pharmacy-manager-column-layouts-v1", JSON.stringify([{ id: "legacy", managerName: "مدير قديم", savedAt: 1, sourceColumnCount: 8, headerOverrides: {}, ignoredColumnIndexes: [] }]));
    expect(loadManagerColumnLayouts()).toMatchObject([{ id: "legacy", managerName: "مدير قديم" }]);
  });

  it("يتطلب اسمًا واضحًا قبل حفظ الترتيب", () => {
    expect(() => saveManagerColumnLayout("   ", 8, editorConfig)).toThrow("اكتب اسم المدير أولًا لحفظ الترتيب.");
  });

  it("ينظم الترتيبات بوسوم وفرع ويحافظ على ترتيب مقترح واحد يدوي لكل فرع", () => {
    const morning = saveManagerColumnLayout("مدير المعادي", 8, editorConfig, "جرد الصباح");
    const evening = saveManagerColumnLayout("مدير المعادي", 8, editorConfig, "جرد المساء");

    const organized = updateManagerColumnLayoutMetadata(morning.id, {
      branchName: "فرع المعادي",
      tags: [{ id: "stock", label: "مخزون", color: "gold" }, { id: "morning", label: "صباحي", color: "green" }],
    });
    expect(organized).toMatchObject({ branchName: "فرع المعادي", tags: [{ label: "مخزون", color: "gold" }, { label: "صباحي", color: "green" }] });

    const firstSuggestion = setSuggestedManagerLayoutForBranch(morning.id, "فرع المعادي");
    expect(firstSuggestion?.isBranchSuggested).toBe(true);
    expect(getSuggestedManagerLayoutForBranch("فرع المعادي")?.id).toBe(morning.id);

    const secondSuggestion = setSuggestedManagerLayoutForBranch(evening.id, "فرع المعادي");
    expect(secondSuggestion?.isBranchSuggested).toBe(true);
    expect(getSuggestedManagerLayoutForBranch("فرع المعادي")?.id).toBe(evening.id);
    expect(loadManagerColumnLayouts().find((layout) => layout.id === morning.id)?.isBranchSuggested).toBe(false);
    expect(JSON.stringify(loadManagerColumnLayouts())).not.toContain("rawRecords");
  });
});
