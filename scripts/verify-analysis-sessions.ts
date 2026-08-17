import { deleteAnalysisSession, loadAnalysisSessions, saveAnalysisSession } from "../client/src/lib/analysisSessions";
import type { ImportInspection } from "../client/src/lib/pharmacyEngine";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key), clear: () => memory.clear() }, configurable: true });

const inspection: ImportInspection = {
  fileName: "جلسة_اختبار.xlsx",
  fileType: "xlsx",
  fileSize: 144,
  fileFingerprint: "session-check-001",
  detectedAt: new Date("2026-08-17T12:00:00.000Z"),
  sheets: [{ name: "المبيعات", rows: 1, columns: 2, headerRowIndex: 0, headers: ["اسم الصنف", "تاريخ البيع"], mappings: [], rawRecords: [], cleanRecords: [{ "اسم الصنف": "صنف اختبار", __rowIndex: 1, __sheetName: "المبيعات", __metrics: { date: new Date("2026-08-16T00:00:00.000Z") } }], excludedRows: 0, quality: { score: 100, validRecords: 1, excludedRecords: 0, missingCritical: [], warnings: [] }, preview: [] }],
};

const saved = saveAnalysisSession(inspection);
if (!saved.saved || saved.sessions.length !== 1) throw new Error("لم تُحفظ الجلسة المحلية.");
const restored = loadAnalysisSessions()[0];
if (!restored || !(restored.inspection.detectedAt instanceof Date) || !(restored.inspection.sheets[0].cleanRecords[0].__metrics.date instanceof Date)) throw new Error("لم تُستعد تواريخ الجلسة المحلية بصورة صحيحة.");
const remaining = deleteAnalysisSession(restored.id);
if (remaining.length !== 0) throw new Error("لم تُحذف الجلسة المحلية.");
console.log(JSON.stringify({ saved: saved.saved, restoredFile: restored.fileName, restoredDate: restored.inspection.detectedAt.toISOString(), remaining: remaining.length }, null, 2));
