import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearManagerColumnLayoutUsage, getBranchLayoutUsageSummaries, loadManagerColumnLayoutUsage, recordManagerColumnLayoutUse } from "./managerColumnLayoutUsage";
import { saveManagerColumnLayout, setSuggestedManagerLayoutForBranch, updateManagerColumnLayoutMetadata } from "./managerColumnLayouts";
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
  headerOverrides: { 1: "كود الصنف" },
  ignoredColumnIndexes: [0],
} as SheetEditorConfig;

describe("manager layout usage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("يسجل التطبيق اليدوي ويعرض الأكثر استخدامًا لكل فرع من دون محتوى Excel", () => {
    const morning = saveManagerColumnLayout("مدير المعادي", 8, editorConfig, "جرد الصباح");
    const evening = saveManagerColumnLayout("مدير المعادي", 8, editorConfig, "جرد المساء");
    updateManagerColumnLayoutMetadata(morning.id, { branchName: "فرع المعادي", tags: [] });
    updateManagerColumnLayoutMetadata(evening.id, { branchName: "فرع المعادي", tags: [] });
    setSuggestedManagerLayoutForBranch(evening.id, "فرع المعادي");

    recordManagerColumnLayoutUse(morning, "فرع المعادي");
    recordManagerColumnLayoutUse(morning, "فرع المعادي");
    recordManagerColumnLayoutUse(evening, "فرع المعادي");

    const usage = loadManagerColumnLayoutUsage();
    const summaries = getBranchLayoutUsageSummaries([
      { ...morning, branchName: "فرع المعادي" },
      { ...evening, branchName: "فرع المعادي", isBranchSuggested: true },
    ], usage);

    expect(usage).toHaveLength(3);
    expect(summaries).toMatchObject([{ branchName: "فرع المعادي", totalUses: 3, topLayout: { layoutId: morning.id, uses: 2 }, suggestedLayoutId: evening.id }]);
    expect(JSON.stringify(usage)).not.toContain("rawRecords");
    expect(JSON.stringify(usage)).not.toContain("headerOverrides");

    clearManagerColumnLayoutUsage();
    expect(loadManagerColumnLayoutUsage()).toEqual([]);
  });
});
