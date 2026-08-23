import { describe, expect, it } from "vitest";
import { decodeOAuthState, encodeOAuthState } from "@shared/const";

describe("حالة OAuth", () => {
  it("ترمز وترجع رابط الرد والـnonce دون فقد", () => {
    const state = encodeOAuthState({ redirectUri: "https://example.manus.space/api/oauth/callback", nonce: "one-time-nonce" });
    expect(decodeOAuthState(state)).toEqual({ redirectUri: "https://example.manus.space/api/oauth/callback", nonce: "one-time-nonce" });
  });

  it("تفشل بأمان عند وصول حالة تالفة أو ناقصة", () => {
    expect(decodeOAuthState("not-a-valid-state")).toEqual({});
    expect(decodeOAuthState(btoa(JSON.stringify({ redirectUri: "https://example.manus.space" })))).toEqual({});
  });
});
