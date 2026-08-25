import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const anonymousContext = {
  user: null,
  req: { headers: {} },
  res: { clearCookie: () => undefined },
} as never;

describe("إجراءات الخادم المحمية", () => {
  it("يعيد هوية فارغة للإجراء العام ولا يسمح بقائمة مساحات العمل بلا جلسة", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.auth.me()).resolves.toBeNull();
    await expect(caller.workspace.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يمسح ملف تعريف الجلسة عند تسجيل الخروج", async () => {
    const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
    const caller = appRouter.createCaller({ ...anonymousContext, res: { clearCookie: (name: string, options: Record<string, unknown>) => calls.push({ name, options }) } } as never);
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(calls[0]).toMatchObject({ name: "app_session_id", options: { maxAge: -1, httpOnly: true, secure: true, sameSite: "none", path: "/" } });
  });

  it("يحجب كل مسارات التشغيل الدائمة عن المتصفح غير الموثق", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    const checks = [
      caller.sessions.saveApproved({ workspaceId: 1, sourceFileName: "local.xlsx", sourceFingerprint: "fingerprint-12345678", sourceSheetCount: 1, sourceRowCount: 1, mappingDecision: {}, normalizedSummary: {}, explainableAlerts: [] }),
      caller.alerts.list({ workspaceId: 1 }),
      caller.alerts.setStatus({ workspaceId: 1, alertId: 1, status: "resolved", reason: "مراجعة المدير" }),
      caller.governance.overview({ workspaceId: 1 }),
      caller.governance.updateRetention({ workspaceId: 1, approvedMetadataRetentionDays: 365, auditEventRetentionDays: 2555 }),
      caller.orders.saveApproved({ workspaceId: 1, lines: [{ productName: "صنف", requestedQuantity: "1.000" }] }),
      caller.settlements.saveApproved({ workspaceId: 1, supplierName: "مورد", invoiceDate: "2026-08-23", lines: [{ productName: "صنف", invoiceQuantity: "1.000", acceptedQuantity: "1.000", matchMethod: "manual" }] }),
      caller.operating.list({ workspaceId: 1 }),
      caller.operating.save({ workspaceId: 1, clientDecisionKey: "priority-1", status: "open", priorityRank: 1, actionLabel: "راجع الصنف", reason: "دليل مراجع" }),
      caller.customerRequests.list({ workspaceId: 1 }),
      caller.customerRequests.events({ workspaceId: 1, customerRequestId: 1 }),
      caller.customerRequests.create({ workspaceId: 1, customerName: "عميل اختبار", customerPhone: "01000000000", productName: "صنف اختبار", requestedQuantity: "1.000" }),
      caller.customerRequests.setStatus({ workspaceId: 1, customerRequestId: 1, status: "contacted" }),
      caller.customerRequests.supplyCandidates({ workspaceId: 1 }),
      caller.customerRequests.approveSupply({ workspaceId: 1, allocations: [{ customerRequestId: 1, settlementLineId: 1, allocatedQuantity: "1.000" }] }),
      caller.customerRequests.createTeamInvite({ workspaceId: 1, expiresInHours: 24 }),
      caller.customerRequests.redeemTeamInvite({ code: "ABCD-EFGH-IJKL" }),
    ];
    for (const request of checks) await expect(request).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
