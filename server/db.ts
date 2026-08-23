import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash } from "node:crypto";
import { approvedAnalysisSessions, auditEvents, invoiceSettlementLines, invoiceSettlements, openOrderLines, openOrders, operatingDecisions, operationalAlerts, pharmacyWorkspaces, supplierProfiles, users, workspaceMembers, workspaceRetentionPolicies, type InsertUser, type WorkspaceAccessRole } from "../drizzle/schema";

let instance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!instance && process.env.DATABASE_URL) instance = drizzle(process.env.DATABASE_URL);
  return instance;
}

export async function upsertUser(input: InsertUser) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const values: InsertUser = { ...input, lastSignedIn: input.lastSignedIn ?? new Date() };
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn, ...(values.role ? { role: values.role } : {}) } });
}

export async function getUserByOpenId(openId: string) {
  const db = getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export type WorkspaceMembership = { workspaceId: number; workspaceName: string; accessRole: WorkspaceAccessRole };

export async function listWorkspacesForUser(userId: number): Promise<WorkspaceMembership[]> {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select({ workspaceId: pharmacyWorkspaces.id, workspaceName: pharmacyWorkspaces.name, accessRole: workspaceMembers.accessRole })
    .from(workspaceMembers)
    .innerJoin(pharmacyWorkspaces, eq(workspaceMembers.workspaceId, pharmacyWorkspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active")));
}

export async function ensureOwnerWorkspace(user: { id: number; name: string | null }): Promise<WorkspaceMembership> {
  const current = await listWorkspacesForUser(user.id);
  if (current[0]) return current[0];
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const slug = `owner-${user.id}`;
  await db.insert(pharmacyWorkspaces).values({ name: `${user.name?.trim() || "مدير الصيدلية"} — مساحة العمل`, slug, ownerUserId: user.id })
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  const workspace = (await db.select().from(pharmacyWorkspaces).where(eq(pharmacyWorkspaces.slug, slug)).limit(1))[0];
  if (!workspace) throw new Error("Unable to create workspace");
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, accessRole: "owner", status: "active" })
    .onDuplicateKeyUpdate({ set: { status: "active", updatedAt: new Date() } });
  return { workspaceId: workspace.id, workspaceName: workspace.name, accessRole: "owner" };
}

export async function getWorkspaceMembership(workspaceId: number, userId: number): Promise<WorkspaceMembership | undefined> {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return (await db.select({ workspaceId: pharmacyWorkspaces.id, workspaceName: pharmacyWorkspaces.name, accessRole: workspaceMembers.accessRole })
    .from(workspaceMembers)
    .innerJoin(pharmacyWorkspaces, eq(workspaceMembers.workspaceId, pharmacyWorkspaces.id))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId), eq(workspaceMembers.status, "active")))
    .limit(1))[0];
}

export async function listOperatingDecisions(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(operatingDecisions).where(eq(operatingDecisions.workspaceId, workspaceId)).orderBy(operatingDecisions.priorityRank, desc(operatingDecisions.updatedAt)).limit(120);
}

