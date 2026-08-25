import { describe, expect, it } from "vitest";
import { inspectOperationalSnapshot } from "./operationalSnapshot";

const validSnapshot = {
  format: "pharmacy-manager-operational-snapshot/v1",
  exportedAt: "2026-08-25T20:00:00.000Z",
  workspaceId: 3,
  data: { requests: [], suppliers: [], arrivals: [], messageTemplates: [], auditEvents: [], retentionPolicy: { auditEventRetentionDays: 2555 } },
};

describe("تحقق اللقطة التشغيلية", () => {
  it("يلخص اللقطة السليمة دون إعادة بياناتها الأصلية", () => {
    expect(inspectOperationalSnapshot(validSnapshot)).toMatchObject({ valid: true, workspaceId: 3, counts: { requests: 0, suppliers: 0, arrivals: 0, templates: 0, auditEvents: 0 } });
  });

  it("يرفض تنسيقًا غير معروف أو أقسامًا ناقصة", () => {
    const preview = inspectOperationalSnapshot({ format: "unknown", exportedAt: "invalid", workspaceId: 0, data: {} });
    expect(preview.valid).toBe(false);
    expect(preview.issues.length).toBeGreaterThan(2);
  });
});
