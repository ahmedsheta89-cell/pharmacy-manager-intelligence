import { describe, expect, it } from "vitest";
import { canApproveCustomerSupply, canManageCustomerRequests, canManageOperations } from "./accessControl";

describe("سياسة وصول فريق طلبات العملاء", () => {
  it("تحصر دور فريق الطلبات في سجل العملاء ولا تمنحه Excel أو الفواتير أو الحوكمة", () => {
    expect(canManageCustomerRequests("customer_requests")).toBe(true);
    expect(canManageOperations("customer_requests")).toBe(false);
    expect(canApproveCustomerSupply("customer_requests")).toBe(false);
  });

  it("تحافظ على صلاحية المدير للاعتماد وصلاحية المشغّل للتشغيل دون اعتماد توريد العميل", () => {
    expect(canApproveCustomerSupply("manager")).toBe(true);
    expect(canManageOperations("operator")).toBe(true);
    expect(canApproveCustomerSupply("operator")).toBe(false);
    expect(canManageCustomerRequests("reviewer")).toBe(false);
  });

  it("يجعل قرارات التوريد وعدم التوفر ضمن اعتماد المدير لا ضمن شاشة الموظف", () => {
    expect(canManageCustomerRequests("customer_requests")).toBe(true);
    expect(canApproveCustomerSupply("customer_requests")).toBe(false);
    expect(canApproveCustomerSupply("owner")).toBe(true);
    expect(canApproveCustomerSupply("manager")).toBe(true);
  });

  it("يجمع للمدير التحكم التشغيلي واعتماد التوريد من دون منحه لموظف الطلبات", () => {
    expect(canManageOperations("manager")).toBe(true);
    expect(canManageCustomerRequests("manager")).toBe(true);
    expect(canApproveCustomerSupply("manager")).toBe(true);
    expect(canManageOperations("customer_requests")).toBe(false);
    expect(canApproveCustomerSupply("customer_requests")).toBe(false);
  });

  it("لا يمنح المراجع أو دور طلبات العملاء قرارات تشغيلية أو اعتماد توريد", () => {
    expect(canManageOperations("reviewer")).toBe(false);
    expect(canManageCustomerRequests("reviewer")).toBe(false);
    expect(canApproveCustomerSupply("reviewer")).toBe(false);
    expect(canManageOperations("customer_requests")).toBe(false);
    expect(canApproveCustomerSupply("customer_requests")).toBe(false);
  });
});
