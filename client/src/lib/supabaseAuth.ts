import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClientConfig, isExternalIdentityTarget } from "@shared/externalAuth";

let instance: SupabaseClient | undefined;

function browserEnvironment() {
  return import.meta.env as Record<string, string | undefined>;
}

export function isExternalAuthEnabled() {
  return isExternalIdentityTarget(browserEnvironment());
}

export function getExternalAuthConfiguration() {
  return getSupabaseClientConfig(browserEnvironment());
}

export function getSupabaseAuthClient() {
  if (!isExternalAuthEnabled()) return null;
  const config = getExternalAuthConfiguration();
  if (!config) return null;
  instance ??= createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return instance;
}

export async function getExternalAccessToken() {
  const client = getSupabaseAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signInWithExternalPassword(email: string, password: string) {
  const client = getSupabaseAuthClient();
  if (!client) throw new Error("إعداد الدخول الخارجي غير مكتمل بعد.");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpExternalUser(email: string, password: string) {
  const client = getSupabaseAuthClient();
  if (!client) throw new Error("إعداد الدخول الخارجي غير مكتمل بعد.");
  const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/login` } });
  if (error) throw error;
}

/** Uses the provider's existing link email without requiring dashboard template changes. */
export async function sendExternalRecoveryCode(email: string) {
  const client = getSupabaseAuthClient();
  if (!client) throw new Error("إعداد الدخول الخارجي غير مكتمل بعد.");
  const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/login` } });
  if (error) throw error;
}

/** Only accepts the real project's verification link; never follows arbitrary URLs. */
export async function verifyExternalRecoveryCode(email: string, value: string) {
  const client = getSupabaseAuthClient();
  const config = getExternalAuthConfiguration();
  if (!client || !config) throw new Error("إعداد الدخول الخارجي غير مكتمل بعد.");
  const link = new URL(value.trim());
  const project = new URL(config.url);
  const token_hash = link.searchParams.get("token") || link.searchParams.get("token_hash");
  const type = link.searchParams.get("type");
  if (link.protocol!=="https:" || link.origin!==project.origin || link.pathname!=="/auth/v1/verify" || !token_hash || !["magiclink","email","recovery"].includes(type || "")) throw new Error("invalid-recovery-link");
  const { data, error } = await client.auth.verifyOtp({ token_hash, type: type as "magiclink" | "email" | "recovery" });
  if (error) throw error;
  if (data.user?.email?.toLowerCase()!==email.toLowerCase()) {
    await client.auth.signOut({scope:"local"});
    throw new Error("email-mismatch");
  }
}

/** يعيّن كلمة مرور جديدة للجلسة الحالية (بعد تحقق الرمز). */
export async function updateExternalPassword(newPassword: string) {
  const client = getSupabaseAuthClient();
  if (!client) throw new Error("إعداد الدخول الخارجي غير مكتمل بعد.");
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOutExternalUser() {
  const client = getSupabaseAuthClient();
  if (!client) return;
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
}
