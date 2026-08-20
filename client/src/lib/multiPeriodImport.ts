import { inspectPharmacyFile, refreshImportedInspection, toNumber, type CanonicalField, type CleanRecord, type ColumnMapping, type ImportInspection, type SheetInspection } from "./pharmacyEngine";

export type ImportedMonth = { fileName: string; label: string; month: number; rows: number };
export type PriceMatchReport = { priceFileName: string; totalPriceRows: number; matchedRecords: number; unmatchedRecords: number; matchedByCode: number; matchedByName: number; hasPurchasePrices: boolean; hasPublicPrices: boolean };

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

function fieldMap(mappings: ColumnMapping[]) {
  return mappings.reduce((result, mapping) => {
    if (mapping.field !== "unknown" && mapping.confidence !== "منخفضة" && !result[mapping.field]) result[mapping.field] = mapping.sourceColumn;
    return result;
  }, {} as Partial<Record<CanonicalField, string>>);
}

function cloneForMonth(sheet: SheetInspection, label: string): SheetInspection {
  return { ...sheet, name: label, cleanRecords: sheet.cleanRecords.map((record) => ({ ...record, __sheetName: label })) };
}

export async function inspectMonthlyFiles(files: File[]): Promise<{ inspection: ImportInspection; months: ImportedMonth[] }> {
  if (files.length < 2) throw new Error("اختر ملفين شهريين على الأقل لتفعيل المقارنة الشهرية.");
  const resolved = files.map((file) => ({ file, month: monthFromFileName(file.name) }));
  const unnamed = resolved.filter((entry) => !entry.month);
  if (unnamed.length) throw new Error(`تعذر تحديد الشهر من اسم: ${unnamed.map((entry) => entry.file.name).join("، ")}. سمِّ الملفات مثل يونيو.xlsx أو 6.xlsx أو July.xlsx.`);
  const duplicate = resolved.map((entry) => entry.month as number).filter((month, index, values) => values.indexOf(month) !== index);
  if (duplicate.length) throw new Error(`يوجد أكثر من ملف للشهر ${duplicate[0]}. اختر ملفًا واحدًا لكل شهر حتى تكون المقارنة موثقة.`);
  const imports = await Promise.all(resolved.map(async (entry) => ({ entry, result: await inspectPharmacyFile(entry.file) })));
  const sheets = imports.flatMap(({ entry, result }) => result.sheets.map((sheet) => cloneForMonth(sheet, monthLabel(entry.month as number))));
  const months = imports.map(({ entry, result }) => ({ fileName: entry.file.name, month: entry.month as number, label: monthLabel(entry.month as number), rows: result.sheets.reduce((sum, sheet) => sum + sheet.quality.validRecords, 0) })).sort((a, b) => a.month - b.month);
  const text = imports.map(({ entry, result }) => `${entry.file.name}:${result.fileFingerprint}`).join("|");
  return { inspection: { fileName: months.map((month) => month.fileName).join(" + "), fileType: "multiple-period-files", fileSize: files.reduce((sum, file) => sum + file.size, 0), sheets, fileFingerprint: `months-${btoa(text).replace(/[^a-z0-9]/gi, "").slice(0, 24)}`, detectedAt: new Date() }, months };
}

type PriceRow = { purchasePrice?: number; publicPrice?: number };

export function applyPriceFile(base: ImportInspection, priceSource: ImportInspection): { inspection: ImportInspection; report: PriceMatchReport } {
  const byCode = new Map<string, PriceRow>();
  const byName = new Map<string, PriceRow>();
  let totalPriceRows = 0;
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
      const row = { purchasePrice, publicPrice };
      const code = normalized(codeColumn ? record[codeColumn] : "");
      const name = normalized(nameColumn ? record[nameColumn] : "");
      if (code) byCode.set(code, row);
      if (name) byName.set(name, row);
    }
  }
  if (!totalPriceRows) throw new Error("لم نجد أسعار شراء أو جمهور صالحة في ملف الأسعار. تأكد من وجود اسم أو كود الصنف مع أحد عمودي السعر.");
  let matchedRecords = 0; let unmatchedRecords = 0; let matchedByCode = 0; let matchedByName = 0;
  const sheets = base.sheets.map((sheet) => {
    const fields = fieldMap(sheet.mappings);
    const codeColumn = fields.item_code;
    const nameColumn = fields.item_name;
    const cleanRecords = sheet.cleanRecords.map((record) => {
      const code = normalized(codeColumn ? record[codeColumn] : "");
      const name = normalized(nameColumn ? record[nameColumn] : "");
      const match = (code && byCode.get(code)) || (name && byName.get(name));
      if (!match) { unmatchedRecords += 1; return record; }
      matchedRecords += 1;
      if (code && byCode.has(code)) matchedByCode += 1; else matchedByName += 1;
      return { ...record, __priceFilePurchase: match.purchasePrice, __priceFilePublic: match.publicPrice } as CleanRecord;
    });
    return { ...sheet, cleanRecords };
  });
  const hasPurchasePrices = Array.from(byCode.values()).some((row) => row.purchasePrice !== undefined) || Array.from(byName.values()).some((row) => row.purchasePrice !== undefined);
  const hasPublicPrices = Array.from(byCode.values()).some((row) => row.publicPrice !== undefined) || Array.from(byName.values()).some((row) => row.publicPrice !== undefined);
  return { inspection: refreshImportedInspection({ ...base, sheets }), report: { priceFileName: priceSource.fileName, totalPriceRows, matchedRecords, unmatchedRecords, matchedByCode, matchedByName, hasPurchasePrices, hasPublicPrices } };
}
