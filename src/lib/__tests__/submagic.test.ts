import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  createMagicClips,
  getProject,
  mapWebhookClips,
  type MagicClipsWebhookPayload,
} from "@/lib/submagic";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SUBMAGIC_API_KEY", "sk-test-key");
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createMagicClips", () => {
  it("POSTs youtubeUrl + hebrew language with the x-api-key header and returns the project", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "proj-1", status: "processing" }), { status: 202 }),
    );
    const res = await createMagicClips({
      title: "פרק 12 — מותג אישי",
      youtubeUrl: "https://www.youtube.com/watch?v=abc123",
      webhookUrl: "https://example.com/api/webhooks/submagic",
    });
    expect(res.id).toBe("proj-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.submagic.co/v1/projects/magic-clips");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("sk-test-key");
    const body = JSON.parse(init.body);
    expect(body.youtubeUrl).toBe("https://www.youtube.com/watch?v=abc123");
    expect(body.language).toBe("he");
    expect(body.webhookUrl).toBe("https://example.com/api/webhooks/submagic");
  });

  it("clamps the title to 100 chars (API limit)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "p" }), { status: 202 }),
    );
    await createMagicClips({ title: "א".repeat(150), youtubeUrl: "https://youtu.be/x" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.title.length).toBe(100);
  });

  it("throws a Hebrew error including the response body on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("quota exceeded", { status: 402 }));
    await expect(
      createMagicClips({ title: "t", youtubeUrl: "https://youtu.be/x" }),
    ).rejects.toThrow(/402/);
  });
});

describe("getProject", () => {
  it("GETs the project by id with the api key", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "proj-1", status: "completed" }), { status: 200 }),
    );
    const res = await getProject("proj-1");
    expect(res.status).toBe("completed");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.submagic.co/v1/projects/proj-1");
    expect(init.headers["x-api-key"]).toBe("sk-test-key");
  });
});

describe("mapWebhookClips", () => {
  const payload: MagicClipsWebhookPayload = {
    projectId: "proj-1",
    status: "completed",
    title: "פרק 12",
    duration: 3600,
    magicClips: [
      {
        id: "clip-1",
        title: "הרגע שהכל השתנה",
        duration: 42,
        viralityScores: {
          total: 87,
          shareability: 90,
          hook_strength: 85,
          story_quality: 80,
          emotional_impact: 92,
        },
        status: "completed",
        previewUrl: "https://p/1",
        downloadUrl: "https://d/1",
        directUrl: "https://x/1",
      },
    ],
  };

  it("maps webhook clips to submagic_clips rows for the episode", () => {
    const rows = mapWebhookClips(payload, "ep-uuid");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "clip-1",
      episode_id: "ep-uuid",
      title: "הרגע שהכל השתנה",
      duration_sec: 42,
      virality_total: 87,
      preview_url: "https://p/1",
      download_url: "https://d/1",
      direct_url: "https://x/1",
      status: "completed",
    });
    expect(rows[0].virality).toEqual(payload.magicClips![0].viralityScores);
  });

  it("returns [] when magicClips is missing (failed project)", () => {
    const failed: MagicClipsWebhookPayload = { projectId: "p", status: "failed" };
    expect(mapWebhookClips(failed, "ep")).toEqual([]);
  });
});

describe("updateProject / exportProject", () => {
  it("PUTs the payload to /v1/projects/{id} with the api key", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "p1" }), { status: 200 }));
    const { updateProject } = await import("@/lib/submagic");
    await updateProject("p1", { removeBadTakes: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.submagic.co/v1/projects/p1");
    expect(init.method).toBe("PUT");
    expect(init.headers["x-api-key"]).toBe("sk-test-key");
    expect(JSON.parse(init.body)).toEqual({ removeBadTakes: true });
  });

  it("POSTs export with webhookUrl and returns the status payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ projectId: "p1", status: "exporting" }), { status: 200 }),
    );
    const { exportProject } = await import("@/lib/submagic");
    const res = await exportProject("p1", "https://x/api/webhooks/submagic");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.submagic.co/v1/projects/p1/export");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).webhookUrl).toBe("https://x/api/webhooks/submagic");
    expect(res.status).toBe("exporting");
  });

  it("throws hebrew errors on failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response("no credits", { status: 402 }));
    const { exportProject } = await import("@/lib/submagic");
    await expect(exportProject("p1")).rejects.toThrow(/402/);
  });
});

describe("applyWordEdits", () => {
  it("replaces only edited word texts, preserving order, timing and untouched words", async () => {
    const { applyWordEdits } = await import("@/lib/submagic");
    const words = [
      { id: "w1", text: "שלום", type: "word" as const, startTime: 0, endTime: 0.5 },
      { id: "w2", text: "עולם", type: "word" as const, startTime: 0.5, endTime: 1 },
    ];
    const out = applyWordEdits(words, new Map([[1, "עולמי"]]));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(words[0]);
    expect(out[1].text).toBe("עולמי");
    expect(out[1].startTime).toBe(0.5);
    expect(out).not.toBe(words); // no mutation
  });
});

describe("createMagicClips dictionary", () => {
  it("includes dictionary only when terms are provided", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "p" }), { status: 202 }));
    const { createMagicClips } = await import("@/lib/submagic");
    await createMagicClips({
      title: "t",
      youtubeUrl: "https://youtu.be/x",
      dictionary: ["בדיוק", "יונה משה-דוד"],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.dictionary).toEqual(["בדיוק", "יונה משה-דוד"]);
  });

  it("omits dictionary when empty", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "p" }), { status: 202 }));
    const { createMagicClips } = await import("@/lib/submagic");
    await createMagicClips({ title: "t", youtubeUrl: "https://youtu.be/x", dictionary: [] });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect("dictionary" in body).toBe(false);
  });
});

describe("parseDictionary", () => {
  it("splits on newlines/commas, trims, dedups, caps term length and count", async () => {
    const { parseDictionary } = await import("@/lib/submagic");
    const out = parseDictionary("בדיוק, יונה משה-דוד\n בדיוק \n" + "x".repeat(60) + "\n");
    expect(out).toEqual(["בדיוק", "יונה משה-דוד"]);
    const many = parseDictionary(Array.from({ length: 150 }, (_, i) => "מונח" + i).join("\n"));
    expect(many.length).toBe(100);
  });

  it("returns [] for null/empty", async () => {
    const { parseDictionary } = await import("@/lib/submagic");
    expect(parseDictionary(null)).toEqual([]);
    expect(parseDictionary("  ")).toEqual([]);
  });
});

describe("listHookTitleTemplates", () => {
  it("GETs the templates list", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ templates: ["tiktok", "laura"] }), { status: 200 }),
    );
    const { listHookTitleTemplates } = await import("@/lib/submagic");
    const t = await listHookTitleTemplates();
    expect(t).toEqual(["tiktok", "laura"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.submagic.co/v1/hook-title/templates");
  });
});
