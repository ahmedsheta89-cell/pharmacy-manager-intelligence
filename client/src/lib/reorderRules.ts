/**
 * نبض العيادة التنفيذي — قواعد إعادة الطلب الفردية وسجل تدقيقها المحلي.
 * تحفظ كل القواعد وسجل التغييرات في المتصفح فقط، ولا تنشئ أي طلبات شراء تلقائية.
 */
import type { ReorderRule } from "./inventoryEngine";

export const reorderRulesStorageKey = "pmi-reorder-rules-v1";
export const reorderRuleHistoryStorageKey = "pmi-reorder-rules-history-v1";
const historyLimit = 300;

export type ReorderRules = Record<string, ReorderRule>;
export type ReorderRuleChangeAction = "created" | "updated" | "removed" | "imported" | "restored";
export interface ReorderRuleHistoryEntry {
  id: string;
  at: string;
  action: ReorderRuleChangeAction;
  itemId: string;
  before?: Pick<ReorderRule, "reorderLevel" | "targetStock">;
  after?: Pick<ReorderRule, "reorderLevel" | "targetStock">;
  source: "تعديل يدوي" | "استيراد Excel" | "استعادة نسخة محلية";
}

function isRule(value: unknown): value is ReorderRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as ReorderRule;
  return typeof rule.itemId === "string" && Number.isFinite(rule.reorderLevel) && rule.reorderLevel >= 0 && (rule.targetStock === undefined || (Number.isFinite(rule.targetStock) && rule.targetStock >= rule.reorderLevel));
}

const snapshot = (rule?: ReorderRule): Pick<ReorderRule, "reorderLevel" | "targetStock"> | undefined => rule ? { reorderLevel: rule.reorderLevel, targetStock: rule.targetStock } : undefined;
const sameRule = (left?: ReorderRule, right?: ReorderRule) => left?.reorderLevel === right?.reorderLevel && left?.targetStock === right?.targetStock;
const isHistory = (value: unknown): value is ReorderRuleHistoryEntry => Boolean(value) && typeof value === "object" && typeof (value as ReorderRuleHistoryEntry).id === "string" && typeof (value as ReorderRuleHistoryEntry).itemId === "string" && typeof (value as ReorderRuleHistoryEntry).at === "string";

export function loadReorderRules(): ReorderRules {
  try {
    const parsed = JSON.parse(localStorage.getItem(reorderRulesStorageKey) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, rule]) => isRule(rule))) as ReorderRules;
  } catch {
    return {};
  }
}

export function loadReorderRuleHistory(): ReorderRuleHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(reorderRuleHistoryStorageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isHistory).slice(0, historyLimit) : [];
  } catch {
    return [];
  }
}

function persist(rules: ReorderRules): ReorderRules {
  try { localStorage.setItem(reorderRulesStorageKey, JSON.stringify(rules)); } catch { /* يظل التعديل ظاهرًا خلال الجلسة. */ }
  return rules;
}

export function replaceReorderRuleHistory(entries: ReorderRuleHistoryEntry[]): ReorderRuleHistoryEntry[] {
  const unique = entries.filter(isHistory).filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index).slice(0, historyLimit);
  try { localStorage.setItem(reorderRuleHistoryStorageKey, JSON.stringify(unique)); } catch { /* اختياري. */ }
  return unique;
}

function recordChange(action: ReorderRuleChangeAction, itemId: string, before: ReorderRule | undefined, after: ReorderRule | undefined, source: ReorderRuleHistoryEntry["source"]) {
  if (action !== "removed" && sameRule(before, after)) return loadReorderRuleHistory();
  const entry: ReorderRuleHistoryEntry = { id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`, at: new Date().toISOString(), action, itemId, before: snapshot(before), after: snapshot(after), source };
  return replaceReorderRuleHistory([entry, ...loadReorderRuleHistory()]);
}

function normalRule(rule: Omit<ReorderRule, "updatedAt">): ReorderRule {
  const reorderLevel = Math.max(0, Math.round(rule.reorderLevel));
  const targetStock = rule.targetStock === undefined ? undefined : Math.max(reorderLevel, Math.round(rule.targetStock));
  return { itemId: rule.itemId.trim(), reorderLevel, targetStock, updatedAt: new Date().toISOString() };
}

export function saveReorderRule(rule: Omit<ReorderRule, "updatedAt">): ReorderRules {
  const current = loadReorderRules();
  const nextRule = normalRule(rule);
  const previous = current[nextRule.itemId];
  recordChange(previous ? "updated" : "created", nextRule.itemId, previous, nextRule, "تعديل يدوي");
  return persist({ ...current, [nextRule.itemId]: nextRule });
}

export function removeReorderRule(itemId: string): ReorderRules {
  const current = loadReorderRules();
  const previous = current[itemId];
  const { [itemId]: _removed, ...remaining } = current;
  if (previous) recordChange("removed", itemId, previous, undefined, "تعديل يدوي");
  return persist(remaining);
}

/** يحفظ قواعد مستوردة في عملية واحدة؛ المعرّفات المستوردة فقط هي التي تُحدّث. */
export function saveReorderRulesBatch(rules: Array<Omit<ReorderRule, "updatedAt">>): ReorderRules {
  const next = { ...loadReorderRules() };
  for (const rule of rules) {
    if (!rule.itemId.trim() || !Number.isFinite(rule.reorderLevel) || rule.reorderLevel < 0) continue;
    const nextRule = normalRule(rule);
    const previous = next[nextRule.itemId];
    recordChange("imported", nextRule.itemId, previous, nextRule, "استيراد Excel");
    next[nextRule.itemId] = nextRule;
  }
  return persist(next);
}

export function replaceReorderRules(rules: ReorderRules): ReorderRules {
  const current = loadReorderRules();
  const valid = Object.fromEntries(Object.entries(rules).filter(([, rule]) => isRule(rule))) as ReorderRules;
  const itemIds = new Set([...Object.keys(current), ...Object.keys(valid)]);
  itemIds.forEach((itemId) => {
    if (!sameRule(current[itemId], valid[itemId])) recordChange("restored", itemId, current[itemId], valid[itemId], "استعادة نسخة محلية");
  });
  return persist(valid);
}
