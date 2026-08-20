import { inspectPharmacyFile, refreshImportedInspection, toNumber, type CanonicalField, type CleanRecord, type ColumnMapping, type ImportInspection, type SheetInspection } from "./pharmacyEngine";
import { isApprovedMapping } from "./importReview";

export type ImportedMonth = { fileName: string; label: string; month: number; rows: number; source: "اسم الملف" | "اختيار يدوي" };
export type PriceMatchItem = { itemCode?: string; itemName?: string; occurrences: number; reason: "غير موجود في ملف الأسعار" | "لا كود ولا اسم صالح للمطابقة" };
export type PriceMatchReport = {
  priceFileName: string;
  totalPriceRows: number;
  baseRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
  matchRate: number;
  matchedByCode: number;
  matchedByName: number;
  unmatchedUniqueItems: number;
  unmatchedItems: PriceMatchItem[];
  unusedPriceRows: number;
  unusedPriceItems: PriceMatchItem[];
  hasPurchasePrices: boolean;
  hasPublicPrices: boolean;
};

const ARABIC_MONTHS: Record<string, number> = { "يناير": 1, "فبراير": 2, "مارس": 3, "ابريل": 4, "أبريل": 4, "مايو": 5, "يونيو": 6, "يوليو": 7, "اغسطس": 8, "أغسطس": 8, "سبتمبر": 9, "اكتوبر": 10, "أكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12 };
const ENGLISH_MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const monthLabel = (month: number) => `الشهر ${month}`;

function normalized(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^a-z0-9\u0621-\u064a]+/g, "").trim();
}

export function monthFromFileName(fileName: string): number | undefined {
  const name = fileName.replace(/\.[^.]+$/, "").toLowerCase();
  for (const [label, month] of Object.entries(ARABIC_MONTHS)) if (name.includes(label)) return month;
  for (const [label, month] of Object.entries(ENGLISH_MONTHS)) if (name.includes(label)) return month;
  const match = name.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)/);
  return match ? Number(match[1]) : undefined;
}

export function resolveMonthlyAssignments(fileNames: string[], manualMonths: Array<number | undefined> = []): Array<{ month: number; source: "اسم الملف" | "اختيار يدوي" }> {
  const resolved = fileNames.map((fileName, index) => {
    const inferred = monthFromFileName(fileName);
    const manual = manualMonths[index];
    const month = manual ?? inferred;
    if (!month || !Number.isInteger(month) || month < 1 || month > 12) throw new Error(`تعذر تحديد الشهر من اسم: ${fileName}. اختر الشهر يدويًا قبل المتابعة.`);
    return { month, source: manual ? "اختيار يدوي" as const : "اسم الملف" as const };
  });
  const duplicate = resolved.map((entry) => entry.month).filter((month, index, values) => values.indexOf(month) !== index);
  if (duplicate.length) throw new Error(`يوجد أكثر من ملف للشهر ${duplicate[0]}. اختر ملفًا واحدًا لكل شهر حتى تكون المقارنة موثقة.`);
  return resolved;
}

function fieldMap(mappings: ColumnMapping[]) {
  return mappings.reduce((result, mapping) => {
    if (mapping.field !== "unknown" && isApprovedMapping(mapping) && !result[mapping.field]) result[mapping.field] = mapping.sourceColumn;
    return result;
  }, {} as Partial<Record<CanonicalField, string>>);
}

function cloneForMonth(sheet: SheetInspection, label: string): SheetInspection {
  return { ...sheet, name: label, cleanRecords: sheet.cleanRecords.map((record) => ({ ...record, __sheetName: label })) };
}

export async function inspectMonthlyFiles(files: File[], manualMonths: Array<number | undefined> = []): Promise<{ inspection: ImportInspection; months: ImportedMonth[] }> {
  if (files.length < 2) throw new Error("اختر ملفين شهريين على الأقل لتفعيل المقارنة الشهرية.");
  const resolved = resolveMonthlyAssignments(files.map((file) => file.name), manualMonths).map((assignment, index) => ({ file: files[index], ...assignment }));
  const imports = await Promise.all(resolved.map(async (entry) => ({ entry, result: await inspectPharmacyFile(entry.file) })));
  const sheets = imports.flatMap(({ entry, result }) => result.sheets.map((sheet) => cloneForMonth(sheet, monthLabel(entry.month as number))));
  const months = imports.map(({ entry, result }) => ({ fileName: entry.file.name, month: entry.month as number, label: monthLabel(entry.month as number), rows: result.sheets.reduce((sum, sheet) => sum + sheet.quality.validRecords, 0), source: entry.source })).sort((a, b) => a.month - b.month);
  const text = imports.map(({ entry, result }) => `${entry.file.name}:${result.fileFingerprint}`).join("|");
  return { inspection: { fileName: months.map((month) => month.fileName).join(" + "), fileType: "multiple-period-files", fileSize: files.reduce((sum, file) => sum + file.size, 0), sheets, fileFingerprint: `months-${btoa(text).replace(/[^a-z0-9]/gi, "").slice(0, 24)}`, detectedAt: new Date() }, months };
}

type PriceRow = { id: string; purchasePrice?: number; publicPrice?: number; itemCode?: string; itemName?: string };

