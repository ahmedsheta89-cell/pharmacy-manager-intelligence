import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { canApproveCustomerSupply, canManageCustomerRequests, canManageOperations } from "./accessControl";
import { presentCustomerRequestForRole } from "./customerContactPrivacy";
import { isCustomerRequestRecordedBy, resolveRecordedByUserId } from "./customerRequestAssignment";
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
    reliabilitySnapshot: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "مراقبة التشغيل متاحة للمدير فقط." });
      return db.getWorkspaceReliabilitySnapshot(input.workspaceId, ctx.user.id);
    }),
    exportOperationalSnapshot: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تصدير لقطة التشغيل متاح للمدير فقط." });
      const snapshot = await db.exportWorkspaceOperationalSnapshot(input.workspaceId, ctx.user.id);
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "workspace_operational_snapshot.exported", entityType: "workspace_operational_snapshot", metadata: { format: snapshot.format, requestCount: snapshot.data.requests.length, supplierCount: snapshot.data.suppliers.length } });
      return snapshot;
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
      const requests = await db.listCustomerRequests(input.workspaceId, membership.accessRole === "customer_requests" ? ctx.user.id : undefined);
      return requests.map((request) => presentCustomerRequestForRole(request, membership.accessRole === "customer_requests"));
    }),
    revealPhone: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), customerRequestId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الاطلاع على رقم العميل." });
      const request = await db.getCustomerRequestById(input.workspaceId, input.customerRequestId);
      if (!request || (membership.accessRole === "customer_requests" && !isCustomerRequestRecordedBy(request, ctx.user.id))) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الاطلاع على رقم هذا الطلب." });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "customer_request.phone_revealed_for_contact", entityType: "customer_request", entityId: String(request.id), metadata: { purpose: "manual_whatsapp_review" } });
      return { customerPhone: request.customerPhone };
    }),
    messageTemplates: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى قوالب الرسائل." });
      return db.listCustomerRequestMessageTemplates(input.workspaceId, canApproveCustomerSupply(membership.accessRole));
    }),
    responseMetrics: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "مؤشرات فريق الطلبات متاحة للمدير فقط." });
      return db.listCustomerRequestResponseMetrics(input.workspaceId);
    }),
    dailyWorkQueue: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى قائمة عمل اليوم." });
      return db.listCustomerRequestDailyWorkQueue({ workspaceId: input.workspaceId, recordedByUserId: membership.accessRole === "customer_requests" ? ctx.user.id : undefined });
    }),
    saveMessageTemplate: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), id: z.number().int().positive().optional(), name: z.string().trim().min(2).max(120), body: z.string().trim().min(5).max(2000), isDefault: z.boolean(), isActive: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "إدارة قوالب WhatsApp متاحة للمدير فقط." });
      const template = await db.saveCustomerRequestMessageTemplate({ ...input, userId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.id ? "customer_request_message_template.updated" : "customer_request_message_template.created", entityType: "customer_request_message_template", entityId: String(template?.id ?? ""), metadata: { isDefault: input.isDefault, isActive: input.isActive } });
      return template;
    }),
    events: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), customerRequestId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى سجل طلب العميل." });
      if (membership.accessRole === "customer_requests") {
        const request = await db.getCustomerRequestById(input.workspaceId, input.customerRequestId);
        if (!request || !isCustomerRequestRecordedBy(request, ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى سجل هذا الطلب." });
      }
      return db.listCustomerRequestEvents(input.workspaceId, input.customerRequestId);
    }),
    create: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), customerName: z.string().trim().min(2).max(160), customerPhone: z.string().trim().min(7).max(32), productCode: z.string().trim().max(120).optional(), productName: z.string().trim().min(2).max(255), requestedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), note: z.string().trim().max(3000).optional(), recordedByUserId: z.number().int().positive().optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إنشاء طلب عميل." });
      let recordedByUserId: number;
      try { recordedByUserId = resolveRecordedByUserId({ actorUserId: ctx.user.id, accessRole: membership.accessRole, requestedRecordedByUserId: input.recordedByUserId }); }
      catch (error) { throw new TRPCError({ code: membership.accessRole === "customer_requests" ? "FORBIDDEN" : "BAD_REQUEST", message: error instanceof Error ? error.message : "تعذر تحديد الزميل المسجّل." }); }
      if (canApproveCustomerSupply(membership.accessRole) && !(await db.isActiveCustomerRequestColleague(input.workspaceId, recordedByUserId))) throw new TRPCError({ code: "BAD_REQUEST", message: "اختر زميلاً نشطًا من فريق طلبات العملاء داخل مساحة العمل." });
      const result = await db.createCustomerRequest({ ...input, createdByUserId: ctx.user.id, recordedByUserId });
      if (!result.duplicate) await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "customer_request.created", entityType: "customer_request", entityId: String(result.request.id), metadata: { productCode: result.request.productCode, requestedQuantity: input.requestedQuantity, recordedByUserId } });
      return { ...result, request: presentCustomerRequestForRole(result.request, membership.accessRole === "customer_requests") };
    }),
    updateDetails: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), customerRequestId: z.number().int().positive(), customerName: z.string().trim().min(2).max(160), customerPhone: z.string().trim().min(7).max(32), productCode: z.string().trim().max(120).optional(), productName: z.string().trim().min(2).max(255), requestedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), note: z.string().trim().max(3000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تعديل بيانات طلب العميل متاح للمدير فقط." });
      const result = await db.updateCustomerRequestDetails({ ...input, userId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "customer_request.details_updated", entityType: "customer_request", entityId: String(input.customerRequestId), metadata: { changedFields: result.changedFields } });
      return result.request;
    }),
    setStatus: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), customerRequestId: z.number().int().positive(), status: z.enum(["requested", "awaiting_supply", "ready_to_contact", "contacted", "fulfilled", "unavailable", "cancelled"]), note: z.string().trim().max(3000).optional(), closedReason: z.string().trim().max(3000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canManageCustomerRequests(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث طلب العميل." });
      if (membership.accessRole === "customer_requests" && ["requested", "awaiting_supply", "ready_to_contact", "unavailable"].includes(input.status)) throw new TRPCError({ code: "FORBIDDEN", message: "فريق الطلبات لا يعتمد التوريد أو الإتاحة أو قرار عدم التوفر؛ يمكنه تسجيل التواصل أو الإغلاق بعد قرار المدير." });
      if (membership.accessRole === "customer_requests") {
        const existing = await db.getCustomerRequestById(input.workspaceId, input.customerRequestId);
        if (!existing || !isCustomerRequestRecordedBy(existing, ctx.user.id)) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تحديث طلب غير مسجّل باسمك." });
      }
      const request = await db.updateCustomerRequestStatus({ ...input, userId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: `customer_request.${input.status}`, entityType: "customer_request", entityId: String(input.customerRequestId), metadata: { note: input.note ?? null, closedReason: input.closedReason ?? null } });
      return presentCustomerRequestForRole(request, membership.accessRole === "customer_requests");
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
    teamMembers: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "إدارة أكواد الموظفين متاحة للمدير فقط." });
      return db.listWorkspaceTeamMembers(input.workspaceId);
    }),
    recordingColleagues: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "اختيار الزميل المسجّل متاح للمدير فقط." });
      return db.listActiveCustomerRequestColleagues(input.workspaceId);
    }),
    setEmployeeCode: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), userId: z.number().int().positive(), employeeCode: z.string().trim().min(3).max(40) })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تعيين كود الموظف متاح للمدير فقط." });
      const member = await db.setWorkspaceMemberEmployeeCode(input);
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "workspace_member.employee_code_set", entityType: "workspace_member", entityId: String(input.userId), metadata: { employeeCode: member.employeeCode } });
      return member;
    }),
    teamPerformance: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), sinceDays: z.number().int().min(1).max(90).default(30) })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تقارير أداء فريق الطلبات متاحة للمدير فقط." });
      return db.listCustomerRequestTeamPerformance(input);
    }),
  }),
  supplierArrivals: router({
    list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "قائمة وصول الموردين متاحة للمدير فقط." });
      return db.listSupplierArrivalSchedules(input.workspaceId);
    }),
    create: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), supplierName: z.string().trim().min(2).max(200), expectedAt: z.date(), note: z.string().trim().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "جدولة وصول المورد متاحة للمدير فقط." });
      const schedule = await db.createSupplierArrivalSchedule({ ...input, createdByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "supplier_arrival.created", entityType: "supplier_arrival_schedule", entityId: String(schedule?.id ?? ""), metadata: { supplierName: input.supplierName, expectedAt: input.expectedAt.toISOString() } });
      return schedule;
    }),
    setStatus: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive(), scheduleId: z.number().int().positive(), status: z.enum(["scheduled", "arrived", "late", "cancelled"]), note: z.string().trim().max(3000).optional() })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تحديث موعد المورد متاح للمدير فقط." });
      const schedule = await db.updateSupplierArrivalSchedule({ ...input, updatedByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: `supplier_arrival.${input.status}`, entityType: "supplier_arrival_schedule", entityId: String(input.scheduleId), metadata: { note: input.note ?? null } });
      return schedule;
    }),
  }),
  supplierContacts: router({
    list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "دفتر جهات الموردين متاح للمدير فقط." });
      return db.listSupplierContacts(input.workspaceId);
    }),
    save: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), supplierId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(200), contactLabel: z.string().trim().max(160).optional(), contactPhone: z.string().trim().min(7).max(32).optional(), isActive: z.boolean(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || !canApproveCustomerSupply(membership.accessRole)) throw new TRPCError({ code: "FORBIDDEN", message: "تعديل جهات الموردين متاح للمدير فقط." });
      const supplier = await db.saveSupplierContact(input);
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: input.supplierId ? "supplier_contact.updated" : "supplier_contact.saved", entityType: "supplier_profile", entityId: String(supplier?.id ?? ""), metadata: { hasContactPhone: Boolean(input.contactPhone?.trim()), isActive: input.isActive } });
      return supplier;
    }),
  }),
});

export type AppRouter = typeof appRouter;
