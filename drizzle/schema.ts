import {
  boolean,
  decimal,
  foreignKey,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * هوية المستخدم القادمة من تسجيل دخول Manus.
 * يحدد role الإداري الأساسي، بينما تحدد عضوية مساحة العمل صلاحية التنفيذ الدقيقة.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const pharmacyWorkspaces = mysqlTable("pharmacy_workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  timezone: varchar("timezone", { length: 64 }).default("Africa/Cairo").notNull(),
  ownerUserId: int("ownerUserId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  userId: int("userId").notNull().references(() => users.id),
  accessRole: mysqlEnum("accessRole", ["owner", "manager", "operator", "reviewer"]).notNull(),
  status: mysqlEnum("membershipStatus", ["active", "suspended"]).default("active").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("workspace_member_unique").on(table.workspaceId, table.userId),
  index("workspace_member_user_idx").on(table.userId),
]);

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  code: varchar("code", { length: 64 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("branch_workspace_code_unique").on(table.workspaceId, table.code),
  index("branch_workspace_active_idx").on(table.workspaceId, table.isActive),
]);

/**
 * لا يحمل هذا الجدول ملف Excel أو صفوفه الخام؛ إنما يحمل ملخص التحليل المعتمد،
 * وبصمة مصدره وقرار المدير اللازم لتتبّع التشغيل لاحقًا.
 */
export const approvedAnalysisSessions = mysqlTable("approved_analysis_sessions", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  branchId: int("branchId").references(() => branches.id),
  approvedByUserId: int("approvedByUserId").notNull().references(() => users.id),
  sourceFileName: varchar("sourceFileName", { length: 255 }).notNull(),
  sourceFingerprint: varchar("sourceFingerprint", { length: 128 }).notNull(),
  sourceSheetCount: int("sourceSheetCount").notNull(),
  sourceRowCount: int("sourceRowCount").notNull(),
  periodLabel: varchar("periodLabel", { length: 120 }),
  mappingDecision: json("mappingDecision").$type<Record<string, unknown>>().notNull(),
  normalizedSummary: json("normalizedSummary").$type<Record<string, unknown>>().notNull(),
  status: mysqlEnum("analysisSessionStatus", ["approved", "archived"]).default("approved").notNull(),
  approvedAt: timestamp("approvedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("analysis_session_workspace_branch_idx").on(table.workspaceId, table.branchId, table.approvedAt),
  index("analysis_session_fingerprint_idx").on(table.workspaceId, table.sourceFingerprint),
]);

export const supplierProfiles = mysqlTable("supplier_profiles", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  name: varchar("name", { length: 200 }).notNull(),
  normalizedName: varchar("normalizedName", { length: 200 }).notNull(),
  contactLabel: varchar("contactLabel", { length: 160 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("supplier_workspace_name_unique").on(table.workspaceId, table.normalizedName),
]);

export const openOrders = mysqlTable("open_orders", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  branchId: int("branchId").references(() => branches.id),
  supplierId: int("supplierId").references(() => supplierProfiles.id),
  sourceSessionId: int("sourceSessionId").references(() => approvedAnalysisSessions.id),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  approvedByUserId: int("approvedByUserId").references(() => users.id),
  status: mysqlEnum("orderStatus", ["draft", "pending_approval", "approved", "partially_received", "settled", "cancelled"]).default("draft").notNull(),
  reference: varchar("reference", { length: 100 }),
  note: text("note"),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("open_order_workspace_status_idx").on(table.workspaceId, table.status, table.updatedAt),
  index("open_order_supplier_idx").on(table.supplierId, table.status),
]);

export const openOrderLines = mysqlTable("open_order_lines", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => openOrders.id),
  productCode: varchar("productCode", { length: 120 }),
  productName: varchar("productName", { length: 255 }).notNull(),
  unitLabel: varchar("unitLabel", { length: 64 }),
  requestedQuantity: decimal("requestedQuantity", { precision: 14, scale: 3 }).notNull(),
  settledQuantity: decimal("settledQuantity", { precision: 14, scale: 3 }).default("0.000").notNull(),
  documentedUnitPrice: decimal("documentedUnitPrice", { precision: 14, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("open_order_line_order_idx").on(table.orderId),
  index("open_order_line_product_idx").on(table.productCode),
]);

/** قرار التسوية فقط؛ لا صورة فاتورة ولا نص OCR خام ولا مرفق أصل في قاعدة البيانات. */
export const invoiceSettlements = mysqlTable("invoice_settlements", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  branchId: int("branchId").references(() => branches.id),
  supplierId: int("supplierId").references(() => supplierProfiles.id),
  sourceOrderId: int("sourceOrderId").references(() => openOrders.id),
  approvedByUserId: int("approvedByUserId").notNull().references(() => users.id),
  invoiceReference: varchar("invoiceReference", { length: 120 }),
  decision: mysqlEnum("settlementDecision", ["approved", "rejected", "needs_review"]).notNull(),
  reconciliationSummary: json("reconciliationSummary").$type<Record<string, unknown>>().notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("invoice_settlement_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("invoice_settlement_supplier_idx").on(table.supplierId, table.createdAt),
]);

export const invoiceSettlementLines = mysqlTable("invoice_settlement_lines", {
  id: int("id").autoincrement().primaryKey(),
  settlementId: int("settlementId").notNull().references(() => invoiceSettlements.id),
  orderLineId: int("orderLineId").references(() => openOrderLines.id),
  productCode: varchar("productCode", { length: 120 }),
  productName: varchar("productName", { length: 255 }).notNull(),
  invoiceQuantity: decimal("invoiceQuantity", { precision: 14, scale: 3 }).notNull(),
  acceptedQuantity: decimal("acceptedQuantity", { precision: 14, scale: 3 }).notNull(),
  documentedUnitPrice: decimal("documentedUnitPrice", { precision: 14, scale: 2 }),
  matchMethod: varchar("matchMethod", { length: 64 }).notNull(),
  exceptionReason: varchar("exceptionReason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("invoice_settlement_line_settlement_idx").on(table.settlementId),
]);

export const operationalAlerts = mysqlTable("operational_alerts", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  branchId: int("branchId").references(() => branches.id),
  sessionId: int("sessionId").references(() => approvedAnalysisSessions.id),
  kind: varchar("kind", { length: 80 }).notNull(),
  level: mysqlEnum("alertLevel", ["urgent", "review", "watch", "positive"]).notNull(),
  status: mysqlEnum("alertStatus", ["open", "snoozed", "resolved"]).default("open").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  explanation: text("explanation").notNull(),
  evidence: json("evidence").$type<Record<string, unknown>>().notNull(),
  suggestedAction: varchar("suggestedAction", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  statusChangedAt: timestamp("statusChangedAt").defaultNow().notNull(),
}, (table) => [
  index("operational_alert_workspace_status_idx").on(table.workspaceId, table.status, table.level, table.createdAt),
  index("operational_alert_branch_idx").on(table.branchId, table.status),
]);

export const operatingDecisions = mysqlTable("operating_decisions", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  clientDecisionKey: varchar("clientDecisionKey", { length: 180 }).notNull(),
  alertId: int("alertId").references(() => operationalAlerts.id),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id),
  status: mysqlEnum("decisionStatus", ["open", "deferred", "done"]).default("open").notNull(),
  priorityRank: int("priorityRank").notNull(),
  actionLabel: varchar("actionLabel", { length: 255 }).notNull(),
  reason: text("reason").notNull(),
  managerNote: text("managerNote"),
  dueAt: timestamp("dueAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("operating_decision_workspace_key_unique").on(table.workspaceId, table.clientDecisionKey),
  index("operating_decision_workspace_status_idx").on(table.workspaceId, table.status, table.priorityRank, table.updatedAt),
]);

export const branchTransferSuggestions = mysqlTable("branch_transfer_suggestions", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  fromBranchId: int("fromBranchId").notNull().references(() => branches.id),
  toBranchId: int("toBranchId").notNull().references(() => branches.id),
  productCode: varchar("productCode", { length: 120 }),
  productName: varchar("productName", { length: 255 }).notNull(),
  suggestedQuantity: decimal("suggestedQuantity", { precision: 14, scale: 3 }).notNull(),
  explanation: text("explanation").notNull(),
  evidence: json("evidence").$type<Record<string, unknown>>().notNull(),
  status: mysqlEnum("transferSuggestionStatus", ["proposed", "approved", "rejected", "expired"]).default("proposed").notNull(),
  decidedByUserId: int("decidedByUserId").references(() => users.id),
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "branch_transfer_workspace_fk",
    columns: [table.workspaceId],
    foreignColumns: [pharmacyWorkspaces.id],
  }),
  index("branch_transfer_workspace_status_idx").on(table.workspaceId, table.status, table.createdAt),
]);

