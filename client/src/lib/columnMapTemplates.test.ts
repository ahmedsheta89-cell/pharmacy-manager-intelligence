import { describe, expect, it } from "vitest";
import { columnMapReviewStage, compareColumnMapTemplate, createColumnMapTemplate, deleteColumnMapTemplate, loadColumnMapTemplates, saveColumnMapTemplate, type ColumnMapTemplate } from "./columnMapTemplates";
import type { WorkbookStructureReview } from "./excelInspector";
import type { ImportInspection } from "./pharmacyEngine";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

function sampleInspection(headers = ["الموظف", "إجمالي البيع", "الرصيد", "الوحدة"]): ImportInspection {
  return {
    fileName: "export.xlsx", fileType: "xlsx", fileSize: 128, fileFingerprint: "sample", detectedAt: new Date("2026-08-20"),
    sheets: [{
      name: "التقرير", rows: 2, columns: headers.length, headerRowIndex: 0, headerDataOffset: -1,
      headers, rawRecords: [], cleanRecords: [], excludedRows: 0, quality: { score: 100, validRecords: 1, excludedRecords: 0, emptyCriticalCells: 0, invalidNumericValues: 0, invalidDates: 0, negativeValues: 0, duplicates: 0, issues: [] }, preview: [],
      mappings: headers.map((header, index) => ({ sourceColumn: header, field: index === 0 ? "sales_total" : "unknown", proposedField: index === 0 ? "sales_total" : "unknown", confidence: "عالية", score: 90, reason: "اختبار", sample: "قيمة", approvalStatus: index === 0 ? "approved" : "ignored", dataColumn: String.fromCharCode(65 + Math.max(0, index - 1)), headerColumn: String.fromCharCode(65 + index), adjustedForHeaderShift: true })),
      removedHeaders: [{ headerColumn: "A", title: "الموظف", reason: "رأس وهمي" }],
    }],
  };
}

function sampleStructure(headers = ["الموظف", "إجمالي البيع", "الرصيد", "الوحدة"]): WorkbookStructureReview {
  return { fileName: "export.xlsx", fileFingerprintHint: "sample", inspectedAt: "2026-08-20", warnings: [], sheets: [{ name: "التقرير", visibility: "visible", dimensions: { rows: 2, columns: headers.length }, headerCandidates: [], selectedHeaderRow: 0, suggestedHeaderRows: [0], mergedRanges: [], hiddenRows: [], hiddenColumns: [], warnings: [], rawPreview: [], columns: headers.map((rawHeader, index) => ({ index, letter: String.fromCharCode(65 + index), rawHeader, displayHeader: rawHeader, samples: [], nonEmptyCount: 1, nullRate: 0, typeDistribution: { text: 1, numeric: 0, date: 0, boolean: 0, mixed: false }, isHidden: false, isNumericHeader: false, isDuplicateHeader: false })) }] };
}

describe("column map templates", () => {
  it("يحفظ القالب محليًا من دون سجلات ملف Excel ويعيد تحميله", () => {
    const local = storage();
    const inspection = sampleInspection();
    const template = createColumnMapTemplate("برنامج الصيدلية", inspection, sampleStructure());
    const saved = saveColumnMapTemplate(template, local);

    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("برنامج الصيدلية");
    expect(saved[0].sheets[0].mappings[0]).toMatchObject({ dataColumn: "A", headerColumn: "A", field: "sales_total", adjustedForHeaderShift: true });
    expect(JSON.stringify(saved[0])).not.toContain("rawRecords");
    expect(loadColumnMapTemplates(local)[0]?.id).toBe(saved[0].id);
    expect(deleteColumnMapTemplate(saved[0].id, local)).toEqual([]);
  });

  it("يعتبر البنية المتطابقة صالحة للقالب ويشرح اختلاف ترتيب العناوين", () => {
    const inspection = sampleInspection();
    const template = { id: "template-1", name: "برنامج الصيدلية", createdAt: "2026-08-20", updatedAt: "2026-08-20", sheets: createColumnMapTemplate("برنامج الصيدلية", inspection, sampleStructure()).sheets } satisfies ColumnMapTemplate;

    expect(compareColumnMapTemplate(template, inspection, sampleStructure()).compatible).toBe(true);
    const changedHeaders = ["الموظف", "الرصيد", "إجمالي البيع", "الوحدة"];
    const mismatch = compareColumnMapTemplate(template, sampleInspection(changedHeaders), sampleStructure(changedHeaders));
    expect(mismatch.compatible).toBe(false);
    expect(mismatch.differences.some((difference) => difference.kind === "header_order" && difference.message.includes("إجمالي البيع"))).toBe(true);
    expect(columnMapReviewStage(mismatch)).toBe("column-map-warning");
    expect(columnMapReviewStage(compareColumnMapTemplate(template, inspection, sampleStructure()))).toBe("review");
    expect(columnMapReviewStage(null)).toBe("review");
  });
});
