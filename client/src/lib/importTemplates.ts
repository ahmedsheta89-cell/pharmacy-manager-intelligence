/** قوالب استيراد محلية: تحفظ الإعدادات الوصفية فقط، لا الملفات أو السجلات. */
export const importTemplatesStorageKey = "pmi-import-templates-v1";
const TEMPLATE_LIMIT = 10;

export type ImportTemplateAssignment = { fileName: string; month: number };
export type ImportTemplate = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assignments: ImportTemplateAssignment[];
  expectsPriceFile: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(storage?: StorageLike) {
  if (storage) return storage;
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

function normalizeAssignments(value: unknown): ImportTemplateAssignment[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const fileName = String((entry as ImportTemplateAssignment)?.fileName ?? "").trim();
    const month = Number((entry as ImportTemplateAssignment)?.month);
    const key = fileName.toLocaleLowerCase("ar-EG");
    if (!fileName || !Number.isInteger(month) || month < 1 || month > 12 || seen.has(key)) return [];
    seen.add(key);
    return [{ fileName, month }];
  }).slice(0, 12);
}

function parseTemplates(raw: string | null): ImportTemplate[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as ImportTemplate[];
    if (!Array.isArray(value)) return [];
    return value.flatMap((template) => {
      const name = String(template?.name ?? "").trim();
      const assignments = normalizeAssignments(template?.assignments);
      if (!name || !assignments.length) return [];
      return [{ id: String(template.id || `${name}-${template.updatedAt || "local"}`), name, createdAt: template.createdAt || new Date().toISOString(), updatedAt: template.updatedAt || template.createdAt || new Date().toISOString(), assignments, expectsPriceFile: Boolean(template.expectsPriceFile) }];
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch { return []; }
}

export function loadImportTemplates(storage?: StorageLike): ImportTemplate[] {
  try { return parseTemplates(getStorage(storage)?.getItem(importTemplatesStorageKey) ?? null); } catch { return []; }
}

export function saveImportTemplate(input: Pick<ImportTemplate, "name" | "assignments" | "expectsPriceFile">, storage?: StorageLike): ImportTemplate[] {
  const target = getStorage(storage);
  const name = input.name.trim().slice(0, 48);
  const assignments = normalizeAssignments(input.assignments);
  if (!target || !name || !assignments.length) return loadImportTemplates(target);
  const previous = loadImportTemplates(target);
  const now = new Date().toISOString();
  const existing = previous.find((template) => template.name.toLocaleLowerCase("ar-EG") === name.toLocaleLowerCase("ar-EG"));
  const template: ImportTemplate = { id: existing?.id ?? `template-${Date.now().toString(36)}`, name, createdAt: existing?.createdAt ?? now, updatedAt: now, assignments, expectsPriceFile: input.expectsPriceFile };
  const templates = [template, ...previous.filter((item) => item.id !== template.id)].slice(0, TEMPLATE_LIMIT);
  try { target.setItem(importTemplatesStorageKey, JSON.stringify(templates)); } catch { return previous; }
  return templates;
}

export function deleteImportTemplate(id: string, storage?: StorageLike): ImportTemplate[] {
  const target = getStorage(storage);
  const templates = loadImportTemplates(target).filter((template) => template.id !== id);
  try { target?.setItem(importTemplatesStorageKey, JSON.stringify(templates)); } catch { /* يبقى الحذف في الواجهة فقط. */ }
  return templates;
}
