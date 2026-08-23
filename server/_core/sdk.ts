import axios from "axios";
import { parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS, decodeOAuthState } from "../../shared/const";
import * as db from "../db";
import { ENV } from "./env";

type TokenResponse = { accessToken: string };
type UserInfo = { openId: string; name?: string; email?: string; platform?: string; loginMethod?: string; platforms?: string[] };
type SessionPayload = { openId: string; appId: string; name: string };

const EXCHANGE_TOKEN_PATH = "/webdev.v1.WebDevAuthPublicService/ExchangeToken";
const GET_USER_INFO_PATH = "/webdev.v1.WebDevAuthPublicService/GetUserInfo";

function sessionSecret() {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function loginMethod(info: UserInfo) {
  if (info.loginMethod) return info.loginMethod;
  if (info.platform) return info.platform;
  const platforms = new Set(info.platforms ?? []);
  if (platforms.has("REGISTERED_PLATFORM_EMAIL")) return "email";
  if (platforms.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
  if (platforms.has("REGISTERED_PLATFORM_APPLE")) return "apple";
  return null;
}

export class ManusAuthSdk {
  private readonly client = axios.create({ baseURL: ENV.oAuthServerUrl, timeout: 30_000 });

  async exchangeCodeForToken(code: string, rawState: string): Promise<TokenResponse> {
    const { redirectUri } = decodeOAuthState(rawState);
    if (!redirectUri || !ENV.appId) throw new Error("Invalid OAuth state or app configuration");
    const { data } = await this.client.post<TokenResponse>(EXCHANGE_TOKEN_PATH, {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    });
    return data;
  }

  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const { data } = await this.client.post<UserInfo>(GET_USER_INFO_PATH, { accessToken });
    if (!data.openId) throw new Error("OAuth user information is missing openId");
    return data;
  }

  async createSessionToken(openId: string, name: string) {
    return new SignJWT({ openId, appId: ENV.appId, name } satisfies SessionPayload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
      .sign(sessionSecret());
  }

  async authenticateRequest(req: Request): Promise<User | null> {
    const token = parseCookie(req.headers.cookie ?? "")[COOKIE_NAME];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, sessionSecret(), { algorithms: ["HS256"] });
      const openId = typeof payload.openId === "string" ? payload.openId : "";
      if (!openId || payload.appId !== ENV.appId) return null;
      return (await db.getUserByOpenId(openId)) ?? null;
    } catch {
      return null;
    }
  }

  async upsertOAuthUser(info: UserInfo) {
    await db.upsertUser({
      openId: info.openId,
      name: info.name ?? null,
      email: info.email ?? null,
      loginMethod: loginMethod(info),
      lastSignedIn: new Date(),
      ...(info.openId === ENV.ownerOpenId ? { role: "admin" } : {}),
    });
    return db.getUserByOpenId(info.openId);
  }
}

export const sdk = new ManusAuthSdk();
