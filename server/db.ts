import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createHash, randomBytes } from "node:crypto";
import { approvedAnalysisSessions, auditEvents, customerRequestAccessInvites, customerRequestEvents, customerRequestMessageTemplates, customerRequestSupplyAllocations, customerRequests, invoiceSettlementLines, invoiceSettlements, openOrderLines, openOrders, operatingDecisions, operationalAlerts, pharmacyWorkspaces, supplierArrivalSchedules, supplierProfiles, users, workspaceMembers, workspaceRetentionPolicies, type InsertUser, type WorkspaceAccessRole } from "../drizzle/schema";

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

function normalizeOperationalText(value: string) {
  return value.trim().toLocaleLowerCase("ar").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ");
}

function normalizePhone(value: string) {
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
  const western = value.replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit))).replace(/\D/g, "");
  if (western.length < 7 || western.length > 15) throw new Error("رقم هاتف العميل غير صالح.");
  return western;
}

export type CustomerRequestStatus = "requested" | "awaiting_supply" | "ready_to_contact" | "contacted" | "fulfilled" | "cancelled";

export async function listCustomerRequests(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(customerRequests)
    .where(eq(customerRequests.workspaceId, workspaceId))
    .orderBy(desc(customerRequests.updatedAt), desc(customerRequests.id)).limit(200);
}

export async function listCustomerRequestEvents(workspaceId: number, customerRequestId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(customerRequestEvents)
    .where(and(eq(customerRequestEvents.workspaceId, workspaceId), eq(customerRequestEvents.customerRequestId, customerRequestId)))
    .orderBy(desc(customerRequestEvents.createdAt), desc(customerRequestEvents.id)).limit(80);
}

