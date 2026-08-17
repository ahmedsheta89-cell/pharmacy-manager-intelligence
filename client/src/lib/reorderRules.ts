/**
 * نبض العيادة التنفيذي — قواعد إعادة الطلب الفردية.
 * الإعدادات شخصية لهذا المتصفح وتُطبّق فوق حد الملف عند تطابق كود أو اسم الصنف.
 */
import type { ReorderRule } from "./inventoryEngine";

const STORAGE_KEY = "pmi-reorder-rules-v1";

export type ReorderRules = Record<string, ReorderRule>;

function isRule(value: unknown): value is ReorderRule {
  if (!value || typeof value !== "object") return false;
  const rule = value as ReorderRule;
  return typeof rule.itemId === "string" && Number.isFinite(rule.reorderLevel) && rule.reorderLevel >= 0 && (rule.targetStock === undefined || (Number.isFinite(rule.targetStock) && rule.targetStock >= rule.reorderLevel));
}

export function loadReorderRules(): ReorderRules {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, rule]) => isRule(rule))) as ReorderRules;
  } catch {
    return {};
  }
}

function persist(rules: ReorderRules): ReorderRules {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
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
