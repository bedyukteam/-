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
