/**
 * قوالب خريطة الأعمدة محلية بالكامل. تحفظ البنية وقرارات الحقول فقط؛ لا تحفظ
 * صفوف Excel أو قيم الأصناف أو محتوى الملف.
 */
import type { WorkbookStructureReview } from "./excelInspector";
import type { CanonicalField, ImportInspection, SheetEditorConfig, SheetInspection } from "./pharmacyEngine";

export const columnMapTemplatesStorageKey = "pmi-column-map-templates-v1";
const TEMPLATE_LIMIT = 10;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type ColumnMapTemplateMapping = {
  dataColumn?: string;
  headerColumn?: string;
  headerTitle: string;
  field: CanonicalField | "unknown";
  decision: "suggested" | "approved" | "overridden" | "ignored";
  adjustedForHeaderShift: boolean;
};

export type ColumnMapTemplateHeader = {
  position: number;
  letter: string;
  title: string;
};

export type ColumnMapTemplateSheet = {
  name: string;
  headerRowIndex: number;
  headerDataOffset: number;
  columnCount: number;
  headerOrder: ColumnMapTemplateHeader[];
  mappings: ColumnMapTemplateMapping[];
  removedHeaders: Array<{ headerColumn: string; title: string }>;
  editorConfig?: Pick<SheetEditorConfig, "headerRowIndex" | "dataStartRowIndex" | "firstDataColumnIndex" | "lastDataRowIndex" | "lastDataColumnIndex" | "excludedRowNumbers" | "textTransforms">;
};

export type ColumnMapTemplate = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sheets: ColumnMapTemplateSheet[];
};

export type ColumnOrderDifference = {
  kind: "column_count" | "header_order" | "offset_rule" | "sheet_missing";
  sheetName: string;
  position?: number;
  expected?: ColumnMapTemplateHeader;
  found?: ColumnMapTemplateHeader;
  message: string;
};

export type ColumnMapTemplateCompatibility = {
  template: ColumnMapTemplate;
  compatible: boolean;
  differences: ColumnOrderDifference[];
};

export type ColumnMapReviewStage = "column-map-warning" | "review";

/** يختار المسار الآمن: لا يصل الملف المختلف إلى مركز المراجعة قبل إقرار المدير بالتحذير. */
export function columnMapReviewStage(compatibility: ColumnMapTemplateCompatibility | null): ColumnMapReviewStage {
  return compatibility && !compatibility.compatible ? "column-map-warning" : "review";
}

function getStorage(storage?: StorageLike) {
  if (storage) return storage;
  try { return typeof localStorage === "undefined" ? undefined : localStorage; } catch { return undefined; }
}

function toColumnLetter(index: number) {
  let number = index + 1;
  let output = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    number = Math.floor((number - 1) / 26);
  }
  return output;
}

function normalizedHeader(value: unknown) {
  return String(value ?? "")
    .replace(/[ـ\u064B-\u065F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ar-EG");
}

function normalizeMappings(value: unknown): ColumnMapTemplateMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = entry as Partial<ColumnMapTemplateMapping>;
    const field = String(item.field ?? "unknown") as CanonicalField | "unknown";
    const decision: ColumnMapTemplateMapping["decision"] = item.decision === "approved" || item.decision === "overridden" || item.decision === "ignored" ? item.decision : "suggested";
    const headerTitle = String(item.headerTitle ?? "").trim();
    if (!item.dataColumn && !headerTitle) return [];
    return [{ dataColumn: item.dataColumn ? String(item.dataColumn) : undefined, headerColumn: item.headerColumn ? String(item.headerColumn) : undefined, headerTitle, field, decision, adjustedForHeaderShift: Boolean(item.adjustedForHeaderShift) }];
  }).slice(0, 80);
}

function normalizeHeaders(value: unknown): ColumnMapTemplateHeader[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    const item = entry as Partial<ColumnMapTemplateHeader>;
    const title = String(item.title ?? "").trim();
    const position = Number.isInteger(item.position) && Number(item.position) >= 0 ? Number(item.position) : index;
    if (!title && !item.letter) return [];
    return [{ position, letter: String(item.letter ?? toColumnLetter(position)), title }];
  }).slice(0, 120);
}