function aggregateMatchItems(items: PriceMatchItem[]): PriceMatchItem[] {
  const grouped = new Map<string, PriceMatchItem>();
  for (const item of items) {
    const key = `${item.reason}|${normalized(item.itemCode)}|${normalized(item.itemName)}`;
    const previous = grouped.get(key);
    grouped.set(key, previous ? { ...previous, occurrences: previous.occurrences + item.occurrences } : item);
  }
  return Array.from(grouped.values()).sort((a, b) => b.occurrences - a.occurrences || (a.itemName ?? "").localeCompare(b.itemName ?? "", "ar"));
}

export function applyPriceFile(base: ImportInspection, priceSource: ImportInspection): { inspection: ImportInspection; report: PriceMatchReport } {
  const byCode = new Map<string, PriceRow>();
  const byName = new Map<string, PriceRow>();
  let totalPriceRows = 0;
  const priceRows: PriceRow[] = [];
  for (const sheet of priceSource.sheets) {
    const fields = fieldMap(sheet.mappings);
    const codeColumn = fields.item_code;
    const nameColumn = fields.item_name;
    const purchaseColumn = fields.cost_price;
    const publicColumn = fields.sale_price;
    for (const record of sheet.cleanRecords) {
      const purchasePrice = purchaseColumn ? toNumber(record[purchaseColumn] as never) : undefined;
      const publicPrice = publicColumn ? toNumber(record[publicColumn] as never) : undefined;
      if (purchasePrice === undefined && publicPrice === undefined) continue;
      totalPriceRows += 1;
      const row = { id: `price-${priceRows.length}`, purchasePrice, publicPrice, itemCode: String(codeColumn ? record[codeColumn] ?? "" : "").trim() || undefined, itemName: String(nameColumn ? record[nameColumn] ?? "" : "").trim() || undefined };
      priceRows.push(row);
      const code = normalized(codeColumn ? record[codeColumn] : "");
      const name = normalized(nameColumn ? record[nameColumn] : "");
      if (code) byCode.set(code, row);
      if (name) byName.set(name, row);
    }
  }
  if (!totalPriceRows) throw new Error("لم نجد أسعار شراء أو جمهور صالحة في ملف الأسعار. تأكد من وجود اسم أو كود الصنف مع أحد عمودي السعر.");
  let matchedRecords = 0; let unmatchedRecords = 0; let matchedByCode = 0; let matchedByName = 0; let baseRecords = 0;
  const unmatchedItems: PriceMatchItem[] = [];
  const usedPriceRowIds = new Set<string>();
  const sheets = base.sheets.map((sheet) => {
    const fields = fieldMap(sheet.mappings);
    const codeColumn = fields.item_code;
    const nameColumn = fields.item_name;
    const cleanRecords = sheet.cleanRecords.map((record) => {
      const code = normalized(codeColumn ? record[codeColumn] : "");
      const name = normalized(nameColumn ? record[nameColumn] : "");
      baseRecords += 1;
      const byCodeMatch = code && byCode.get(code);
      const match = byCodeMatch || (name && byName.get(name));
      if (!match) {
        unmatchedRecords += 1;
        unmatchedItems.push({ itemCode: String(codeColumn ? record[codeColumn] ?? "" : "").trim() || undefined, itemName: String(nameColumn ? record[nameColumn] ?? "" : "").trim() || undefined, occurrences: 1, reason: code || name ? "غير موجود في ملف الأسعار" : "لا كود ولا اسم صالح للمطابقة" });
        return record;
      }
      matchedRecords += 1;
      usedPriceRowIds.add(match.id);
      if (byCodeMatch) matchedByCode += 1; else matchedByName += 1;
      return { ...record, __priceFilePurchase: match.purchasePrice, __priceFilePublic: match.publicPrice } as CleanRecord;
    });
    return { ...sheet, cleanRecords };
  });
  const hasPurchasePrices = Array.from(byCode.values()).some((row) => row.purchasePrice !== undefined) || Array.from(byName.values()).some((row) => row.purchasePrice !== undefined);
  const hasPublicPrices = Array.from(byCode.values()).some((row) => row.publicPrice !== undefined) || Array.from(byName.values()).some((row) => row.publicPrice !== undefined);
  const unmatchedList = aggregateMatchItems(unmatchedItems);
  const unusedPriceItems = aggregateMatchItems(priceRows.filter((row) => !usedPriceRowIds.has(row.id)).map((row) => ({ itemCode: row.itemCode, itemName: row.itemName, occurrences: 1, reason: "غير موجود في ملف الأسعار" as const })));
  return { inspection: refreshImportedInspection({ ...base, sheets }), report: { priceFileName: priceSource.fileName, totalPriceRows, baseRecords, matchedRecords, unmatchedRecords, matchRate: baseRecords ? Math.round((matchedRecords / baseRecords) * 1000) / 10 : 0, matchedByCode, matchedByName, unmatchedUniqueItems: unmatchedList.length, unmatchedItems: unmatchedList.slice(0, 100), unusedPriceRows: priceRows.filter((row) => !usedPriceRowIds.has(row.id)).length, unusedPriceItems: unusedPriceItems.slice(0, 100), hasPurchasePrices, hasPublicPrices } };
}
