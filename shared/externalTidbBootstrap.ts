import { createHash } from "node:crypto";

export const EXTERNAL_TIDB_SCHEMA = "test";
export const EXTERNAL_TIDB_APPLY_CONFIRMATION = "APPLY_TIDB_TEST_SCHEMA_V1";
export const REVIEWED_TIDB_DELTA_SHA256 = "d67c355960523300698561befcfc5b128491853afc887ea6c7b6fd15eda7fc67";

export const EXTERNAL_TIDB_TABLES = [
  "users", "pharmacy_workspaces", "workspace_members", "branches", "approved_analysis_sessions", "supplier_profiles", "supplier_arrival_schedules", "open_orders", "open_order_lines", "invoice_settlements", "invoice_settlement_lines", "customer_requests", "customer_request_supply_allocations", "customer_request_events", "customer_request_access_invites", "customer_request_message_templates", "operational_alerts", "operating_decisions", "branch_transfer_suggestions", "audit_events", "workspace_retention_policies",
] as const;

export type ExternalTidbStatement = {
  kind: "foreignKey" | "index";
  name: string;
  sql: string;
};

export function validateExternalTidbConnection(databaseUrl: string | undefined, schema: string | undefined) {
  const errors: string[] = [];
  if (schema !== EXTERNAL_TIDB_SCHEMA) errors.push(`يجب أن يكون EXTERNAL_DB_EXPECTED_SCHEMA مساويًا لـ ${EXTERNAL_TIDB_SCHEMA}.`);
  if (!databaseUrl) return { valid: false, errors: [...errors, "DATABASE_URL_TIDB_TEST غير مُعد."] } as const;
  try {
    const parsed = new URL(databaseUrl);
    const databaseName = decodeURIComponent(parsed.pathname).replace(/^\/+/, "").split("/")[0];
    if (!/^mysqls?:$/.test(parsed.protocol)) errors.push("عنوان الاتصال يجب أن يستخدم بروتوكول MySQL.");
    if (!parsed.hostname.endsWith("tidbcloud.com")) errors.push("عنوان الاتصال لا يشير إلى TiDB Cloud.");
    if (databaseName !== EXTERNAL_TIDB_SCHEMA) errors.push(`عنوان الاتصال يجب أن يشير إلى قاعدة ${EXTERNAL_TIDB_SCHEMA} الاختبارية.`);
  } catch {
    errors.push("عنوان الاتصال غير صالح.");
  }
  return { valid: errors.length === 0, errors } as const;
}

export function parseReviewedTidbStatements(sql: string): ExternalTidbStatement[] {
  const prohibited = /(^|;)\s*(DROP|TRUNCATE|DELETE|INSERT|UPDATE|CREATE\s+TABLE|ALTER\s+TABLE[^;]*\sDROP)\b/i;
  if (prohibited.test(sql)) throw new Error("حزمة TiDB تحتوي أمرًا غير مسموح به.");
  const lines = sql.trim().split(/\r?\n/).filter(Boolean);
  const statements = lines.map((line) => {
    if (!line.endsWith(";")) throw new Error("كل عبارة TiDB يجب أن تنتهي بفاصلة منقوطة.");
    const foreignKey = line.match(/^ALTER TABLE `[^`]+` ADD CONSTRAINT `([^`]+)` FOREIGN KEY /);
    if (foreignKey) return { kind: "foreignKey" as const, name: foreignKey[1], sql: line };
    const index = line.match(/^CREATE (?:UNIQUE )?INDEX `([^`]+)` ON /);
    if (index) return { kind: "index" as const, name: index[1], sql: line };
    throw new Error("حزمة TiDB تحتوي صيغة ليست قيد علاقة أو فهرسًا.");
  });
  if (statements.length !== 86) throw new Error(`عدد عبارات TiDB غير متوقع: ${statements.length}.`);
  if (createHash("sha256").update(sql.trimEnd() + "\n").digest("hex") !== REVIEWED_TIDB_DELTA_SHA256) {
    throw new Error("بصمة حزمة TiDB لا تطابق النسخة المراجعة.");
  }
  return statements;
}

export function pendingExternalTidbStatements(statements: ExternalTidbStatement[], foreignKeys: Iterable<string>, indexes: Iterable<string>) {
  const foreignKeySet = new Set(foreignKeys);
  const indexSet = new Set(indexes);
  return statements.filter((statement) => statement.kind === "foreignKey" ? !foreignKeySet.has(statement.name) : !indexSet.has(statement.name));
}

export function summarizeExternalTidbStatements(statements: ExternalTidbStatement[]) {
  return {
    foreignKeys: statements.filter((statement) => statement.kind === "foreignKey").length,
    indexes: statements.filter((statement) => statement.kind === "index").length,
  };
}
