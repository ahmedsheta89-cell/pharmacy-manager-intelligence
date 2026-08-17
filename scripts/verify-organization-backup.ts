import { File } from "node:buffer";
import { webcrypto } from "node:crypto";
import * as XLSX from "xlsx";
import { createEncryptedBackup, createLocalBackup, parseLocalBackupText, restoreLocalBackup } from "../client/src/lib/localBackup";
import { filterAnalysisSessions, loadAnalysisSessions, saveAnalysisSession, updateAnalysisSessionTags } from "../client/src/lib/analysisSessions";
import { inspectReorderRulesFile } from "../client/src/lib/reorderRulesImport";
import { loadReorderRuleHistory, loadReorderRules, replaceReorderRules, saveReorderRulesBatch } from "../client/src/lib/reorderRules";
import type { ImportInspection } from "../client/src/lib/pharmacyEngine";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key), clear: () => memory.clear() }, configurable: true });
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

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

const englishBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(englishBook, XLSX.utils.aoa_to_sheet([["SKU", "Reorder Point", "Target Stock"], ["RX-04", 8, 24]]), "Inventory template");
const englishFile = new File([XLSX.write(englishBook, { type: "buffer", bookType: "xlsx" })], "inventory-template.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const englishImported = await inspectReorderRulesFile(englishFile as unknown as File);
if (englishImported.templateLabel !== "قالب مخزون إنجليزي" || englishImported.accepted.length !== 1 || englishImported.accepted[0].itemId !== "RX-04") throw new Error("لم يُقبل قالب المخزون الإنجليزي متعدد الأعمدة كما ينبغي.");
saveReorderRulesBatch(englishImported.accepted);

const saved = saveAnalysisSession(inspection);
const tagged = updateAnalysisSessionTags(saved.sessions[0].id, ["جرد", "يناير", "جرد"]);
if (tagged[0].tags?.length !== 2 || filterAnalysisSessions(tagged, "", "يناير").length !== 1 || filterAnalysisSessions(tagged, "مراجعة").length !== 1) throw new Error("البحث أو الوسوم لا يعملان على الجلسة المحلية.");

const backup = createLocalBackup();
const backupFile = new File([JSON.stringify(backup)], "نسخة_اختبار.json", { type: "application/json" });
const encrypted = await createEncryptedBackup(backup, "كلمة-مرور-آمنة-2026");
const encryptedText = JSON.stringify(encrypted);
if (!encrypted.encrypted || encryptedText.includes("مراجعة_يناير") || !encryptedText.includes("AES-GCM")) throw new Error("لم تُنتج نسخة احتياطية مشفرة بصورة صحيحة.");
let wrongPasswordBlocked = false;
try { await parseLocalBackupText(encryptedText, "كلمة-مرور-خاطئة"); } catch { wrongPasswordBlocked = true; }
const decrypted = await parseLocalBackupText(encryptedText, "كلمة-مرور-آمنة-2026");
if (!wrongPasswordBlocked || !decrypted.encrypted || decrypted.backup.sessions.length !== 1) throw new Error("لم يُتحقق من كلمة مرور النسخة المشفرة أو استعادتها بصورة صحيحة.");
replaceReorderRules({});
memory.delete("pmi-analysis-sessions-v1");
const restored = await restoreLocalBackup(backupFile as unknown as File, "replace");
const revived = loadAnalysisSessions()[0];
if (restored.sessionCount !== 1 || restored.rulesCount !== 3 || !revived || revived.tags?.[0] !== "جرد" || !(revived.inspection.detectedAt instanceof Date) || restored.history.length === 0 || loadReorderRuleHistory().length === 0) throw new Error("لم تستعد النسخة الاحتياطية الجلسة أو الوسوم أو القواعد أو سجل التغييرات بصورة صحيحة.");

console.log(JSON.stringify({ importedRules: imported.accepted.length + englishImported.accepted.length, rejectedRows: imported.rejected.length, tags: revived.tags, restoredSessions: restored.sessionCount, restoredRules: restored.rulesCount, encrypted: decrypted.encrypted, history: restored.history.length }, null, 2));
