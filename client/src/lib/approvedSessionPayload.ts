import type { DashboardAnalytics } from "./analyticsEngine";
import type { ImportInspection } from "./pharmacyEngine";

export function makeApprovedSessionPayload(inspection: ImportInspection, analysis: DashboardAnalytics, periodLabel?: string) {
  return {
    sourceFileName: inspection.fileName,
    sourceFingerprint: inspection.fileFingerprint,
    sourceSheetCount: inspection.sheets.length,
    sourceRowCount: inspection.sheets.reduce((sum, sheet) => sum + sheet.quality.validRecords, 0),
    ...(periodLabel ? { periodLabel } : {}),
    mappingDecision: {
      sheets: inspection.sheets.map((sheet) => ({ name: sheet.name, headerRowIndex: sheet.headerRowIndex, mappings: sheet.mappings.map((mapping) => ({ sourceColumn: mapping.sourceColumn, field: mapping.field, approvalStatus: mapping.approvalStatus ?? "legacy_approved" })) })),
    },
    normalizedSummary: {
      metrics: Object.fromEntries(Object.entries(analysis.metrics).map(([key, metric]) => [key, { value: metric.value, availability: metric.availability, confidence: metric.confidence, source: metric.source }])),
      alerts: analysis.alerts.slice(0, 20).map((alert) => ({ id: alert.id, level: alert.level, title: alert.title, evidence: alert.evidence, action: alert.action })),
      totalRows: analysis.totalRows,
    },
    explainableAlerts: analysis.alerts.slice(0, 80).map((alert) => ({ clientAlertId: alert.id, level: alert.level, title: alert.title, evidence: alert.evidence, action: alert.action })),
  };
}
