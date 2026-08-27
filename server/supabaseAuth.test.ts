import { afterEach, describe, expect, it } from "vitest";
import { supabaseAuth } from "./_core/supabaseAuth";

describe("حارس مصادقة Supabase", () => {
  const previous = { ...process.env };

  afterEach(() => {
    for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "AUTH_BOOTSTRAP_ADMIN_EMAIL"]) delete process.env[key];
    Object.assign(process.env, previous);
  });

  it("يرفض أي طلب خارجي بلا إعداد هوية مكتمل قبل محاولة قراءة رمز الوصول", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.AUTH_BOOTSTRAP_ADMIN_EMAIL;
    await expect(supabaseAuth.authenticateRequest({ headers: { authorization: "Bearer arbitrary-token" } } as never)).resolves.toBeNull();
  });

  it("يرفض رأس Authorization غير الحامل لرمز Bearer", async () => {
    await expect(supabaseAuth.authenticateRequest({ headers: { authorization: "Token arbitrary-token" } } as never)).resolves.toBeNull();
  });
});