export async function createCustomerRequest(input: {
  workspaceId: number; createdByUserId: number; customerName: string; customerPhone: string; productCode?: string; productName: string; requestedQuantity: string; note?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const normalizedPhone = normalizePhone(input.customerPhone);
  const normalizedProductName = normalizeOperationalText(input.productName);
  const activeStatuses: CustomerRequestStatus[] = ["requested", "awaiting_supply", "ready_to_contact", "contacted"];
  const sameCustomer = await db.select().from(customerRequests).where(and(
    eq(customerRequests.workspaceId, input.workspaceId),
    eq(customerRequests.normalizedCustomerPhone, normalizedPhone),
    inArray(customerRequests.status, activeStatuses),
  )).limit(30);
  const duplicate = sameCustomer.find((request) => {
    const sameCode = Boolean(input.productCode && request.productCode && request.productCode === input.productCode);
    return sameCode || request.normalizedProductName === normalizedProductName;
  });
  if (duplicate) return { request: duplicate, duplicate: true };

  const result = await db.insert(customerRequests).values({
    workspaceId: input.workspaceId,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    normalizedCustomerPhone: normalizedPhone,
    productCode: input.productCode?.trim() || null,
    productName: input.productName.trim(),
    normalizedProductName,
    requestedQuantity: input.requestedQuantity,
    createdByUserId: input.createdByUserId,
    lastUpdatedByUserId: input.createdByUserId,
    note: input.note?.trim() || null,
  });
  const requestId = Number(result[0].insertId);
  const request = (await db.select().from(customerRequests).where(eq(customerRequests.id, requestId)).limit(1))[0];
  if (!request) throw new Error("تعذر إنشاء طلب العميل.");
  await db.insert(customerRequestEvents).values({ workspaceId: input.workspaceId, customerRequestId: request.id, actorUserId: input.createdByUserId, eventType: "customer_request.created", note: input.note?.trim() || null, metadata: { productCode: request.productCode, requestedQuantity: input.requestedQuantity } });
  return { request, duplicate: false };
}

export async function updateCustomerRequestStatus(input: {
  workspaceId: number; customerRequestId: number; userId: number; status: CustomerRequestStatus; note?: string; closedReason?: string;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.transaction(async (tx) => {
    const request = (await tx.select().from(customerRequests).where(and(eq(customerRequests.workspaceId, input.workspaceId), eq(customerRequests.id, input.customerRequestId))).limit(1))[0];
    if (!request) throw new Error("لم نعثر على طلب العميل.");
    if (input.status === "contacted" && request.status !== "ready_to_contact") throw new Error("لا يمكن تسجيل تواصل قبل اعتماد إتاحة الصنف للعميل.");
    if (input.status === "fulfilled" && !["ready_to_contact", "contacted"].includes(request.status)) throw new Error("لا يمكن إغلاق الطلب كمكتمل قبل إتاحة الصنف أو تسجيل التواصل.");
    if (input.status === "cancelled" && !input.closedReason?.trim()) throw new Error("اكتب سبب إلغاء طلب العميل حفاظًا على السجل التشغيلي.");
    const now = new Date();
    await tx.update(customerRequests).set({
      status: input.status,
      lastUpdatedByUserId: input.userId,
      contactedAt: input.status === "contacted" ? now : request.contactedAt,
      fulfilledAt: input.status === "fulfilled" ? now : request.fulfilledAt,
      closedReason: input.status === "cancelled" ? input.closedReason?.trim() || null : request.closedReason,
      updatedAt: now,
    }).where(eq(customerRequests.id, request.id));
    await tx.insert(customerRequestEvents).values({ workspaceId: input.workspaceId, customerRequestId: request.id, actorUserId: input.userId, eventType: `customer_request.${input.status}`, note: input.note?.trim() || null, metadata: { from: request.status, to: input.status, closedReason: input.closedReason?.trim() || null } });
    return (await tx.select().from(customerRequests).where(eq(customerRequests.id, request.id)).limit(1))[0];
  });
}

export async function listSupplyCandidatesForCustomerRequests(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const [requests, settlementLines] = await Promise.all([
    db.select().from(customerRequests).where(and(eq(customerRequests.workspaceId, workspaceId), inArray(customerRequests.status, ["requested", "awaiting_supply"]))).orderBy(desc(customerRequests.createdAt)).limit(150),
    db.select({ line: invoiceSettlementLines, settlementId: invoiceSettlements.id, approvedAt: invoiceSettlements.approvedAt })
      .from(invoiceSettlementLines).innerJoin(invoiceSettlements, eq(invoiceSettlementLines.settlementId, invoiceSettlements.id))
      .where(and(eq(invoiceSettlements.workspaceId, workspaceId), eq(invoiceSettlements.decision, "approved"))).orderBy(desc(invoiceSettlements.createdAt)).limit(300),
  ]);
  const allocations = await db.select({ settlementLineId: customerRequestSupplyAllocations.settlementLineId, allocatedQuantity: customerRequestSupplyAllocations.allocatedQuantity })
    .from(customerRequestSupplyAllocations).where(eq(customerRequestSupplyAllocations.workspaceId, workspaceId)).limit(500);
  const allocatedByLine = new Map<number, number>();
  allocations.forEach((allocation) => allocatedByLine.set(allocation.settlementLineId, (allocatedByLine.get(allocation.settlementLineId) ?? 0) + Number(allocation.allocatedQuantity)));
  return requests.flatMap((request) => settlementLines.flatMap(({ line, settlementId, approvedAt }) => {
    const sameCode = Boolean(request.productCode && line.productCode && request.productCode === line.productCode);
    const sameName = normalizeOperationalText(request.productName) === normalizeOperationalText(line.productName);
    if (!sameCode && !sameName) return [];
    const remainingForRequest = Math.max(0, Number(request.requestedQuantity) - Number(request.allocatedQuantity));
    const remainingForLine = Math.max(0, Number(line.acceptedQuantity) - (allocatedByLine.get(line.id) ?? 0));
    if (!remainingForRequest || !remainingForLine) return [];
    return [{ customerRequestId: request.id, customerName: request.customerName, productName: request.productName, productCode: request.productCode, requestedRemaining: remainingForRequest, settlementLineId: line.id, settlementId, availableQuantity: remainingForLine, matchMethod: sameCode ? "code" : "name", approvedAt }];
  }));
}

export async function approveCustomerSupplyAllocations(input: {
  workspaceId: number; approvedByUserId: number; allocations: Array<{ customerRequestId: number; settlementLineId: number; allocatedQuantity: string }>;
}) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.transaction(async (tx) => {
    const updated = [] as Array<typeof customerRequests.$inferSelect>;
    for (const allocation of input.allocations) {
      const request = (await tx.select().from(customerRequests).where(and(eq(customerRequests.workspaceId, input.workspaceId), eq(customerRequests.id, allocation.customerRequestId))).limit(1))[0];
      const settlementLine = (await tx.select({ line: invoiceSettlementLines, settlement: invoiceSettlements }).from(invoiceSettlementLines).innerJoin(invoiceSettlements, eq(invoiceSettlementLines.settlementId, invoiceSettlements.id)).where(and(eq(invoiceSettlementLines.id, allocation.settlementLineId), eq(invoiceSettlements.workspaceId, input.workspaceId), eq(invoiceSettlements.decision, "approved"))).limit(1))[0];
      if (!request || !settlementLine) throw new Error("تعذر التحقق من طلب العميل أو بند الفاتورة المعتمد.");
      if (!( ["requested", "awaiting_supply"] as CustomerRequestStatus[]).includes(request.status as CustomerRequestStatus)) throw new Error("هذه الحالة لم تعد متاحة لتخصيص توريد جديد.");
      const sameCode = Boolean(request.productCode && settlementLine.line.productCode && request.productCode === settlementLine.line.productCode);
      const sameName = normalizeOperationalText(request.productName) === normalizeOperationalText(settlementLine.line.productName);
      if (!sameCode && !sameName) throw new Error("لا يمكن تخصيص بند فاتورة لصنف لا يطابق طلب العميل.");
      const amount = Number(allocation.allocatedQuantity);
      const existingAllocations = await tx.select({ allocatedQuantity: customerRequestSupplyAllocations.allocatedQuantity }).from(customerRequestSupplyAllocations).where(eq(customerRequestSupplyAllocations.settlementLineId, settlementLine.line.id)).limit(500);
      const usedFromLine = existingAllocations.reduce((total, item) => total + Number(item.allocatedQuantity), 0);
      const requestRemaining = Number(request.requestedQuantity) - Number(request.allocatedQuantity);
      const lineRemaining = Number(settlementLine.line.acceptedQuantity) - usedFromLine;
      if (!Number.isFinite(amount) || amount <= 0 || amount > requestRemaining || amount > lineRemaining) throw new Error("كمية التخصيص تتجاوز المتاح من الفاتورة أو المتبقي للعميل.");
      const allocatedQuantity = Number(request.allocatedQuantity) + amount;
      const ready = allocatedQuantity >= Number(request.requestedQuantity);
      const now = new Date();
      await tx.insert(customerRequestSupplyAllocations).values({ workspaceId: input.workspaceId, customerRequestId: request.id, settlementLineId: settlementLine.line.id, allocatedQuantity: allocation.allocatedQuantity, approvedByUserId: input.approvedByUserId });
      await tx.update(customerRequests).set({ allocatedQuantity: allocatedQuantity.toFixed(3), status: ready ? "ready_to_contact" : "awaiting_supply", readyAt: ready ? now : request.readyAt, lastUpdatedByUserId: input.approvedByUserId, updatedAt: now }).where(eq(customerRequests.id, request.id));
      await tx.insert(customerRequestEvents).values({ workspaceId: input.workspaceId, customerRequestId: request.id, actorUserId: input.approvedByUserId, eventType: ready ? "customer_request.ready_to_contact" : "customer_request.partially_supplied", metadata: { settlementLineId: settlementLine.line.id, allocatedQuantity: allocation.allocatedQuantity, remainingQuantity: Math.max(0, Number(request.requestedQuantity) - allocatedQuantity) } });
      const saved = (await tx.select().from(customerRequests).where(eq(customerRequests.id, request.id)).limit(1))[0];
      if (saved) updated.push(saved);
    }
    return updated;
  });
}

export async function createCustomerRequestAccessInvite(input: { workspaceId: number; createdByUserId: number; expiresInHours: number }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const code = randomBytes(12).toString("hex").toUpperCase().match(/.{1,4}/g)?.join("-") ?? randomBytes(12).toString("hex");
  const tokenHash = createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);
  await db.insert(customerRequestAccessInvites).values({ workspaceId: input.workspaceId, tokenHash, createdByUserId: input.createdByUserId, expiresAt });
  return { code, expiresAt };
}

