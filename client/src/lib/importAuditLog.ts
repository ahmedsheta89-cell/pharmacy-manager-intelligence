/** سجل خفيف ومحلي لقرارات الاستيراد؛ لا يخزن صفوف الأصناف أو محتوى الملف. */
import * as XLSX from "xlsx";
import type { ImportInspection } from "./pharmacyEngine";
import type { WorkbookStructureReview } from "./excelInspector";
import { fieldArabicName } from "./pharmacyEngine";

const STORAGE_KEY = "pmi-import-audit-log-v1";
const MAX_AUDIT_RECORDS = 50;

export type ImportAuditRecord = {
  id: string;
  timestamp: string;
  fileName: string;
  fingerprint: string;
  sheets: Array<{
    name: string;
    rows: number;
    columns: number;
    headerRow: number;
    hiddenRows: number;
    hiddenColumns: number;
    mergedRanges: number;
    detectedTransformations: string[];
    mappings: Array<{
      column: string;
      sourceColumn: string;
      proposedField: string;
      approvedField: string;
      confidence: number;
      decision: string;
      reason: string;
    }>;
  }>;
};

function safeRead(): ImportAuditRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as ImportAuditRecord[] : [];
  } catch {
    return [];
  }
}

export function loadImportAuditLog(): ImportAuditRecord[] {
  return safeRead();
}

export function createImportAuditRecord(inspection: ImportInspection, structure?: WorkbookStructureReview | null): ImportAuditRecord {
  const structuralSheets = new Map((structure?.sheets ?? []).map((sheet) => [sheet.name, sheet]));
  return {
    id: `${Date.now()}-${inspection.fileFingerprint.slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    fileName: inspection.fileName,
    fingerprint: inspection.fileFingerprint,
    sheets: inspection.sheets.map((sheet) => {
      const structural = structuralSheets.get(sheet.name);
      return {
        name: sheet.name,
        rows: sheet.rows,
        columns: sheet.columns,
        headerRow: sheet.headerRowIndex + 1,
        hiddenRows: structural?.hiddenRows.length ?? 0,
        hiddenColumns: structural?.hiddenColumns.length ?? 0,
        mergedRanges: structural?.mergedRanges.length ?? 0,
        detectedTransformations: structural?.warnings.map((warning) => warning.message) ?? (sheet.layoutNote ? [sheet.layoutNote] : []),
        mappings: sheet.mappings.map((mapping) => ({
          column: mapping.dataColumn ?? mapping.sourceColumn,
          sourceColumn: mapping.sourceColumn,
          proposedField: mapping.proposedField && mapping.proposedField !== "unknown" ? fieldArabicName[mapping.proposedField] : "غير معروف",
          approvedField: mapping.field !== "unknown" ? fieldArabicName[mapping.field] : "تم تجاهل العمود",
          confidence: mapping.score,
          decision: mapping.approvalStatus ?? "استيراد محفوظ بإصدار سابق",
          reason: mapping.approvalReason ?? mapping.reason,
        })),
      };
    }),
  };
}

export function recordImportAudit(record: ImportAuditRecord): ImportAuditRecord[] {
  const history = safeRead();
  const next = [record, ...history.filter((item) => item.id !== record.id)].slice(0, MAX_AUDIT_RECORDS);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* السجل الإضافي لا يعطل الاستيراد. */ }
  return next;
}

export function exportImportAuditMap(record: ImportAuditRecord): void {
  const overview = [{
    "اسم الملف": record.fileName,
    "وقت الاعتماد": new Date(record.timestamp).toLocaleString("ar-EG"),
    "بصمة الملف": record.fingerprint,
    "عدد الشيتات": record.sheets.length,
    "تنبيه الخصوصية": "لا يحتوي هذا التصدير على صفوف الأصناف أو محتوى الملف.",
  }];
  const mappings = record.sheets.flatMap((sheet) => sheet.mappings.map((mapping) => ({
    "الشيت": sheet.name,
    "العمود": mapping.column,
    "عنوان العمود": mapping.sourceColumn,
    "الاقتراح": mapping.proposedField,
    "القرار المعتمد": mapping.approvedField,
    "درجة الثقة": mapping.confidence,
    "قرار المدير": mapping.decision,
    "سبب المطابقة": mapping.reason,
  })));
  const structure = record.sheets.map((sheet) => ({
    "الشيت": sheet.name,
    "الصفوف": sheet.rows,
    "الأعمدة": sheet.columns,
    "صف الرأس": sheet.headerRow,
    "صفوف مخفية": sheet.hiddenRows,
    "أعمدة مخفية": sheet.hiddenColumns,
    "نطاقات مدمجة": sheet.mergedRanges,
    "ملاحظات البنية": sheet.detectedTransformations.join(" | ") || "لا توجد",
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(overview), "ملخص الاعتماد");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mappings), "خريطة الأعمدة");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(structure), "بنية الملف");
  XLSX.writeFile(workbook, `خريطة_استيراد_${record.fileName.replace(/\.[^.]+$/, "")}_${new Date(record.timestamp).toISOString().slice(0, 10)}.xlsx`);
}
