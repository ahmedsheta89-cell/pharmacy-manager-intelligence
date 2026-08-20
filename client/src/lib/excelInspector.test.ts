import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { inspectWorkbookStructure } from "./excelInspector";
import { inspectPharmacyFile } from "./pharmacyEngine";
import { approveAllSuggestions, getImportReadiness } from "./importReview";
import { setColumnMapping } from "./importReview";
import { analyzePharmacyData } from "./analyticsEngine";
import { createImportAuditRecord } from "./importAuditLog";

function toFile(workbook: XLSX.WorkBook, name: string) {
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("inspectWorkbookStructure", () => {
  it("يوثق الدمج والإخفاء والرأس متعدد الصفوف دون تغيير القيم الأصلية", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["تقرير المخزون", null, null, null],
      ["هوية الصنف", null, "الحركة", null],
      ["كود الصنف", "اسم الصنف", "الرصيد", "الكمية المباعة"],
      ["A-1", "صنف اختباري", 0, 3],
      ["A-2", "صنف آخر", 7, 1],
    ]);
    sheet["!merges"] = [XLSX.utils.decode_range("A1:D1"), XLSX.utils.decode_range("A2:B2")];
    sheet["!rows"] = [{}, { hidden: true }];
    sheet["!cols"] = [{}, {}, { hidden: true }, {}];
    XLSX.utils.book_append_sheet(workbook, sheet, "مخزون");

    const review = await inspectWorkbookStructure(toFile(workbook, "merged.xlsx"));
    const result = review.sheets[0];

    expect(result.mergedRanges).toEqual(expect.arrayContaining(["A1:D1", "A2:B2"]));
    expect(result.hiddenRows).toContain(2);
    expect(result.hiddenColumns).toContain("C");
    expect(result.warnings.map((item) => item.kind)).toEqual(expect.arrayContaining(["merged_cells", "hidden_rows", "hidden_columns"]));
    expect(result.rawPreview[3][1]).toBe("صنف اختباري");
  });

  it("يبقي الاقتراحات معلقة ويمنع التحليل قبل موافقة المدير ثم يسمح به بعد الاعتماد", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["كود الصنف", "اسم الصنف", "الرصيد", "إجمالي البيع"],
      ["A-1", "صنف اختباري", 0, 200],
    ]), "بيانات");
    const inspection = await inspectPharmacyFile(toFile(workbook, "approval.xlsx"));

    expect(inspection.sheets[0].mappings.every((mapping) => mapping.approvalStatus === "suggested")).toBe(true);
    expect(getImportReadiness(inspection).ready).toBe(false);
    expect(analyzePharmacyData(inspection.sheets)?.metrics.sales.availability).toBe("unavailable");

    const approved = approveAllSuggestions(inspection);
    expect(getImportReadiness(approved).ready).toBe(true);
    expect(analyzePharmacyData(approved.sheets)?.metrics.sales).toMatchObject({ value: 200, availability: "available" });
  });

  it("يوثق التعديل اليدوي كقرار مدير في خريطة التدقيق بدلاً من إخفاء الاقتراح الأصلي", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["اسم الصنف", "الرصيد الحالي"],
      ["صنف اختباري", 4],
    ]), "مخزون");
    const file = toFile(workbook, "manual-decision.xlsx");
    const [inspection, structure] = await Promise.all([inspectPharmacyFile(file), inspectWorkbookStructure(file)]);
    const originalBalance = inspection.sheets[0].mappings.find((mapping) => mapping.sourceColumn === "الرصيد الحالي");
    const revised = setColumnMapping(inspection, "مخزون", originalBalance?.dataColumn, "الرصيد الحالي", "quantity_sold");
    const approved = approveAllSuggestions(revised);
    const audit = createImportAuditRecord(approved, structure);
    const balance = audit.sheets[0].mappings.find((mapping) => mapping.sourceColumn === "الرصيد الحالي");

    expect(balance).toMatchObject({ proposedField: "رصيد المخزون", approvedField: "الكمية المباعة", decision: "overridden" });
    expect(balance?.reason).toContain("استبدل المدير الاقتراح");
    expect(getImportReadiness(approved).ready).toBe(true);
  });
});