/** سجل تدقيق كتابي فقط؛ لن توفّر طبقة API أي تعديل أو حذف لهذا السجل. */
export const auditEvents = mysqlTable("audit_events", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull().references(() => pharmacyWorkspaces.id),
  actorUserId: int("actorUserId").references(() => users.id),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 80 }),
  metadata: json("metadata").$type<Record<string, unknown>>().notNull(),
  previousEventHash: varchar("previousEventHash", { length: 128 }),
  eventHash: varchar("eventHash", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("audit_event_hash_unique").on(table.eventHash),
  index("audit_event_workspace_created_idx").on(table.workspaceId, table.createdAt),
]);

export const workspaceRetentionPolicies = mysqlTable("workspace_retention_policies", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  rawSourceRetentionDays: int("rawSourceRetentionDays").default(0).notNull(),
  approvedMetadataRetentionDays: int("approvedMetadataRetentionDays").default(365).notNull(),
  auditEventRetentionDays: int("auditEventRetentionDays").default(2555).notNull(),
  updatedByUserId: int("updatedByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    name: "retention_workspace_fk",
    columns: [table.workspaceId],
    foreignColumns: [pharmacyWorkspaces.id],
  }),
  foreignKey({
    name: "retention_updated_by_fk",
    columns: [table.updatedByUserId],
    foreignColumns: [users.id],
  }),
  uniqueIndex("retention_policy_workspace_unique").on(table.workspaceId),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type WorkspaceAccessRole = typeof workspaceMembers.$inferSelect["accessRole"];