export async function redeemCustomerRequestAccessInvite(input: { code: string; userId: number }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const tokenHash = createHash("sha256").update(input.code.trim().toUpperCase()).digest("hex");
  return db.transaction(async (tx) => {
    const invite = (await tx.select().from(customerRequestAccessInvites).where(eq(customerRequestAccessInvites.tokenHash, tokenHash)).limit(1))[0];
    if (!invite || invite.redeemedAt || invite.revokedAt || invite.expiresAt.getTime() <= Date.now()) throw new Error("رمز انضمام فريق الطلبات غير صالح أو انتهت صلاحيته.");
    const existing = (await tx.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, invite.workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1))[0];
    if (!existing) await tx.insert(workspaceMembers).values({ workspaceId: invite.workspaceId, userId: input.userId, accessRole: "customer_requests", status: "active" });
    await tx.update(customerRequestAccessInvites).set({ redeemedByUserId: input.userId, redeemedAt: new Date() }).where(eq(customerRequestAccessInvites.id, invite.id));
    return { workspaceId: invite.workspaceId, accessRole: existing?.accessRole ?? "customer_requests" };
  });
}

export async function listCustomerRequestMessageTemplates(workspaceId: number, includeInactive = false) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(customerRequestMessageTemplates)
    .where(includeInactive ? eq(customerRequestMessageTemplates.workspaceId, workspaceId) : and(eq(customerRequestMessageTemplates.workspaceId, workspaceId), eq(customerRequestMessageTemplates.isActive, true)))
    .orderBy(desc(customerRequestMessageTemplates.isDefault), desc(customerRequestMessageTemplates.updatedAt), desc(customerRequestMessageTemplates.id)).limit(60);
}