function normalizeSheets(value: unknown): ColumnMapTemplateSheet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const sheet = entry as Partial<ColumnMapTemplateSheet>;
    const name = String(sheet.name ?? "").trim();
    const headerOrder = normalizeHeaders(sheet.headerOrder);
    if (!name || !headerOrder.length) return [];
    const removedHeaders = Array.isArray(sheet.removedHeaders) ? sheet.removedHeaders.flatMap((header) => {
      const value = header as { headerColumn?: unknown; title?: unknown };
      const headerColumn = String(value.headerColumn ?? "").trim();
      const title = String(value.title ?? "").trim();
      return headerColumn && title ? [{ headerColumn, title }] : [];
    }) : [];
    const editor = sheet.editorConfig as Partial<SheetEditorConfig> | undefined;
    const editorConfig = editor && Number.isInteger(editor.headerRowIndex) && Number.isInteger(editor.dataStartRowIndex) && Number.isInteger(editor.firstDataColumnIndex)
      ? {
          headerRowIndex: Math.max(0, Number(editor.headerRowIndex)),
          dataStartRowIndex: Math.max(0, Number(editor.dataStartRowIndex)),
          firstDataColumnIndex: Math.max(0, Number(editor.firstDataColumnIndex)),
          lastDataRowIndex: Math.max(0, Number.isInteger(editor.lastDataRowIndex) ? Number(editor.lastDataRowIndex) : Number(editor.dataStartRowIndex)),
          lastDataColumnIndex: Math.max(0, Number.isInteger(editor.lastDataColumnIndex) ? Number(editor.lastDataColumnIndex) : Number(editor.firstDataColumnIndex)),
          excludedRowNumbers: Array.from(new Set((Array.isArray(editor.excludedRowNumbers) ? editor.excludedRowNumbers : []).map((item) => Math.trunc(Number(item))).filter((item) => item > 0))).sort((a, b) => a - b).slice(0, 500),
          textTransforms: (Array.isArray(editor.textTransforms) ? editor.textTransforms : []).flatMap<SheetEditorConfig["textTransforms"][number]>((transform, index) => {
            const item = transform as SheetEditorConfig["textTransforms"][number];
            const id = String(item?.id ?? `template-transform-${index + 1}`).trim();
            const target = String(item?.target ?? "").trim().slice(0, 80);
            const separator = String(item?.separator ?? " ").slice(0, 20);
            if (!id || !target) return [];
            if (item.type === "merge") {
              const sources = Array.from(new Set((item.sources ?? []).map((source) => String(source).trim()).filter(Boolean))).slice(0, 6);
              return sources.length >= 2 ? [{ id, type: "merge" as const, sources, target, separator }] : [];
            }
            const source = String(item.source ?? "").trim();
            const parts = Math.min(6, Math.max(2, Math.trunc(Number(item.parts) || 2)));
            return source ? [{ id, type: "split" as const, source, target, separator, parts }] : [];
          }).slice(0, 20),
        }
      : undefined;
    return [{
      name,
      headerRowIndex: Math.max(0, Number(sheet.headerRowIndex) || 0),
      headerDataOffset: Number(sheet.headerDataOffset) || 0,
      columnCount: Math.max(headerOrder.length, Number(sheet.columnCount) || 0),
      headerOrder,
      mappings: normalizeMappings(sheet.mappings),
      removedHeaders,
      editorConfig,
    }];
  }).slice(0, 20);
}

function parseTemplates(raw: string | null): ColumnMapTemplate[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as ColumnMapTemplate[];
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      const name = String(entry?.name ?? "").trim();
      const sheets = normalizeSheets(entry?.sheets);
      if (!name || !sheets.length) return [];
      const now = new Date().toISOString();
      return [{ id: String(entry.id || `column-map-${name}`), name, createdAt: entry.createdAt || now, updatedAt: entry.updatedAt || entry.createdAt || now, sheets }];
    }).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  } catch { return []; }
}

function structureHeaders(sheet: SheetInspection, structure?: WorkbookStructureReview): ColumnMapTemplateHeader[] {
  const structural = structure?.sheets.find((item) => item.name === sheet.name);
  if (structural?.columns.length) return structural.columns.map((column) => ({ position: column.index, letter: column.letter, title: column.rawHeader }));
  return sheet.headers.map((title, position) => ({ position, letter: toColumnLetter(position), title }));
}

function serializeSheet(sheet: SheetInspection, structure?: WorkbookStructureReview): ColumnMapTemplateSheet {
  return {
    name: sheet.name,
    headerRowIndex: sheet.headerRowIndex,
    headerDataOffset: sheet.headerDataOffset,
    columnCount: sheet.columns,
    headerOrder: structureHeaders(sheet, structure),
    mappings: sheet.mappings.map((mapping) => ({
      dataColumn: mapping.dataColumn,
      headerColumn: mapping.headerColumn,
      headerTitle: mapping.sourceColumn,
      field: mapping.field,
      decision: mapping.approvalStatus ?? "suggested",
      adjustedForHeaderShift: Boolean(mapping.adjustedForHeaderShift),
    })),
    removedHeaders: (sheet.removedHeaders ?? []).map((header) => ({ headerColumn: header.headerColumn, title: header.title })),
    editorConfig: sheet.editorConfig ? {
      headerRowIndex: sheet.editorConfig.headerRowIndex,
      dataStartRowIndex: sheet.editorConfig.dataStartRowIndex,
      firstDataColumnIndex: sheet.editorConfig.firstDataColumnIndex,
      lastDataRowIndex: sheet.editorConfig.lastDataRowIndex,
      lastDataColumnIndex: sheet.editorConfig.lastDataColumnIndex,
      excludedRowNumbers: sheet.editorConfig.excludedRowNumbers,
      textTransforms: sheet.editorConfig.textTransforms,
    } : undefined,
  };
}

