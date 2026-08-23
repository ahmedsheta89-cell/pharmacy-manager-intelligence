import type { ColumnMapping } from "./pharmacyEngine";

export function isApprovedMapping(mapping: Pick<ColumnMapping, "field" | "approvalStatus">) {
  return mapping.field !== "unknown" && (mapping.approvalStatus === undefined || mapping.approvalStatus === "approved" || mapping.approvalStatus === "overridden");
}
