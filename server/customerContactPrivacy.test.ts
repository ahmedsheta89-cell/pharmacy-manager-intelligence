import { describe, expect, it } from "vitest";
import { maskCustomerPhone, presentCustomerRequestForRole } from "./customerContactPrivacy";

describe("خصوصية رقم العميل", () => {
  it("يخفي الوسط ويحافظ فقط على أطراف محدودة من رقم الهاتف", () => {
    expect(maskCustomerPhone("01000753375")).toBe("010••••375");
    expect(maskCustomerPhone("12")).toBe("••••");
  });

  it("يحذف الرقم المطبع من عرض الموظف ولا يغير عرض المدير", () => {
    const request = { id: 7, customerPhone: "01000753375", normalizedCustomerPhone: "01000753375", customerName: "عميل" };
    expect(presentCustomerRequestForRole(request, true)).toEqual({ id: 7, customerPhone: "010••••375", customerName: "عميل", phoneMasked: true });
    expect(presentCustomerRequestForRole(request, false)).toEqual({ ...request, phoneMasked: false });
  });
});
