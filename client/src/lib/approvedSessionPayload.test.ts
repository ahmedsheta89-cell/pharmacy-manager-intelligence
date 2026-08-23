import { describe, expect, it } from "vitest";
import { makeApprovedSessionPayload } from "./approvedSessionPayload";

describe("ترحيل جلسة معتمدة", () => {
  it("ينقل الخريطة والملخص والتنبيهات المفسرة من دون صفوف المصدر الخام", () => {
    const inspection = {
      fileName: "pharmacy.xlsx",
      fileFingerprint: "fingerprint-12345678",
      sheets: [{ name: "الأصناف", headerRowIndex: 0, quality: { validRecords: 2 }, mappings: [{ sourceColumn: "A", field: "itemName", approvalStatus: "approved" }], cleanRecords: [{ itemName: "سطر لا يجب أن يخرج", rawSecret: "RAW_EXCEL_CONTENT" }] }],
    } as never;
    const analysis = {
      metrics: { totalItems: { value: 2, availability: "available", confidence: "high", source: "approved" } },
      alerts: [{ id: "alert-1", level: "review", title: "تنبيه واضح", evidence: "دليل من الملخص", action: "راجع القرار" }],
      totalRows: 2,
    } as never;

    const payload = makeApprovedSessionPayload(inspection, analysis, "يونيو");

    expect(payload.sourceRowCount).toBe(2);
    expect(payload.mappingDecision.sheets[0]?.mappings[0]).toMatchObject({ sourceColumn: "A", field: "itemName" });
    expect(payload.explainableAlerts[0]).toMatchObject({ clientAlertId: "alert-1", evidence: "دليل من الملخص" });
    expect(JSON.stringify(payload)).not.toContain("RAW_EXCEL_CONTENT");
    expect(JSON.stringify(payload)).not.toContain("سطر لا يجب أن يخرج");
  });
});
