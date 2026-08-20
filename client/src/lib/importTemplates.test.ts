import { describe, expect, it } from "vitest";
import { deleteImportTemplate, importTemplatesStorageKey, loadImportTemplates, saveImportTemplate } from "./importTemplates";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("قوالب الاستيراد المحلية", () => {
  it("تحفظ تعيينات أسماء الملفات والأشهر فقط وتسمح بتطبيق القالب وحذفه", () => {
    const storage = new MemoryStorage();
    const saved = saveImportTemplate({
      name: "دورة صيف 2026",
      assignments: [{ fileName: "يونيو.xlsx", month: 6 }, { fileName: "يوليو.xlsx", month: 7 }],
      expectsPriceFile: true,
    }, storage);

    expect(saved).toHaveLength(1);
    expect(loadImportTemplates(storage)[0]).toMatchObject({ name: "دورة صيف 2026", expectsPriceFile: true, assignments: [{ fileName: "يونيو.xlsx", month: 6 }, { fileName: "يوليو.xlsx", month: 7 }] });
    const persisted = storage.getItem(importTemplatesStorageKey) ?? "";
    expect(persisted).not.toContain("base64");
    expect(persisted).not.toContain("ArrayBuffer");
    expect(deleteImportTemplate(saved[0].id, storage)).toEqual([]);
  });
});
