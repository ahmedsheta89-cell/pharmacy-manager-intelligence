import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
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
      workspaceId: z.number().int().positive(), sourceFileName: z.string().trim().min(1).max(255), sourceFingerprint: z.string().trim().min(8).max(128), sourceSheetCount: z.number().int().min(1).max(500), sourceRowCount: z.number().int().min(0).max(1_000_000), periodLabel: z.string().trim().max(120).optional(), mappingDecision: z.record(z.string(), z.unknown()), normalizedSummary: z.record(z.string(), z.unknown()),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || membership.accessRole === "reviewer") throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لحفظ جلسة معتمدة." });
      const session = await db.saveApprovedAnalysisSession({ ...input, approvedByUserId: ctx.user.id });
      if (!session) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ ملخص الجلسة المعتمدة." });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "analysis_session.approved", entityType: "approved_analysis_session", entityId: String(session.id), metadata: { sourceFingerprint: input.sourceFingerprint, sourceSheetCount: input.sourceSheetCount, sourceRowCount: input.sourceRowCount } });
      return session;
    }),
  }),
  settlements: router({
    saveApproved: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), supplierName: z.string().trim().max(200), invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), lines: z.array(z.object({ productCode: z.string().trim().max(120).optional(), productName: z.string().trim().min(1).max(255), invoiceQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), acceptedQuantity: z.string().regex(/^\d+(\.\d{1,3})?$/), matchMethod: z.string().trim().min(1).max(64), exceptionReason: z.string().trim().max(255).optional() })).min(1).max(500),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || membership.accessRole === "reviewer") throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لحفظ تسوية معتمدة." });
      const settlement = await db.saveInvoiceSettlementDecision({ ...input, approvedByUserId: ctx.user.id });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "invoice_settlement.approved", entityType: "invoice_settlement", entityId: String(settlement.id), metadata: { supplierName: input.supplierName, lineCount: input.lines.length, invoiceDate: input.invoiceDate } });
      return settlement;
    }),
  }),
  operating: router({
    list: protectedProcedure.input(z.object({ workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية الوصول إلى مساحة العمل هذه." });
      return db.listOperatingDecisions(input.workspaceId);
    }),
    save: protectedProcedure.input(z.object({
      workspaceId: z.number().int().positive(), clientDecisionKey: z.string().trim().min(3).max(180), status: z.enum(["open", "deferred", "done"]), priorityRank: z.number().int().min(1).max(3), actionLabel: z.string().trim().min(3).max(255), reason: z.string().trim().min(3).max(5000), managerNote: z.string().trim().max(5000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const membership = await db.getWorkspaceMembership(input.workspaceId, ctx.user.id);
      if (!membership || membership.accessRole === "reviewer") throw new TRPCError({ code: "FORBIDDEN", message: "تحتاج دور مشغّل أو مدير لتسجيل قرار تشغيلي." });
      const decision = await db.upsertOperatingDecision({ ...input, createdByUserId: ctx.user.id });
      if (!decision) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر حفظ القرار التشغيلي." });
      await db.appendAuditEvent({ workspaceId: input.workspaceId, actorUserId: ctx.user.id, action: "operating_decision.saved", entityType: "operating_decision", entityId: String(decision.id), metadata: { clientDecisionKey: input.clientDecisionKey, status: input.status, priorityRank: input.priorityRank } });
      return decision;
    }),
  }),
});

export type AppRouter = typeof appRouter;
