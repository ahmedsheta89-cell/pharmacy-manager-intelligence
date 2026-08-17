/**
 * نبض العيادة التنفيذي — قواعد إعادة الطلب الفردية.
 * الإعدادات شخصية لهذا المتصفح وتُطبّق فوق حد الملف عند تطابق كود أو اسم الصنف.
 */
import type { ReorderRule } from "./inventoryEngine";

export const reorderRulesStorageKey = "pmi-reorder-rules-v1";

export type ReorderRules = Record<string, ReorderRule>;

function isRule(value: unknown): value is ReorderRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as ReorderRule;
  return typeof rule.itemId === "string" && Number.isFinite(rule.reorderLevel) && rule.reorderLevel >= 0 && (rule.targetStock === undefined || (Number.isFinite(rule.targetStock) && rule.targetStock >= rule.reorderLevel));
}

export function loadReorderRules(): ReorderRules {
  try {
    const parsed = JSON.parse(localStorage.getItem(reorderRulesStorageKey) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, rule]) => isRule(rule))) as ReorderRules;
  } catch {
    return {};
  }
}

function persist(rules: ReorderRules): ReorderRules {
  try {
    localStorage.setItem(reorderRulesStorageKey, JSON.stringify(rules));
  } catch {
    // يظل التعديل ظاهرًا خلال الجلسة حتى إن منع المتصفح الكتابة الدائمة.
  }
  return rules;
}

export function saveReorderRule(rule: Omit<ReorderRule, "updatedAt">): ReorderRules {
  const reorderLevel = Math.max(0, Math.round(rule.reorderLevel));
  const targetStock = rule.targetStock === undefined ? undefined : Math.max(reorderLevel, Math.round(rule.targetStock));
  return persist({ ...loadReorderRules(), [rule.itemId]: { ...rule, reorderLevel, targetStock, updatedAt: new Date().toISOString() } });
}

export function removeReorderRule(itemId: string): ReorderRules {
  const { [itemId]: _removed, ...remaining } = loadReorderRules();
  return persist(remaining);
}

/** يحفظ قواعد مستوردة في عملية واحدة؛ المعرّفات المستوردة فقط هي التي تُحدّث. */
export function saveReorderRulesBatch(rules: Array<Omit<ReorderRule, "updatedAt">>): ReorderRules {
  const next = { ...loadReorderRules() };
  for (const rule of rules) {
    if (!rule.itemId.trim() || !Number.isFinite(rule.reorderLevel) || rule.reorderLevel < 0) continue;
    const reorderLevel = Math.max(0, Math.round(rule.reorderLevel));
    const targetStock = rule.targetStock === undefined ? undefined : Math.max(reorderLevel, Math.round(rule.targetStock));
    next[rule.itemId.trim()] = { itemId: rule.itemId.trim(), reorderLevel, targetStock, updatedAt: new Date().toISOString() };
  }
  return persist(next);
}

export function replaceReorderRules(rules: ReorderRules): ReorderRules {
  const valid = Object.fromEntries(Object.entries(rules).filter(([, rule]) => isRule(rule))) as ReorderRules;
  return persist(valid);
}
