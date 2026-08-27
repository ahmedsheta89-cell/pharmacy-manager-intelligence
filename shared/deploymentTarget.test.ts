import { describe, expect, it } from "vitest";
import { getDeploymentTarget, getExternalHostingReadiness, hasExternalSupabaseConfiguration } from "./deploymentTarget";

describe("deployment target", () => {
  it("يحافظ على مسار المنصة عندما لا يوجد اختيار صريح", () => {
    expect(getDeploymentTarget({})).toBe("manus");
    expect(getExternalHostingReadiness({})).toEqual({ target: "manus", canStart: true });
  });

  it("يعزل وضع البناء الخارجي عند اختياره صراحة", () => {
    expect(getDeploymentTarget({ VITE_DEPLOYMENT_TARGET: " external " })).toBe("external");
  });

  it("يمنع تشغيل الخدمة الخارجية قبل حل الهوية", () => {
    expect(getExternalHostingReadiness({ DEPLOYMENT_TARGET: "external" })).toMatchObject({
      target: "external",
      canStart: false,
      code: "EXTERNAL_AUTH_NOT_READY",
    });
  });

  it("يسمح ببدء البيئة الخارجية فقط بعد اكتمال هوية Supabase وبيانات تمهيد المدير", () => {
    expect(getExternalHostingReadiness({
      DEPLOYMENT_TARGET: "external",
      SUPABASE_URL: "https://example-project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      AUTH_BOOTSTRAP_ADMIN_EMAIL: "manager@example.com",
    })).toEqual({ target: "external", canStart: true });
  });

  it("يرفض عنوان هوية خارجي غير آمن أو غير تابع لمشروع Supabase", () => {
    expect(hasExternalSupabaseConfiguration({ SUPABASE_URL: "http://example-project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example", AUTH_BOOTSTRAP_ADMIN_EMAIL: "manager@example.com" })).toBe(false);
    expect(hasExternalSupabaseConfiguration({ SUPABASE_URL: "https://example.invalid", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example", AUTH_BOOTSTRAP_ADMIN_EMAIL: "manager@example.com" })).toBe(false);
  });
});
