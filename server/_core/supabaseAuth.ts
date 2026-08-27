import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { externalSubjectOpenId, getSupabaseAuthConfig, isBootstrapAdminIdentity, type SupabaseAuthConfig } from "../../shared/externalAuth";
import * as db from "../db";

type SupabaseProfile = {
  id?: string;
  aud?: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: { name?: unknown; full_name?: unknown } | null;
};

function bearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function displayName(profile: SupabaseProfile) {
  const raw = profile.user_metadata?.full_name ?? profile.user_metadata?.name;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 240) : null;
}

async function getVerifiedSupabaseProfile(accessToken: string, config: SupabaseAuthConfig): Promise<SupabaseProfile | null> {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.publishableKey, authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const profile = await response.json() as SupabaseProfile;
  return profile.id && profile.aud === "authenticated" ? profile : null;
}

/**
 * يتحقق أولاً من توقيع JWT عبر JWKS. في مشاريع Supabase القديمة ذات توقيع HS256
 * قد لا يعرض JWKS مفاتيح عامة، لذا يبقى طلب /user الموثق هو البديل الآمن: لا تُقبل
 * claims إلا إذا أكدها خادم Supabase لنفس رمز الوصول ونفس subject.
 */
async function verifySupabaseAccessToken(accessToken: string, config: SupabaseAuthConfig) {
  const issuer = `${config.url}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(accessToken, jwks, { issuer, audience: "authenticated" });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export class SupabaseAuthSdk {
  async authenticateRequest(req: Request): Promise<User | null> {
    const config = getSupabaseAuthConfig(process.env);
    const accessToken = bearerToken(req);
    if (!config || !accessToken) return null;

    const verifiedSubject = await verifySupabaseAccessToken(accessToken, config);
    const profile = await getVerifiedSupabaseProfile(accessToken, config);
    if (!profile?.id || (verifiedSubject && profile.id !== verifiedSubject)) return null;

    const openId = externalSubjectOpenId(profile.id);
    const existing = await db.getUserByOpenId(openId);
    const role = !existing && isBootstrapAdminIdentity({ email: profile.email, emailConfirmedAt: profile.email_confirmed_at }, config) ? "admin" : undefined;
    await db.upsertUser({
      openId,
      name: displayName(profile),
      email: profile.email ?? null,
      loginMethod: "supabase",
      ...(role ? { role } : {}),
      lastSignedIn: new Date(),
    });
    return (await db.getUserByOpenId(openId)) ?? null;
  }
}

export const supabaseAuth = new SupabaseAuthSdk();
