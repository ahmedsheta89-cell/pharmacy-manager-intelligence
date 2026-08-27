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

export async function signOutExternalUser() {
  const client = getSupabaseAuthClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
