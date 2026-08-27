import { getDeploymentTarget, type DeploymentTarget } from "./deploymentTarget";

export type Environment = Record<string, string | undefined>;

export type SupabaseAuthConfig = {
  url: string;
  publishableKey: string;
  bootstrapAdminEmail: string;
};

export type SupabaseClientConfig = Pick<SupabaseAuthConfig, "url" | "publishableKey">;

function readValue(environment: Environment, serverKey: string, clientKey: string) {
  return (environment[serverKey] ?? environment[clientKey] ?? "").trim();
}

export function normalizeAuthEmail(value?: string | null) {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function getSupabaseClientConfig(environment: Environment): SupabaseClientConfig | null {
  const url = readValue(environment, "SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/+$/, "");
  const publishableKey = readValue(environment, "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !publishableKey) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) return null;
  } catch {
    return null;
  }

  return { url, publishableKey };
}

/**
 * لا تبدأ الاستضافة الخارجية قبل وجود عنوان المشروع والمفتاح العام وبريد تمهيد
 * المدير. لا يعد المفتاح العام سرًا، لكن بقاءه في إعداد البيئة يمنع خلطه مع مفاتيح
 * خدمة Supabase التي لا يجب أن تغادر لوحة الإعداد الآمنة.
 */
export function getSupabaseAuthConfig(environment: Environment): SupabaseAuthConfig | null {
  const client = getSupabaseClientConfig(environment);
  const bootstrapAdminEmail = normalizeAuthEmail(environment.AUTH_BOOTSTRAP_ADMIN_EMAIL);
  if (!client || !bootstrapAdminEmail || !bootstrapAdminEmail.includes("@")) return null;
  return { ...client, bootstrapAdminEmail };
}

export function externalSubjectOpenId(subject: string) {
  return `supabase:${subject}`;
}

export function isBootstrapAdminIdentity(input: { email?: string | null; emailConfirmedAt?: string | null }, config: SupabaseAuthConfig) {
  return Boolean(input.emailConfirmedAt && normalizeAuthEmail(input.email) === config.bootstrapAdminEmail);
}

export function isExternalIdentityTarget(environment: Environment): boolean {
  return getDeploymentTarget(environment) === "external";
}

export function getExternalIdentityTarget(environment: Environment): DeploymentTarget {
  return getDeploymentTarget(environment);
}
