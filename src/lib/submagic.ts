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
  dictionary?: string[];
  /** Built-in caption style; ignored when userThemeId is set (API forbids both). */
  templateName?: string;
  /** The user's custom caption theme (font/size/position designed in Submagic's editor). */
  userThemeId?: string;
}): Promise<MagicClipsProject> {
  const theme = opts.userThemeId?.trim();
  const template = opts.templateName?.trim();
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
      ...(opts.dictionary && opts.dictionary.length ? { dictionary: opts.dictionary } : {}),
      ...(theme ? { userThemeId: theme } : template ? { templateName: template } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`יצירת Magic Clips נכשלה (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as MagicClipsProject;
}

/* ---------------- Magic Clips from an uploaded file ---------------- */
// POST /projects/magic-clips/upload (multipart, MP4/MOV ≤10GB ≤120min) — the
// only file-based Magic Clips variant; there is no hosted-URL variant, so the
// caller streams the episode video (from R2) straight through. The body is
// hand-rolled so we can send an exact Content-Length without buffering the
// file (the server has 512MB RAM; episodes run 1.5GB+).

export interface MultipartFile {
  filename: string;
  contentType: string;
  /** Exact byte size of the file — required for the Content-Length. */
  size: number;
  stream: ReadableStream<Uint8Array>;
}

/** Pure: compose a multipart/form-data body with an exact Content-Length. */
export function buildMultipart(
  fields: Record<string, string>,
  file: MultipartFile,
  boundary: string,
): { body: ReadableStream<Uint8Array>; contentLength: number; contentType: string } {
  const enc = new TextEncoder();
  let head = "";
  for (const [name, value] of Object.entries(fields)) {
    head += `--${boundary}\r\ncontent-disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }
  head +=
    `--${boundary}\r\ncontent-disposition: form-data; name="file"; ` +
    `filename="${file.filename.replace(/"/g, "")}"\r\ncontent-type: ${file.contentType}\r\n\r\n`;
  const preamble = enc.encode(head);
  const epilogue = enc.encode(`\r\n--${boundary}--\r\n`);

  // Pull-based so undici's backpressure reaches the source stream — an eager
  // loop would buffer the whole video in memory.
  const reader = file.stream.getReader();
  let stage: "preamble" | "file" = "preamble";
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stage === "preamble") {
        controller.enqueue(preamble);
        stage = "file";
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(epilogue);
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return {
    body,
    contentLength: preamble.byteLength + file.size + epilogue.byteLength,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function createMagicClipsUpload(opts: {
  title: string;
  file: MultipartFile;
  language?: string;
  webhookUrl?: string;
  minClipLength?: number;
  maxClipLength?: number;
  /** Built-in caption style; ignored when userThemeId is set (API forbids both). */
  templateName?: string;
  /** The user's custom caption theme (font/size/position designed in Submagic's editor). */
  userThemeId?: string;
}): Promise<MagicClipsProject> {
  const theme = opts.userThemeId?.trim();
  const template = opts.templateName?.trim();
  // Note: `dictionary` is deliberately not sent — the upload endpoint doesn't
  // document it and there's no safe multipart encoding to guess at.
  const fields: Record<string, string> = {
    title: opts.title.slice(0, 100),
    language: opts.language ?? "he",
    ...(opts.webhookUrl ? { webhookUrl: opts.webhookUrl } : {}),
    ...(opts.minClipLength ? { minClipLength: String(opts.minClipLength) } : {}),
    ...(opts.maxClipLength ? { maxClipLength: String(opts.maxClipLength) } : {}),
    ...(theme ? { userThemeId: theme } : template ? { templateName: template } : {}),
  };
  const boundary = `----podcast-studio-${crypto.randomUUID()}`;
  const { body, contentLength, contentType } = buildMultipart(fields, opts.file, boundary);
  const res = await fetch(`${API_BASE}/projects/magic-clips/upload`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "content-length": String(contentLength),
      "x-api-key": apiKey(),
    },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!res.ok) {
    throw new Error(`העלאת הפרק ל-Magic Clips נכשלה (${res.status}): ${await res.text()}`);
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

/* ---------------- Reel editing (per-clip projects) ---------------- */
// Each magic clip is itself an addressable project (verified live 2026-07-20):
// GET /v1/projects/{clip.id} returns its own words array; PUT updates it and
// POST /projects/{id}/export re-renders (consumes a Submagic credit).

export interface ProjectWord {
  id?: string;
  text: string;
  type: "word" | "silence" | "punctuation";
  startTime: number;
  endTime: number;
}

export interface HookTitle {
  text?: string;
  template?: string;
  top?: number;
  size?: number;
}

export interface ProjectDetail extends MagicClipsProject {
  words?: ProjectWord[];
  hookTitle?: HookTitle | boolean;
  removeBadTakes?: boolean;
  disableCaptions?: boolean;
  // present on per-clip projects (top-level video links)
  downloadUrl?: string;
  directUrl?: string;
}

export interface AiBrollItem {
  type: "ai-broll";
  startTime: number;
  endTime: number;
  prompt: string;
  layout?: string;
}

export interface UpdateProjectPayload {
  words?: ProjectWord[];
  hookTitle?: HookTitle | boolean;
  removeSilencePace?: "natural" | "fast" | "extra-fast";
  removeBadTakes?: boolean;
  disableCaptions?: boolean;
  items?: AiBrollItem[];
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail> {
  return (await getProject(projectId)) as ProjectDetail;
}

export async function updateProject(
  projectId: string,
  payload: UpdateProjectPayload,
): Promise<ProjectDetail> {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`עדכון הריל ב-Submagic נכשל (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as ProjectDetail;
}

export async function exportProject(
  projectId: string,
  webhookUrl?: string,
): Promise<{ projectId?: string; status?: string; message?: string }> {
  const res = await fetch(`${API_BASE}/projects/${projectId}/export`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey() },
    body: JSON.stringify(webhookUrl ? { webhookUrl } : {}),
  });
  if (!res.ok) {
    throw new Error(`רינדור-מחדש ב-Submagic נכשל (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { projectId?: string; status?: string; message?: string };
}

/**
 * Pure: true when a fetched downloadUrl represents a new render.
 * Submagic download links keep a constant pathname (/api/file/download) and
 * carry the real file identity in the `path` query param — so the render
 * identity is pathname + `path`, while other (potentially rotating) query
 * params are ignored.
 */
export function isNewRender(stored: string | null, fetched: string | null | undefined): boolean {
  if (!fetched) return false;
  if (!stored) return true;
  try {
    const key = (raw: string) => {
      const u = new URL(raw);
      return `${u.pathname}|${u.searchParams.get("path") ?? ""}`;
    };
    return key(stored) !== key(fetched);
  } catch {
    return stored !== fetched;
  }
}

/** Pure: return a new words array with the given index→text edits applied. */
export function applyWordEdits(words: ProjectWord[], edits: Map<number, string>): ProjectWord[] {
  return words.map((w, i) => (edits.has(i) ? { ...w, text: edits.get(i)! } : w));
}

/**
 * Parse the user's brand dictionary (free text, newline/comma separated) into
 * the API's shape: ≤100 unique terms, each ≤50 chars.
 */
export function parseDictionary(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]+/)) {
    const t = part.trim();
    if (!t || t.length > 50 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 100) break;
  }
  return out;
}

/** Available hook-title animation templates (e.g. "tiktok", "hormozi"). */
export async function listHookTitleTemplates(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/hook-title/templates`, {
    headers: { "x-api-key": apiKey() },
  });
  if (!res.ok) {
    throw new Error(`שליפת תבניות-הוק נכשלה (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { templates?: string[] };
  return data.templates ?? [];
}

/** Built-in caption style templates (e.g. "Sara", "Hormozi 2"). */
export async function listTemplates(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/templates`, {
    headers: { "x-api-key": apiKey() },
  });
  if (!res.ok) {
    throw new Error(`שליפת תבניות-כתוביות נכשלה (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { templates?: string[] };
  return data.templates ?? [];
}

/**
 * How many reels enter the inbox per episode — Submagic's AI decides how many
 * clips to cut (not controllable via API), so we keep only the strongest ones.
 */
export const REELS_KEEP_TOP = 10;

/** Pure: the N clips with the highest virality score (null scores sort last). */
export function topClipsByVirality(rows: SubmagicClipRow[], n = REELS_KEEP_TOP): SubmagicClipRow[] {
  return [...rows]
    .sort((a, b) => (b.virality_total ?? 0) - (a.virality_total ?? 0))
    .slice(0, n);
}

/**
 * Right after a YouTube publish the video may not be processed yet, and
 * Submagic fails with "Could not determine video duration". That's a timing
 * race, not a real error — callers should retry with a delay.
 */
export function isVideoNotReadyError(msg: string): boolean {
  // Two phrasings observed from Submagic for a video YouTube hasn't finished
  // processing: "Could not determine video duration..." and
  // "yt-api /video returned no usable metadata ... error=Retry".
  return /determine video duration|no usable metadata/i.test(msg);
}
