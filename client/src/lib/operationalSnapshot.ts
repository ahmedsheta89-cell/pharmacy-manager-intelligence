export type OperationalSnapshotPreview = {
  valid: boolean;
  issues: string[];
  exportedAt?: string;
  workspaceId?: number;
  counts?: { requests: number; suppliers: number; arrivals: number; templates: number; auditEvents: number };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function inspectOperationalSnapshot(value: unknown): OperationalSnapshotPreview {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["الملف ليس لقطة تشغيلية JSON صالحة."] };
  if (value.format !== "pharmacy-manager-operational-snapshot/v1") issues.push("إصدار اللقطة غير مدعوم أو الملف ليس من هذه الأداة.");
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) issues.push("تاريخ التصدير غير صالح.");
  if (typeof value.workspaceId !== "number" || !Number.isInteger(value.workspaceId) || value.workspaceId <= 0) issues.push("معرّف مساحة العمل غير صالح.");
  if (!isRecord(value.data)) return { valid: false, issues: [...issues, "بيانات اللقطة غير مكتملة."] };

  const data = value.data;
  const sources = ["requests", "suppliers", "arrivals", "messageTemplates", "auditEvents"] as const;
  for (const source of sources) if (!Array.isArray(data[source])) issues.push(`قسم ${source} غير صالح.`);
  if (!isRecord(data.retentionPolicy)) issues.push("سياسة الاحتفاظ غير صالحة.");

  return {
    valid: issues.length === 0,
    issues,
    exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : undefined,
    workspaceId: typeof value.workspaceId === "number" ? value.workspaceId : undefined,
    counts: sources.every((source) => Array.isArray(data[source])) ? {
      requests: (data.requests as unknown[]).length,
      suppliers: (data.suppliers as unknown[]).length,
      arrivals: (data.arrivals as unknown[]).length,
      templates: (data.messageTemplates as unknown[]).length,
      auditEvents: (data.auditEvents as unknown[]).length,
    } : undefined,
  };
}
