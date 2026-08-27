export type DeploymentTarget = "manus" | "external";

type Environment = Record<string, string | undefined>;

/**
 * تبقى المنصة الحالية هي الوضع الافتراضي حتى لا يتغير سلوك النشر القائم.
 * يختار نشر خارجي صراحةً عبر متغير الخادم أو متغير البناء VITE_.
 */
export function getDeploymentTarget(environment: Environment = process.env): DeploymentTarget {
  const requested = environment.DEPLOYMENT_TARGET ?? environment.VITE_DEPLOYMENT_TARGET;
  return requested?.trim().toLowerCase() === "external" ? "external" : "manus";
}

export type ExternalHostingReadiness =
  | { target: "manus"; canStart: true }
  | { target: "external"; canStart: false; code: "EXTERNAL_AUTH_NOT_READY"; message: string };

/**
 * لا يوجد مزود هوية خارجي مهيأ في هذا الإصدار. لذلك يفشل وضع الاستضافة
 * الخارجية بأمان بدل تشغيل واجهة عامة تسجل الدخول عبر OAuth الخاص بالمنصة.
 */
export function getExternalHostingReadiness(environment: Environment = process.env): ExternalHostingReadiness {
  if (getDeploymentTarget(environment) === "manus") {
    return { target: "manus", canStart: true };
  }

  return {
    target: "external",
    canStart: false,
    code: "EXTERNAL_AUTH_NOT_READY",
    message: "النشر الخارجي موقوف: يلزم اعتماد عنوان callback خارجي أو إعداد مزود هوية مستقل قبل تشغيل الخدمة.",
  };
}
