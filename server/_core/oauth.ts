import type { Express, Request, Response } from "express";
import { parseCookie } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "../../shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookie(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!code || !nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const token = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(token.accessToken);
      const user = await sdk.upsertOAuthUser(userInfo);
      if (!user) throw new Error("Unable to establish the authenticated user");
      const session = await sdk.createSessionToken(user.openId, user.name ?? "");
      res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "oauth callback failed" });
    }
  });
}
