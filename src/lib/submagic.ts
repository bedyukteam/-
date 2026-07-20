// Submagic Magic Clips — hand-rolled REST client, matching the house style of
// youtube.ts / canva-oauth.ts (no SDK). Endpoints/fields verified against the
// live docs at docs.submagic.co/api-reference/magic-clips.md on 2026-07-17.

const API_BASE = "https://api.submagic.co/v1";

function apiKey(): string {
  const key = process.env.SUBMAGIC_API_KEY;
  if (!key) throw new Error("SUBMAGIC_API_KEY חסר — הוסיפי את המפתח בהגדרות הסביבה");
  return key;
}

export interface MagicClipsProject {
  id: string;
  title?: string;
  language?: string;
  status?: string;
  createdAt?: string;
  magicClips?: MagicClip[];
}

export interface MagicClip {
  id: string;
  title?: string;
  duration?: number;
  viralityScores?: {
    total?: number;
    shareability?: number;
    hook_strength?: number;
    story_quality?: number;
    emotional_impact?: number;
  };
  status?: string;
  previewUrl?: string;
  downloadUrl?: string;
  directUrl?: string;
}

export interface MagicClipsWebhookPayload {
  projectId: string;
  status: "completed" | "failed";
  title?: string;
  duration?: number;
  completedAt?: string;
  magicClips?: MagicClip[];
}

export async function createMagicClips(opts: {
  title: string;
  youtubeUrl: string;
  language?: string;
  webhookUrl?: string;
  minClipLength?: number;
  maxClipLength?: number;
}): Promise<MagicClipsProject> {
  const res = await fetch(`${API_BASE}/projects/magic-clips`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify({
      title: opts.title.slice(0, 100),
      language: opts.language ?? "he",
      youtubeUrl: opts.youtubeUrl,
      ...(opts.webhookUrl ? { webhookUrl: opts.webhookUrl } : {}),
      ...(opts.minClipLength ? { minClipLength: opts.minClipLength } : {}),
      ...(opts.maxClipLength ? { maxClipLength: opts.maxClipLength } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`יצירת Magic Clips נכשלה (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as MagicClipsProject;
}

export async function getProject(projectId: string): Promise<MagicClipsProject> {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    headers: { "x-api-key": apiKey() },
  });
  if (!res.ok) {
    throw new Error(`שליפת פרויקט Submagic נכשלה (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as MagicClipsProject;
}

export interface SubmagicClipRow {
  id: string;
  episode_id: string;
  title: string | null;
  duration_sec: number | null;
  virality_total: number | null;
  virality: MagicClip["viralityScores"] | null;
  preview_url: string | null;
  download_url: string | null;
  direct_url: string | null;
  status: string | null;
}

/** Map a webhook (or polled project) clips array to submagic_clips rows. */
export function mapWebhookClips(
  payload: Pick<MagicClipsWebhookPayload, "magicClips">,
  episodeId: string,
): SubmagicClipRow[] {
  return (payload.magicClips ?? []).map((c) => ({
    id: c.id,
    episode_id: episodeId,
    title: c.title ?? null,
    duration_sec: c.duration ?? null,
    virality_total: c.viralityScores?.total ?? null,
    virality: c.viralityScores ?? null,
    preview_url: c.previewUrl ?? null,
    download_url: c.downloadUrl ?? null,
    direct_url: c.directUrl ?? null,
    status: c.status ?? null,
  }));
}
