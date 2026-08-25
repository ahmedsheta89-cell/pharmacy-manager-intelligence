import { describe, expect, it } from "vitest";
import { defaultCustomerAvailabilityTemplate, renderCustomerMessageTemplate } from "./customerMessageTemplates";

describe("قوالب رسائل العملاء", () => {
  it("يستبدل المتغيرات المسموحة فقط بقيم الطلب قبل فتح WhatsApp", () => {
    expect(renderCustomerMessageTemplate("{{customerName}} · {{productName}} · {{requestedQuantity}}", { customerName: "سارة", productName: "صنف", requestedQuantity: "2" })).toBe("سارة · صنف · 2");
  });

  it("لا يترك متغيرًا غير معروف داخل الرسالة الجاهزة", () => {
    expect(renderCustomerMessageTemplate("{{customerName}} {{unknown}}", { customerName: "أحمد", productName: "صنف", requestedQuantity: 1 })).toBe("أحمد ");
    expect(renderCustomerMessageTemplate(defaultCustomerAvailabilityTemplate, { customerName: "أحمد", productName: "دواء", requestedQuantity: 1 })).toContain("دواء");
  });
});
