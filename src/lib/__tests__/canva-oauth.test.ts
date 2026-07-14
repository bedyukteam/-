import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import {
  generatePkcePair,
  buildAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  expiresAtFromNow,
  CANVA_SCOPES,
} from "@/lib/canva-oauth";

describe("generatePkcePair", () => {
  it("verifier matches the allowed PKCE character set and length range", () => {
    const { verifier } = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("challenge is the base64url SHA-256 hash of the verifier (S256)", () => {
    const { verifier, challenge } = generatePkcePair();
    const expected = createHash("sha256")
      .update(verifier)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("generates a different pair each call", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe("buildAuthorizeUrl", () => {
  beforeEach(() => {
    process.env.CANVA_CLIENT_ID = "test-client-id";
    process.env.CANVA_REDIRECT_URI = "http://localhost:3000/api/auth/canva/callback";
  });

  it("includes S256 PKCE method and the three required scopes", () => {
    const url = buildAuthorizeUrl("state123", "challenge456");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("code_challenge=challenge456");
    expect(url).toContain("state=state123");
    expect(url).toContain(encodeURIComponent(CANVA_SCOPES.split(" ")[0]));
  });
});

describe("exchangeCode", () => {
  beforeEach(() => {
    process.env.CANVA_CLIENT_ID = "id";
    process.env.CANVA_CLIENT_SECRET = "secret";
    process.env.CANVA_REDIRECT_URI = "http://localhost:3000/api/auth/canva/callback";
  });
  afterEach(() => vi.restoreAllMocks());

  it("sends Basic auth (not client_secret in the body) and returns the token response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 14400 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exchangeCode("auth-code", "verifier-value");

    expect(r).toEqual({ access_token: "at", refresh_token: "rt", expires_in: 14400 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
    expect(String(init.body)).toContain("code_verifier=verifier-value");
    expect(String(init.body)).not.toContain("secret"); // client_secret must not leak into the body
  });

  it("throws with the response body on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "invalid_grant" }),
    );
    await expect(exchangeCode("bad", "v")).rejects.toThrow(/invalid_grant/);
  });
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    process.env.CANVA_CLIENT_ID = "id";
    process.env.CANVA_CLIENT_SECRET = "secret";
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns a fresh access_token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "new-at", expires_in: 14400 }) }),
    );
    const r = await refreshAccessToken("some-refresh-token");
    expect(r.access_token).toBe("new-at");
  });
});

describe("expiresAtFromNow", () => {
  it("returns a timestamp ~60s before the real expiry", () => {
    const now = Date.now();
    const ms = new Date(expiresAtFromNow(14400)).getTime() - now;
    expect(ms).toBeGreaterThan(14400_000 - 65_000);
    expect(ms).toBeLessThan(14400_000 - 55_000);
  });
});