export async function saveCustomerRequestMessageTemplate(input: { workspaceId: number; userId: number; id?: number; name: string; body: string; isDefault: boolean; isActive: boolean }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const name = input.name.trim();
  const body = input.body.trim();
  if (!name || !body) throw new Error("اسم القالب ونص الرسالة مطلوبان.");
  return db.transaction(async (tx) => {
    if (input.isDefault) await tx.update(customerRequestMessageTemplates).set({ isDefault: false, updatedByUserId: input.userId }).where(eq(customerRequestMessageTemplates.workspaceId, input.workspaceId));
    if (input.id) {
      const current = (await tx.select().from(customerRequestMessageTemplates).where(and(eq(customerRequestMessageTemplates.id, input.id), eq(customerRequestMessageTemplates.workspaceId, input.workspaceId))).limit(1))[0];
      if (!current) throw new Error("لم نعثر على قالب الرسالة المطلوب.");
      await tx.update(customerRequestMessageTemplates).set({ name, body, isDefault: input.isDefault, isActive: input.isActive, updatedByUserId: input.userId, updatedAt: new Date() }).where(eq(customerRequestMessageTemplates.id, current.id));
      return (await tx.select().from(customerRequestMessageTemplates).where(eq(customerRequestMessageTemplates.id, current.id)).limit(1))[0];
    }
    const result = await tx.insert(customerRequestMessageTemplates).values({ workspaceId: input.workspaceId, name, body, isDefault: input.isDefault, isActive: input.isActive, createdByUserId: input.userId, updatedByUserId: input.userId });
    return (await tx.select().from(customerRequestMessageTemplates).where(eq(customerRequestMessageTemplates.id, Number(result[0].insertId))).limit(1))[0];
  });
}

