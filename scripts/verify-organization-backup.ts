import { File } from "node:buffer";
import * as XLSX from "xlsx";
import { createLocalBackup, restoreLocalBackup } from "../client/src/lib/localBackup";
import { filterAnalysisSessions, loadAnalysisSessions, saveAnalysisSession, updateAnalysisSessionTags } from "../client/src/lib/analysisSessions";
import { inspectReorderRulesFile } from "../client/src/lib/reorderRulesImport";
import { loadReorderRules, replaceReorderRules, saveReorderRulesBatch } from "../client/src/lib/reorderRules";
import type { ImportInspection } from "../client/src/lib/pharmacyEngine";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key), clear: () => memory.clear() }, configurable: true });

const inspection: ImportInspection = {
  fileName: "مراجعة_يناير.xlsx", fileType: "xlsx", fileSize: 144, fileFingerprint: "organization-check-001", detectedAt: new Date("2026-08-17T12:00:00.000Z"),
  sheets: [{ name: "المبيعات", rows: 1, columns: 2, headerRowIndex: 0, headers: ["اسم الصنف", "تاريخ البيع"], mappings: [], rawRecords: [], cleanRecords: [{ "اسم الصنف": "صنف اختبار", __rowIndex: 1, __sheetName: "المبيعات", __metrics: { date: new Date("2026-08-16T00:00:00.000Z") } }], excludedRows: 0, quality: { score: 100, validRecords: 1, excludedRecords: 0, missingCritical: [], warnings: [] }, preview: [] }],
};

const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
  { "معرّف الصنف": "RX-01", "حد إعادة الطلب": 12, "رصيد الهدف": 30 },
  { "معرّف الصنف": "RX-02", "حد إعادة الطلب": "٥", "رصيد الهدف": "15" },
  { "معرّف الصنف": "RX-03", "حد إعادة الطلب": 20, "رصيد الهدف": 10 },
]), "قواعد مخصصة");
const ruleFile = new File([XLSX.write(book, { type: "buffer", bookType: "xlsx" })], "قواعد_يناير.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const imported = await inspectReorderRulesFile(ruleFile as unknown as File);
if (imported.accepted.length !== 2 || imported.rejected.length !== 1) throw new Error("لم تُحلَّل قواعد Excel المقبولة والمرفوضة كما ينبغي.");
saveReorderRulesBatch(imported.accepted);
if (Object.keys(loadReorderRules()).length !== 2) throw new Error("لم تُحفظ قواعد Excel المقبولة محليًا.");

const saved = saveAnalysisSession(inspection);
const tagged = updateAnalysisSessionTags(saved.sessions[0].id, ["جرد", "يناير", "جرد"]);
if (tagged[0].tags?.length !== 2 || filterAnalysisSessions(tagged, "", "يناير").length !== 1 || filterAnalysisSessions(tagged, "مراجعة").length !== 1) throw new Error("البحث أو الوسوم لا يعملان على الجلسة المحلية.");

const backup = createLocalBackup();
const backupFile = new File([JSON.stringify(backup)], "نسخة_اختبار.json", { type: "application/json" });
replaceReorderRules({});
memory.delete("pmi-analysis-sessions-v1");
const restored = await restoreLocalBackup(backupFile as unknown as File, "replace");
const revived = loadAnalysisSessions()[0];
if (restored.sessionCount !== 1 || restored.rulesCount !== 2 || !revived || revived.tags?.[0] !== "جرد" || !(revived.inspection.detectedAt instanceof Date)) throw new Error("لم تستعد النسخة الاحتياطية الجلسة أو الوسوم أو القواعد بصورة صحيحة.");

console.log(JSON.stringify({ importedRules: imported.accepted.length, rejectedRows: imported.rejected.length, tags: revived.tags, restoredSessions: restored.sessionCount, restoredRules: restored.rulesCount }, null, 2));
