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

export function hasExternalSupabaseConfiguration(environment: Environment = process.env) {
  const url = (environment.SUPABASE_URL ?? environment.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const publishableKey = (environment.SUPABASE_PUBLISHABLE_KEY ?? environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const bootstrapAdminEmail = environment.AUTH_BOOTSTRAP_ADMIN_EMAIL?.trim() ?? "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co") && Boolean(publishableKey) && bootstrapAdminEmail.includes("@");
  } catch {
    return false;
  }
}

export type ExternalHostingReadiness =
  | { target: "manus"; canStart: true }
  | { target: "external"; canStart: true }
  | { target: "external"; canStart: false; code: "EXTERNAL_AUTH_NOT_READY"; message: string };

/**
 * لا يوجد مزود هوية خارجي مهيأ في هذا الإصدار. لذلك يفشل وضع الاستضافة
 * الخارجية بأمان بدل تشغيل واجهة عامة تسجل الدخول عبر OAuth الخاص بالمنصة.
 */
export function getExternalHostingReadiness(environment: Environment = process.env): ExternalHostingReadiness {
  if (getDeploymentTarget(environment) === "manus") {
    return { target: "manus", canStart: true };
  }

  const configured = hasExternalSupabaseConfiguration(environment);
  return configured
    ? { target: "external", canStart: true }
    : {
        target: "external",
        canStart: false,
        code: "EXTERNAL_AUTH_NOT_READY",
        message: "النشر الخارجي موقوف: يلزم إعداد Supabase URL والمفتاح العام وبريد تمهيد المدير في لوحة الإعداد الآمنة قبل تشغيل الخدمة.",
      };
}
