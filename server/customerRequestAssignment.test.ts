import { describe, expect, it } from "vitest";
import { customerRequestPerformanceUserId, isCustomerRequestRecordedBy, resolveRecordedByUserId } from "./customerRequestAssignment";

describe("إسناد تسجيل طلب العميل", () => {
  it("يفرض اسم الموظف الحقيقي ولا يسمح له بانتحال زميل", () => {
    expect(resolveRecordedByUserId({ actorUserId: 17, accessRole: "customer_requests" })).toBe(17);
    expect(() => resolveRecordedByUserId({ actorUserId: 17, accessRole: "customer_requests", requestedRecordedByUserId: 22 })).toThrow("لا يمكن لفريق الطلبات");
  });

  it("يطالب المدير بتحديد زميل ثم يحتفظ بالإسناد المختار", () => {
    expect(() => resolveRecordedByUserId({ actorUserId: 4, accessRole: "manager" })).toThrow("اختر الزميل");
    expect(resolveRecordedByUserId({ actorUserId: 4, accessRole: "manager", requestedRecordedByUserId: 22 })).toBe(22);
  });

  it("يقيّد عرض الموظف بطلبه المسند مع توافق السجلات القديمة", () => {
    expect(isCustomerRequestRecordedBy({ createdByUserId: 4, recordedByUserId: 22 }, 22)).toBe(true);
    expect(isCustomerRequestRecordedBy({ createdByUserId: 4, recordedByUserId: 22 }, 4)).toBe(false);
    expect(isCustomerRequestRecordedBy({ createdByUserId: 17, recordedByUserId: null }, 17)).toBe(true);
  });

  it("ينسب إنشاء المدير بالنيابة عنه لزميل التسجيل داخل تقرير الأداء", () => {
    expect(customerRequestPerformanceUserId({ eventType: "customer_request.created", actorUserId: 4, recordedByUserId: 22 })).toBe(22);
    expect(customerRequestPerformanceUserId({ eventType: "customer_request.contacted", actorUserId: 4, recordedByUserId: 22 })).toBe(4);
  });
});
