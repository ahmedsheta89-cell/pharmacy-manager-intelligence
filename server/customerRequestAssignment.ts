import type { WorkspaceAccessRole } from "../drizzle/schema";

/**
 * يفصل بين منفّذ العملية الحقيقي وبين الزميل الذي يُنسب إليه تسجيل الطلب.
 * المدير/المالك فقط يختار زميلاً آخر؛ أما موظف الطلبات فيسجّل باسمه دائمًا.
 */
export function resolveRecordedByUserId(input: {
  actorUserId: number;
  accessRole: WorkspaceAccessRole;
  requestedRecordedByUserId?: number;
}) {
  const canChooseColleague = input.accessRole === "owner" || input.accessRole === "manager";
  if (!canChooseColleague) {
    if (input.requestedRecordedByUserId && input.requestedRecordedByUserId !== input.actorUserId) {
      throw new Error("لا يمكن لفريق الطلبات تسجيل الطلب باسم زميل آخر.");
    }
    return input.actorUserId;
  }
  if (!input.requestedRecordedByUserId) throw new Error("اختر الزميل الذي سُجّل الطلب باسمه.");
  return input.requestedRecordedByUserId;
}

/** توافق سجلات ما قبل إضافة recordedByUserId دون كشف طلبات زملاء آخرين. */
export function isCustomerRequestRecordedBy(input: { createdByUserId: number; recordedByUserId?: number | null }, userId: number) {
  return input.recordedByUserId === userId || (!input.recordedByUserId && input.createdByUserId === userId);
}

/** يُنسب حدث الإنشاء للزميل المسجّل باسمه؛ بقية الأحداث تبقى لمن نفّذها فعليًا. */
export function customerRequestPerformanceUserId(input: { eventType: string; actorUserId: number; recordedByUserId?: number | null }) {
  return input.eventType === "customer_request.created" && input.recordedByUserId ? input.recordedByUserId : input.actorUserId;
}
