export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

export type OAuthState = { redirectUri?: string; nonce?: string };

export function encodeOAuthState(state: Required<OAuthState>) {
  return btoa(JSON.stringify(state));
}

export function decodeOAuthState(rawState: string): OAuthState {
  try {
    const parsed = JSON.parse(atob(rawState));
    if (!parsed || typeof parsed.redirectUri !== "string" || typeof parsed.nonce !== "string") return {};
    return { redirectUri: parsed.redirectUri, nonce: parsed.nonce };
  } catch {
    return {};
  }
}