export async function upsertOperatingDecision(input: {
  workspaceId: number; clientDecisionKey: string; createdByUserId: number; status: "open" | "deferred" | "done"; priorityRank: number; actionLabel: string; reason: string; managerNote?: string | null;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const now = new Date();
  await db.insert(operatingDecisions).values({ ...input, managerNote: input.managerNote ?? null, completedAt: input.status === "done" ? now : null })
    .onDuplicateKeyUpdate({ set: { status: input.status, priorityRank: input.priorityRank, actionLabel: input.actionLabel, reason: input.reason, managerNote: input.managerNote ?? null, completedAt: input.status === "done" ? now : null, updatedAt: now } });
  return (await db.select().from(operatingDecisions).where(and(eq(operatingDecisions.workspaceId, input.workspaceId), eq(operatingDecisions.clientDecisionKey, input.clientDecisionKey))).limit(1))[0];
}

export async function appendAuditEvent(input: { workspaceId: number; actorUserId: number; action: string; entityType: string; entityId?: string; metadata: Record<string, unknown> }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const previous = (await db.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(eq(auditEvents.workspaceId, input.workspaceId)).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(1))[0];
  const eventHash = createHash("sha256").update(JSON.stringify({ ...input, previousEventHash: previous?.eventHash ?? null, occurredAt: Date.now() })).digest("hex");
  await db.insert(auditEvents).values({ ...input, entityId: input.entityId ?? null, previousEventHash: previous?.eventHash ?? null, eventHash });
}

export async function saveApprovedAnalysisSession(input: {
  workspaceId: number; approvedByUserId: number; sourceFileName: string; sourceFingerprint: string; sourceSheetCount: number; sourceRowCount: number; periodLabel?: string; mappingDecision: Record<string, unknown>; normalizedSummary: Record<string, unknown>;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(approvedAnalysisSessions).values({ ...input, periodLabel: input.periodLabel ?? null });
  const sessionId = Number(result[0].insertId);
  return (await db.select().from(approvedAnalysisSessions).where(eq(approvedAnalysisSessions.id, sessionId)).limit(1))[0];
}

function normalizedSupplierName(name: string) {
  return name.trim().toLocaleLowerCase("ar").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ");
}

export async function saveInvoiceSettlementDecision(input: {
  workspaceId: number; approvedByUserId: number; supplierName: string; invoiceDate: string; lines: Array<{ productCode?: string; productName: string; invoiceQuantity: string; acceptedQuantity: string; matchMethod: string; exceptionReason?: string }>;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const normalizedName = normalizedSupplierName(input.supplierName) || "مورد غير مسمى";
  return db.transaction(async (tx) => {
    await tx.insert(supplierProfiles).values({ workspaceId: input.workspaceId, name: input.supplierName.trim() || "مورد غير مسمى", normalizedName })
      .onDuplicateKeyUpdate({ set: { isActive: true, updatedAt: new Date() } });
    const supplier = (await tx.select().from(supplierProfiles).where(and(eq(supplierProfiles.workspaceId, input.workspaceId), eq(supplierProfiles.normalizedName, normalizedName))).limit(1))[0];
    if (!supplier) throw new Error("Unable to create supplier profile");
    const result = await tx.insert(invoiceSettlements).values({ workspaceId: input.workspaceId, supplierId: supplier.id, approvedByUserId: input.approvedByUserId, decision: "approved", reconciliationSummary: { invoiceDate: input.invoiceDate, lineCount: input.lines.length, source: "manager_confirmed_without_image_or_ocr" }, approvedAt: new Date() });
    const settlementId = Number(result[0].insertId);
    const settlement = (await tx.select().from(invoiceSettlements).where(eq(invoiceSettlements.id, settlementId)).limit(1))[0];
    if (!settlement) throw new Error("Unable to save settlement");
    if (input.lines.length) await tx.insert(invoiceSettlementLines).values(input.lines.map((line) => ({ settlementId: settlement.id, productCode: line.productCode ?? null, productName: line.productName, invoiceQuantity: line.invoiceQuantity, acceptedQuantity: line.acceptedQuantity, matchMethod: line.matchMethod, exceptionReason: line.exceptionReason ?? null })));
    return settlement;
  });
}

export async function createOperationalAlerts(input: { workspaceId: number; sessionId: number; alerts: Array<{ clientAlertId: string; level: "urgent" | "review" | "watch" | "positive"; title: string; evidence: string; action: string }> }) {
  const db = getDb();
  if (!db || !input.alerts.length) return;
  await db.insert(operationalAlerts).values(input.alerts.map((alert) => ({ workspaceId: input.workspaceId, sessionId: input.sessionId, kind: "approved_analysis", level: alert.level, title: alert.title, explanation: alert.evidence, evidence: { clientAlertId: alert.clientAlertId, source: "approved_analysis_summary" }, suggestedAction: alert.action }))); 
}

export async function listOperationalAlerts(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(operationalAlerts).where(eq(operationalAlerts.workspaceId, workspaceId)).orderBy(desc(operationalAlerts.createdAt)).limit(80);
}

export async function updateOperationalAlertStatus(input: { workspaceId: number; alertId: number; status: "open" | "snoozed" | "resolved" }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  await db.update(operationalAlerts).set({ status: input.status, statusChangedAt: new Date() }).where(and(eq(operationalAlerts.workspaceId, input.workspaceId), eq(operationalAlerts.id, input.alertId)));
  return (await db.select().from(operationalAlerts).where(and(eq(operationalAlerts.workspaceId, input.workspaceId), eq(operationalAlerts.id, input.alertId))).limit(1))[0];
}

export async function getRetentionPolicy(workspaceId: number, userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  await db.insert(workspaceRetentionPolicies).values({ workspaceId, updatedByUserId: userId, rawSourceRetentionDays: 0, approvedMetadataRetentionDays: 365, auditEventRetentionDays: 2555 })
    .onDuplicateKeyUpdate({ set: { workspaceId } });
  return (await db.select().from(workspaceRetentionPolicies).where(eq(workspaceRetentionPolicies.workspaceId, workspaceId)).limit(1))[0];
}

export async function updateRetentionPolicy(input: { workspaceId: number; userId: number; approvedMetadataRetentionDays: number; auditEventRetentionDays: number }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  await db.insert(workspaceRetentionPolicies).values({ workspaceId: input.workspaceId, updatedByUserId: input.userId, rawSourceRetentionDays: 0, approvedMetadataRetentionDays: input.approvedMetadataRetentionDays, auditEventRetentionDays: input.auditEventRetentionDays })
    .onDuplicateKeyUpdate({ set: { rawSourceRetentionDays: 0, approvedMetadataRetentionDays: input.approvedMetadataRetentionDays, auditEventRetentionDays: input.auditEventRetentionDays, updatedByUserId: input.userId, updatedAt: new Date() } });
  return getRetentionPolicy(input.workspaceId, input.userId);
}

export async function listAuditEvents(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(auditEvents).where(eq(auditEvents.workspaceId, workspaceId)).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(40);
}

export async function saveApprovedOpenOrder(input: { workspaceId: number; createdByUserId: number; reference?: string; lines: Array<{ productCode?: string; productName: string; requestedQuantity: string; unitLabel?: string }> }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.transaction(async (tx) => {
    const result = await tx.insert(openOrders).values({ workspaceId: input.workspaceId, createdByUserId: input.createdByUserId, approvedByUserId: input.createdByUserId, status: "approved", reference: input.reference ?? null, note: "طلب منشأ يدويًا من قائمة مقترحات معتمدة.", approvedAt: new Date() });
    const orderId = Number(result[0].insertId);
    const order = (await tx.select().from(openOrders).where(eq(openOrders.id, orderId)).limit(1))[0];
    if (!order) throw new Error("Unable to create approved order");
    await tx.insert(openOrderLines).values(input.lines.map((line) => ({ orderId: order.id, productCode: line.productCode ?? null, productName: line.productName, requestedQuantity: line.requestedQuantity, unitLabel: line.unitLabel ?? null })));
    return order;
  });
}
