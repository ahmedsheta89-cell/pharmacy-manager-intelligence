import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

const anonymousContext = {
  user: null,
  req: { headers: {} },
  res: { clearCookie: () => undefined },
} as never;

describe("إجراءات الخادم المحمية", () => {
  it("يعيد هوية فارغة للإجراء العام ولا يسمح بقائمة مساحات العمل بلا جلسة", async () => {
    const caller = appRouter.createCaller(anonymousContext);
    await expect(caller.auth.me()).resolves.toBeNull();
    await expect(caller.workspace.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يمسح ملف تعريف الجلسة عند تسجيل الخروج", async () => {
    const calls: Array<{ name: string; options: Record<string, unknown> }> = [];
    const caller = appRouter.createCaller({ ...anonymousContext, res: { clearCookie: (name: string, options: Record<string, unknown>) => calls.push({ name, options }) } } as never);
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(calls[0]).toMatchObject({ name: "app_session_id", options: { maxAge: -1, httpOnly: true, secure: true, sameSite: "none", path: "/" } });
  });
});
