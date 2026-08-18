/**
 * نبض العيادة التنفيذي — مقارنة نسختين من قواعد إعادة الطلب.
 * تلتقط لقطتين للقواعد الحالية وتعرض الفروق بصريًا: الجديد، المعدّل، والمُزال.
 * كل شيء يبقى محليًا داخل المتصفح.
 */
import type { ReorderRule } from "./inventoryEngine";
import type { ReorderRules } from "./reorderRules";

export type RuleDiffKind = "added" | "changed" | "removed" | "unchanged";

export interface RuleDiffRow {
  itemId: string;
  kind: RuleDiffKind;
  previous?: Pick<ReorderRule, "reorderLevel" | "targetStock">;
  current?: Pick<ReorderRule, "reorderLevel" | "targetStock">;
}

export interface RulesComparison {
  rows: RuleDiffRow[];
  summary: { added: number; changed: number; removed: number; unchanged: number };
  snapshotDate: string;
}

export function captureRulesSnapshot(rules: ReorderRules) {
  return Object.fromEntries(Object.entries(rules).map(([id, rule]: [string, unknown]) => { const typed = rule as ReorderRule; return [id, { reorderLevel: typed.reorderLevel, targetStock: typed.targetStock }]; }));
}

export type RulesSnapshot = Record<string, Pick<ReorderRule, "reorderLevel" | "targetStock">>;

export function compareRulesSnapshots(previous: RulesSnapshot, current: RulesSnapshot): RulesComparison {
  const rowMap = new Map<string, RuleDiffRow>();
  const itemIds = Array.from(new Set([...Object.keys(previous), ...Object.keys(current)]));
  for (const itemId of itemIds) {
    const before = previous[itemId];
    const after = current[itemId];
    if (!before && after) rowMap.set(itemId, { itemId, kind: "added", current: after });
    else if (before && !after) rowMap.set(itemId, { itemId, kind: "removed", previous: before });
    else if (before && after && (before.reorderLevel !== after.reorderLevel || before.targetStock !== after.targetStock)) rowMap.set(itemId, { itemId, kind: "changed", previous: before, current: after });
    else rowMap.set(itemId, { itemId, kind: "unchanged", previous: before, current: after });
  }
  const rows = Array.from(rowMap.values());
  const summary = { added: 0, changed: 0, removed: 0, unchanged: 0 };
  for (const row of rows) summary[row.kind]++;
  return { rows, summary, snapshotDate: new Date().toISOString() };
}

export const diffKindMeta: Record<RuleDiffKind, { label: string; tone: "green" | "amber" | "rose" | "gray" }> = {
  added: { label: "قاعدة جديدة", tone: "green" },
  changed: { label: "قاعدة معدّلة", tone: "amber" },
  removed: { label: "قاعدة أُزيلت", tone: "rose" },
  unchanged: { label: "بلا تغيير", tone: "gray" },
};