export async function listCustomerRequestResponseMetrics(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const requests = await db.select().from(customerRequests).where(eq(customerRequests.workspaceId, workspaceId)).orderBy(desc(customerRequests.createdAt)).limit(500);
  const now = Date.now();
  const open = requests.filter((request) => ["requested", "awaiting_supply", "ready_to_contact", "contacted"].includes(request.status));
  const overdue = open.filter((request) => now - request.createdAt.getTime() >= 24 * 60 * 60 * 1000);
  const readyDurations = requests.flatMap((request) => request.readyAt ? [(request.readyAt.getTime() - request.createdAt.getTime()) / 3_600_000] : []);
  const contactDurations = requests.flatMap((request) => request.readyAt && request.contactedAt ? [(request.contactedAt.getTime() - request.readyAt.getTime()) / 60_000] : []);
  const fulfillmentDurations = requests.flatMap((request) => request.fulfilledAt ? [(request.fulfilledAt.getTime() - request.createdAt.getTime()) / 3_600_000] : []);
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    total: requests.length,
    openCount: open.length,
    requestedCount: requests.filter((request) => request.status === "requested").length,
    readyToContactCount: requests.filter((request) => request.status === "ready_to_contact").length,
    overdueCount: overdue.length,
    averageHoursToReady: average(readyDurations),
    averageMinutesToContact: average(contactDurations),
    averageHoursToFulfill: average(fulfillmentDurations),
  };
}

export async function listWorkspaceTeamMembers(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select({ userId: workspaceMembers.userId, employeeCode: workspaceMembers.employeeCode, accessRole: workspaceMembers.accessRole, status: workspaceMembers.status, joinedAt: workspaceMembers.joinedAt, name: users.name, email: users.email })
    .from(workspaceMembers).innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(desc(workspaceMembers.joinedAt)).limit(200);
}

export async function setWorkspaceMemberEmployeeCode(input: { workspaceId: number; userId: number; employeeCode: string }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const employeeCode = input.employeeCode.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(employeeCode)) throw new Error("كود الموظف يجب أن يتكون من 3 إلى 40 حرفًا أو رقمًا أو شرطة فقط.");
  const member = (await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1))[0];
  if (!member) throw new Error("لم نعثر على عضو فريق داخل مساحة العمل.");
  const duplicate = (await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.employeeCode, employeeCode))).limit(1))[0];
  if (duplicate && duplicate.userId !== input.userId) throw new Error("كود الموظف مستخدم بالفعل داخل هذه الصيدلية. اختر كودًا مختلفًا.");
  await db.update(workspaceMembers).set({ employeeCode, updatedAt: new Date() }).where(eq(workspaceMembers.id, member.id));
  return { ...member, employeeCode };
}

