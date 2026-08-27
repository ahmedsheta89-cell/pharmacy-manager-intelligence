import { describe, expect, it } from "vitest";
import { externalSubjectOpenId, getSupabaseAuthConfig, getSupabaseClientConfig, isBootstrapAdminIdentity } from "./externalAuth";

const configured = {
  SUPABASE_URL: "https://example-project.supabase.co/",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  AUTH_BOOTSTRAP_ADMIN_EMAIL: " Manager@Example.com ",
};

describe("إعداد هوية Supabase الخارجية", () => {
  it("لا يقبل إلا إعداد HTTPS لمشروع Supabase مع بريد تمهيد المدير", () => {
    expect(getSupabaseAuthConfig(configured)).toEqual({
      url: "https://example-project.supabase.co",
      publishableKey: "sb_publishable_example",
      bootstrapAdminEmail: "manager@example.com",
    });
    expect(getSupabaseAuthConfig({ ...configured, SUPABASE_URL: "http://example-project.supabase.co" })).toBeNull();
    expect(getSupabaseAuthConfig({ ...configured, AUTH_BOOTSTRAP_ADMIN_EMAIL: "" })).toBeNull();
  });

  it("يفصل إعداد العميل العام عن بريد التمهيد الإداري", () => {
    expect(getSupabaseClientConfig({ VITE_SUPABASE_URL: "https://example-project.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example" })).toEqual({
      url: "https://example-project.supabase.co",
      publishableKey: "sb_publishable_example",
    });
  });

  it("لا يمنح دور المدير إلا للبريد المطابق والمؤكد", () => {
    const config = getSupabaseAuthConfig(configured);
    expect(config && isBootstrapAdminIdentity({ email: "manager@example.com", emailConfirmedAt: "2026-08-27T15:00:00Z" }, config)).toBe(true);
    expect(config && isBootstrapAdminIdentity({ email: "manager@example.com", emailConfirmedAt: null }, config)).toBe(false);
    expect(config && isBootstrapAdminIdentity({ email: "other@example.com", emailConfirmedAt: "2026-08-27T15:00:00Z" }, config)).toBe(false);
    expect(externalSubjectOpenId("a-user-id")).toBe("supabase:a-user-id");
  });
});