export function createColumnMapTemplate(name: string, inspection: ImportInspection, structure?: WorkbookStructureReview | null): Omit<ColumnMapTemplate, "id" | "createdAt" | "updatedAt"> {
  return { name: name.trim(), sheets: inspection.sheets.map((sheet) => serializeSheet(sheet, structure ?? undefined)) };
}

export function loadColumnMapTemplates(storage?: StorageLike): ColumnMapTemplate[] {
  try { return parseTemplates(getStorage(storage)?.getItem(columnMapTemplatesStorageKey) ?? null); } catch { return []; }
}

export function saveColumnMapTemplate(input: Omit<ColumnMapTemplate, "id" | "createdAt" | "updatedAt">, storage?: StorageLike): ColumnMapTemplate[] {
  const target = getStorage(storage);
  const name = input.name.trim().slice(0, 48);
  const sheets = normalizeSheets(input.sheets);
  if (!target || !name || !sheets.length) return loadColumnMapTemplates(target);
  const previous = loadColumnMapTemplates(target);
  const now = new Date().toISOString();
  const existing = previous.find((template) => template.name.toLocaleLowerCase("ar-EG") === name.toLocaleLowerCase("ar-EG"));
  const template: ColumnMapTemplate = { id: existing?.id ?? `column-map-${Date.now().toString(36)}`, name, createdAt: existing?.createdAt ?? now, updatedAt: now, sheets };
  const templates = [template, ...previous.filter((item) => item.id !== template.id)].slice(0, TEMPLATE_LIMIT);
  try { target.setItem(columnMapTemplatesStorageKey, JSON.stringify(templates)); } catch { return previous; }
  return templates;
}

export function deleteColumnMapTemplate(id: string, storage?: StorageLike): ColumnMapTemplate[] {
  const target = getStorage(storage);
  const templates = loadColumnMapTemplates(target).filter((template) => template.id !== id);
  try { target?.setItem(columnMapTemplatesStorageKey, JSON.stringify(templates)); } catch { /* لا يجب أن يمنع الحذف المحلي استمرار المراجعة. */ }
  return templates;
}

function candidateHeaders(sheet: SheetInspection, structure?: WorkbookStructureReview | null): ColumnMapTemplateHeader[] {
  return structureHeaders(sheet, structure ?? undefined);
}

export function compareColumnMapTemplate(template: ColumnMapTemplate, inspection: ImportInspection, structure?: WorkbookStructureReview | null): ColumnMapTemplateCompatibility {
  const differences: ColumnOrderDifference[] = [];
  for (const expectedSheet of template.sheets) {
    const foundSheet = inspection.sheets.find((sheet) => sheet.name === expectedSheet.name) ?? inspection.sheets[template.sheets.indexOf(expectedSheet)];
    if (!foundSheet) {
      differences.push({ kind: "sheet_missing", sheetName: expectedSheet.name, message: `لم يُعثر على الشيت «${expectedSheet.name}» الموجود في القالب.` });
      continue;
    }
    const foundHeaders = candidateHeaders(foundSheet, structure);
    if (expectedSheet.columnCount !== foundSheet.columns || expectedSheet.headerOrder.length !== foundHeaders.length) {
      differences.push({ kind: "column_count", sheetName: foundSheet.name, message: `عدد الأعمدة في «${foundSheet.name}» تغيّر: القالب يتوقع ${expectedSheet.columnCount} والملف يحتوي ${foundSheet.columns}.` });
    }
    const limit = Math.max(expectedSheet.headerOrder.length, foundHeaders.length);
    for (let position = 0; position < limit; position += 1) {
      const expected = expectedSheet.headerOrder[position];
      const found = foundHeaders[position];
      if (normalizedHeader(expected?.title) !== normalizedHeader(found?.title)) {
        differences.push({ kind: "header_order", sheetName: foundSheet.name, position, expected, found, message: `موضع ${toColumnLetter(position)}: المتوقع «${expected?.title || "—"}» والموجود «${found?.title || "—"}».` });
      }
    }
    if (expectedSheet.headerDataOffset !== foundSheet.headerDataOffset) {
      differences.push({ kind: "offset_rule", sheetName: foundSheet.name, message: `قاعدة انزياح الرأس تغيّرت في «${foundSheet.name}»: القالب ${expectedSheet.headerDataOffset} والملف ${foundSheet.headerDataOffset}.` });
    }
  }
  return { template, compatible: differences.length === 0, differences };
}

export function findColumnMapTemplateCompatibility(templates: ColumnMapTemplate[], inspection: ImportInspection, structure?: WorkbookStructureReview | null): ColumnMapTemplateCompatibility | null {
  if (!templates.length) return null;
  const results = templates.map((template) => compareColumnMapTemplate(template, inspection, structure));
  return results.find((result) => result.compatible) ?? results.sort((first, second) => first.differences.length - second.differences.length)[0] ?? null;
}