export async function listCustomerRequestTeamPerformance(input: { workspaceId: number; sinceDays: number }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000);
  const rows = await db.select({ event: customerRequestEvents, request: customerRequests, employeeCode: workspaceMembers.employeeCode, name: users.name })
    .from(customerRequestEvents)
    .innerJoin(customerRequests, eq(customerRequestEvents.customerRequestId, customerRequests.id))
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, customerRequestEvents.actorUserId)))
    .leftJoin(users, eq(users.id, customerRequestEvents.actorUserId))
    .where(and(eq(customerRequestEvents.workspaceId, input.workspaceId), sql`${customerRequestEvents.createdAt} >= ${since}`))
    .orderBy(desc(customerRequestEvents.createdAt)).limit(1500);
  type PerformanceRow = { userId: number; name: string; employeeCode: string | null; createdCount: number; contactedCount: number; fulfilledCount: number; cancelledCount: number; contactDurations: number[]; lastActivityAt: Date | null };
  const performance = new Map<number, PerformanceRow>();
  for (const row of rows) {
    const actorUserId = row.event.actorUserId;
    if (!actorUserId) continue;
    const current: PerformanceRow = performance.get(actorUserId) ?? { userId: actorUserId, name: row.name?.trim() || "موظف غير مسمى", employeeCode: row.employeeCode ?? null, createdCount: 0, contactedCount: 0, fulfilledCount: 0, cancelledCount: 0, contactDurations: [], lastActivityAt: null };
    if (row.event.eventType === "customer_request.created") current.createdCount += 1;
    if (row.event.eventType === "customer_request.contacted") {
      current.contactedCount += 1;
      if (row.request.readyAt) current.contactDurations.push(Math.max(0, (row.event.createdAt.getTime() - row.request.readyAt.getTime()) / 60_000));
    }
    if (row.event.eventType === "customer_request.fulfilled") current.fulfilledCount += 1;
    if (row.event.eventType === "customer_request.cancelled") current.cancelledCount += 1;
    if (!current.lastActivityAt || row.event.createdAt > current.lastActivityAt) current.lastActivityAt = row.event.createdAt;
    performance.set(actorUserId, current);
  }
  return Array.from(performance.values()).map((item) => ({ ...item, averageMinutesToContact: item.contactDurations.length ? item.contactDurations.reduce((sum: number, value: number) => sum + value, 0) / item.contactDurations.length : null, contactDurations: undefined })).sort((a, b) => b.contactedCount - a.contactedCount || b.fulfilledCount - a.fulfilledCount);
}

export async function listSupplierArrivalSchedules(workspaceId: number) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  return db.select().from(supplierArrivalSchedules).where(eq(supplierArrivalSchedules.workspaceId, workspaceId)).orderBy(supplierArrivalSchedules.expectedAt).limit(300);
}

export async function createSupplierArrivalSchedule(input: { workspaceId: number; supplierName: string; expectedAt: Date; note?: string; createdByUserId: number }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const supplierName = input.supplierName.trim();
  if (!supplierName) throw new Error("اسم المورد مطلوب.");
  const result = await db.insert(supplierArrivalSchedules).values({ workspaceId: input.workspaceId, supplierName, expectedAt: input.expectedAt, note: input.note?.trim() || null, createdByUserId: input.createdByUserId, updatedByUserId: input.createdByUserId });
  return (await db.select().from(supplierArrivalSchedules).where(eq(supplierArrivalSchedules.id, Number(result[0].insertId))).limit(1))[0];
}

export async function updateSupplierArrivalSchedule(input: { workspaceId: number; scheduleId: number; status: "scheduled" | "arrived" | "late" | "cancelled"; note?: string; updatedByUserId: number }) {
  const db = getDb();
  if (!db) throw new Error("Database is not configured");
  const current = (await db.select().from(supplierArrivalSchedules).where(and(eq(supplierArrivalSchedules.id, input.scheduleId), eq(supplierArrivalSchedules.workspaceId, input.workspaceId))).limit(1))[0];
  if (!current) throw new Error("لم نعثر على موعد المورد.");
  const values = { status: input.status, note: input.note?.trim() || current.note, updatedByUserId: input.updatedByUserId, updatedAt: new Date(), arrivedAt: input.status === "arrived" ? new Date() : current.arrivedAt };
  await db.update(supplierArrivalSchedules).set(values).where(eq(supplierArrivalSchedules.id, current.id));
  return (await db.select().from(supplierArrivalSchedules).where(eq(supplierArrivalSchedules.id, current.id)).limit(1))[0];
}
