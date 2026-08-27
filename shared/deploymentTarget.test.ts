import { describe, expect, it } from "vitest";
import { getDeploymentTarget, getExternalHostingReadiness } from "./deploymentTarget";

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
});
