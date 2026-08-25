import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { canApproveCustomerSupply, canManageCustomerRequests, canManageOperations } from "./accessControl";
import { getSessionCookieOptions } from "./_core/cookies";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true as const };
    }),
  }),
  workspace: router({
    list: protectedProcedure.query(({ ctx }) => db.listWorkspacesForUser(ctx.user.id)),
    ensure: protectedProcedure.mutation(({ ctx }) => db.ensureOwnerWorkspace(ctx.user)),
  }),
  sessions: router({
    saveApproved: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), sourceFileName: z.string().trim().min(1).max(255), sourceFingerprint: z.string().trim().min(8).max(128), sourceSheetCount: z.number().int().min(1).max(500), sourceRowCount: z.number().int().min(0).max(1_000_000), periodLabel: z.string().trim().max(120).optional(), mappingDecision: z.record(z.string(), z.unknown()), normalizedSummary: z.record(z.string(), z.unknown()), explainableAlerts: z.array(z.object({ clientAlertId: z.string().trim().min(1).max(160), level: z.enum(["urgent", "review", "watch", "positive"]), title: z.string().trim().min(1).max(255), evidence: z.string().trim().min(1).max(4000), action: z.string().trim().min(1).max(255) })).max(80),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لحفظ جلسة معتمدة." });
      const session = await db.saveApprovedAnalysisSession({ ...input, approvedByUserId: ctx.user.id });
      if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ ملخص الجلسة المعتمدة." });
      await db.createOperationalAlerts({ workspaceId: input.workspaceId, sessionId: session.id, alerts: input.explainableAlerts });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "analysis_session.approved", entityType: "approved_analysis_session", entityId: String(session.id), metadata: { sourceFingerprint: input.sourceFingerprint, sourceSheetCount: input.sourceSheetCount, sourceRowCount: input.sourceRowCount } });
      return session;
    }),
  }),
  alerts: router({
    list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى تنبيهات المخزون." });
      return db.listOperationalAlerts(input.workspaceId);
    }),
    setStatus: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), alertId: z.number().int().positive(), status: z.enum(["open", "snoozed", "resolved"]), reason: z.string().trim().min(3).max(5000) })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لتغيير حالة التنبيه." });
      const alert = await db.updateOperationalAlertStatus(input);
      if (!alert) throw new TRPCError({ code: "NOT_FOUND", message: "لم نعثر على التنبيه المطلوب." });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: `operational_alert.${input.status}`, entityType: "operational_alert", entityId: String(alert.id), metadata: { reason: input.reason, title: alert.title, priorEvidence: alert.evidence } });
      return alert;
    }),
  }),
  governance: router({
    overview: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى حوكمة مساحة العمل." });
      const [retentionPolicy, events] = await Promise.all([db.getRetentionPolicy(input.workspaceId, ctx.user.id), db.listAuditEvents(input.workspaceId)]);
      return { membership, retentionPolicy, events };
    }),
    updateRetention: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), approvedMetadataRetentionDays: z.number().int().min(30).max(3650), auditEventRetentionDays: z.number().int().min(365).max(3650) })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || membership.accessRole !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "يقتصر تعديل سياسة الاحتفاظ على مالك مساحة العمل." });
      const policy = await db.updateRetentionPolicy({ workspaceId: input.workspaceId, userId: ctx.user.id, approvedMetadataRetentionDays: input.approvedMetadataRetentionDays, auditEventRetentionDays: input.auditEventRetentionDays });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "retention_policy.updated", entityType: "workspace_retention_policy", entityId: String(policy?.id ?? ""), metadata: { approvedMetadataRetentionDays: input.approvedMetadataRetentionDays, auditEventRetentionDays: input.auditEventRetentionDays, rawSourceRetentionDays: 0 } });
      return policy;
    }),
  }),
  orders: router({
    saveApproved: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), reference: z.string().trim().max(100).optional(), lines: z.array(z.object({ productCode: z.string().trim().max(120).optional(), productName: z.string().trim().min(1).max(255), requestedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), unitLabel: z.string().trim().max(64).optional() })).min(1).max(500) })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لاعتماد طلب." });
      const order = await db.saveApprovedOpenOrder({ ...input, createdByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "open_order.approved", entityType: "open_order", entityId: String(order.id), metadata: { lineCount: input.lines.length, reference: input.reference ?? null } });
      return order;
    }),
  }),
  settlements: router({
    saveApproved: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), supplierName: z.string().trim().max(200), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z.array(z.object({ productCode: z.string().trim().max(120).optional(), productName: z.string().trim().min(1).max(255), invoiceQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), acceptedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), matchMethod: z.string().trim().min(1).max(64), exceptionReason: z.string().trim().max(255).optional() })).min(1).max(500),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لحفظ تسوية معتمدة." });
      const settlement = await db.saveInvoiceSettlementDecision({ ...input, approvedByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "invoice_settlement.approved", entityType: "invoice_settlement", entityId: String(settlement.id), metadata: { supplierName: input.supplierName, lineCount: input.lines.length, invoiceDate: input.invoiceDate } });
      return settlement;
    }),
  }),
  operating: router({
    list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى غرفة العمليات." });
      return db.listOperatingDecisions(input.workspaceId);
    }),
    save: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), clientDecisionKey: z.string().trim().min(3).max(180), status: z.enum(["open", "deferred", "done"]), priorityRank: z.number().int().min(1).max(3), actionLabel: z.string().trim().min(3).max(255), reason: z.string().trim().min(3).max(5000), managerNote: z.string().trim().max(5000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageOperations(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لتسجيل قرار تشغيلي." });
      const decision = await db.upsertOperatingDecision({ ...input, createdByUserId: ctx.user.id });
      if (!decision) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ القرار التشغيلي." });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "operating_decision.saved", entityType: "operating_decision", entityId: String(decision.id), metadata: { clientDecisionKey: input.clientDecisionKey, status: input.status, priorityRank: input.priorityRank } });
      return decision;
    }),
  }),
  customerRequests: router({
    list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى طلبات العملاء." });
      return db.listCustomerRequests(input.workspaceId);
    }),
    events: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), customerRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى سجل طلب العميل." });
      return db.listCustomerRequestEvents(input.workspaceId, input.customerRequestId);
    }),
    create: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), customerName: z.string().trim().min(2).max(160), customerPhone: z.string().trim().min(7).max(32), productCode: z.string().trim().max(120).optional(), productName: z.string().trim().min(2).max(255), requestedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), note: z.string().trim().max(3000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إنشاء طلب عميل." });
      const result = await db.createCustomerRequest({ ...input, createdByUserId: ctx.user.id });
      if (!result.duplicate) await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "customer_request.created", entityType: "customer_request", entityId: String(result.request.id), metadata: { productCode: result.request.productCode, requestedQuantity: input.requestedQuantity } });
      return result;
    }),
    setStatus: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), customerRequestId: z.number().int().positive(), status: z.enum(["requested", "awaiting_supply", "ready_to_contact", "contacted", "fulfilled", "cancelled"]), note: z.string().trim().max(3000).optional(), closedReason: z.string().trim().max(3000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث طلب العميل." });
      if (membership.accessRole === "customer_requests" && ["requested", "awaiting_supply", "ready_to_contact"].includes(input.status)) throw new TRPCError({ code: "FORBIDDEN", message: "فريق الطلبات لا يعتمد التوريد أو الإتاحة؛ يمكنه تسجيل التواصل أو الإغلاق بعد قرار المدير." });
      const request = await db.updateCustomerRequestStatus({ ...input, userId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: `customer_request.${input.status}`, entityType: "customer_request", entityId: String(input.customerRequestId), metadata: { note: input.note ?? null, closedReason: input.closedReason ?? null } });
      return request;
    }),
    supplyCandidates: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تخصيص التوريد لطلبات العملاء متاح للمدير فقط." });
      return db.listSupplyCandidatesForCustomerRequests(input.workspaceId);
    }),
    approveSupply: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), allocations: z.array(z.object({ customerRequestId: z.number().int().positive(), settlementLineId: z.number().int().positive(), allocatedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/) })).min(1).max(100),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "اعتماد إتاحة الصنف للعميل متاح للمدير فقط." });
      const requests = await db.approveCustomerSupplyAllocations({ ...input, approvedByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "customer_request.supply_allocated", entityType: "customer_request_supply_allocation", metadata: { allocations: input.allocations, readyToContactCount: requests.filter((request) => request.status === "ready_to_contact").length } });
      return requests;
    }),
    createTeamInvite: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), expiresInHours: z.number().int().min(1).max(168).default(24) })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "إنشاء رمز فريق طلبات العملاء متاح للمدير فقط." });
      const invite = await db.createCustomerRequestAccessInvite({ ...input, createdByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "customer_request_team.invite_created", entityType: "customer_request_access_invite", metadata: { expiresAt: invite.expiresAt.toISOString() } });
      return invite;
    }),
    redeemTeamInvite: protectedProcedure.input(z.object({ code: z.string().trim().min(8).max(80) })).mutation(async ({ ctx, input }) => {
      const result = await db.redeemCustomerRequestAccessInvite({ code: input.code, userId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: result.workspaceId, actorUserId: ctx.user.id, action: "customer_request_team.invite_redeemed", entityType: "workspace_member", entityId: String(ctx.user.id), metadata: { accessRole: result.accessRole } });
      return result;
    }),
  }),
});

export type AppRouter = typeof appRouter;
