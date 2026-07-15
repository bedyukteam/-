import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildAuthorizeUrl, exchangeCode, refreshAccessToken, expiresAtFromNow, YOUTUBE_SCOPES } from "@/lib/google-oauth";

describe("buildAuthorizeUrl", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/youtube/callback";
  });

  it("includes offline access + consent prompt so a refresh_token is always issued", () => {
    const url = buildAuthorizeUrl("state123");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("state=state123");
    expect(url).toContain(encodeURIComponent(YOUTUBE_SCOPES.split(" ")[0]));
  });
});

describe("exchangeCode", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/api/auth/youtube/callback";
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the parsed token response on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
      }),
    );
    const r = await exchangeCode("auth-code");
    expect(r).toEqual({ access_token: "at", refresh_token: "rt", expires_in: 3600 });
  });

  it("throws with the response body on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "invalid_grant" }),
    );
    await expect(exchangeCode("bad-code")).rejects.toThrow(/invalid_grant/);
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns a fresh access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "new-at", expires_in: 3600 }) }),
    );
    const r = await refreshAccessToken("some-refresh-token");
    expect(r.access_token).toBe("new-at");
  });
});

describe("expiresAtFromNow", () => {
  it("returns a timestamp ~60s before the real expiry (safety margin)", () => {
    const now = Date.now();
    const iso = expiresAtFromNow(3600);
    const ms = new Date(iso).getTime() - now;
    expect(ms).toBeGreaterThan(3600_000 - 65_000);
    expect(ms).toBeLessThan(3600_000 - 55_000);
  });
});
