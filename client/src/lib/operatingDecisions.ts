export type OperatingDecisionStatus = "open" | "deferred" | "done";

export type LocalOperatingDecision = {
  priorityId: string;
  status: OperatingDecisionStatus;
  note?: string;
  changedAt: number;
};

const storageKey = "pmi-operating-decisions-v1";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeDecision(value: unknown): value is LocalOperatingDecision {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.priorityId === "string"
    && ["open", "deferred", "done"].includes(String(entry.status))
    && typeof entry.changedAt === "number";
}

export function loadOperatingDecisions(): Record<string, LocalOperatingDecision> {
  if (!canUseStorage()) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return {};
    return parsed.filter(safeDecision).reduce<Record<string, LocalOperatingDecision>>((result, decision) => {
      result[decision.priorityId] = decision;
      return result;
    }, {});
  } catch {
    return {};
  }
}

export function saveOperatingDecision(decision: LocalOperatingDecision) {
  if (!canUseStorage()) return decision;
  const all = loadOperatingDecisions();
  all[decision.priorityId] = decision;
  const compact = Object.values(all)
    .sort((first, second) => second.changedAt - first.changedAt)
    .slice(0, 120);
  window.localStorage.setItem(storageKey, JSON.stringify(compact));
  return decision;
}
