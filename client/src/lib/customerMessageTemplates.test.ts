import { describe, expect, it } from "vitest";
import { defaultCustomerAvailabilityTemplate, defaultCustomerOrderInProgressTemplate, defaultCustomerUnavailableTemplate, renderCustomerMessageTemplate } from "./customerMessageTemplates";

describe("قوالب رسائل العملاء", () => {
  it("يستبدل المتغيرات المسموحة فقط بقيم الطلب قبل فتح WhatsApp", () => {
    expect(renderCustomerMessageTemplate("{{customerName}} · {{productName}} · {{requestedQuantity}}", { customerName: "سارة", productName: "صنف", requestedQuantity: "2" })).toBe("سارة · صنف · 2");
  });

  it("لا يترك متغيرًا غير معروف داخل الرسالة الجاهزة", () => {
    expect(renderCustomerMessageTemplate("{{customerName}} {{unknown}}", { customerName: "أحمد", productName: "صنف", requestedQuantity: 1 })).toBe("أحمد ");
    expect(renderCustomerMessageTemplate(defaultCustomerAvailabilityTemplate, { customerName: "أحمد", productName: "دواء", requestedQuantity: 1 })).toContain("دواء");
  });

  it("يجهز صيغتي جاري الطلب وعدم التوفر للمراجعة اليدوية من دون بيانات مخفية", () => {
    const request = { customerName: "أحمد", productName: "صنف اختبار", productCode: "P-100", requestedQuantity: "2" };
    expect(renderCustomerMessageTemplate(defaultCustomerOrderInProgressTemplate, request)).toContain("صنف اختبار");
    expect(renderCustomerMessageTemplate(defaultCustomerUnavailableTemplate, request)).toContain("أحمد");
    expect(renderCustomerMessageTemplate(defaultCustomerUnavailableTemplate, request)).not.toContain("{{");
  });
});
