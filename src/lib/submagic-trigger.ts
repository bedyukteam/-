// Kicks off Submagic Magic Clips for a published episode and records the
// project on the episode row. Never throws — a Submagic failure must not
// break the YouTube publish flow that calls this.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMagicClips,
  createMagicClipsUpload,
  getProject,
  getProjectDetail,
  isNewRender,
  mapWebhookClips,
  parseDictionary,
  topClipsByVirality,
} from "@/lib/submagic";
import { objectSize, signGetUrl } from "@/lib/r2";
import { generateReelsMetadata } from "@/lib/reels-metadata";
import { createAdminClient } from "@/lib/supabase/admin";
import { isVideoNotReadyError } from "@/lib/submagic";

// Big uploads (1.5GB+) can keep YouTube processing for 30-40 minutes — the
// retry window has to cover that (observed: 3x3min was not enough).
const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRIES = 8;

function scheduleRetry(episodeId: string, origin: string, retriesLeft: number) {
  setTimeout(() => {
    const admin = createAdminClient();
    if (!admin) return;
    void triggerSubmagic(admin, episodeId, origin, { retriesLeft });
  }, RETRY_DELAY_MS);
}

// Submagic's completion webhook is unreliable while the free-tier server can
// be asleep at delivery time — poll as a safety net until the clips land.
const POLL_DELAY_MS = 5 * 60 * 1000;
const MAX_POLLS = 18; // ~90 minutes of coverage

export function schedulePoll(episodeId: string, pollsLeft: number) {
  if (pollsLeft <= 0) return;
  setTimeout(() => {
    const admin = createAdminClient();
    if (!admin) return;
    void (async () => {
      try {
        const { status, clips } = await refreshSubmagic(admin, episodeId);
        if (status === "processing" || (status === "ready" && clips === 0)) {
          schedulePoll(episodeId, pollsLeft - 1);
        }
      } catch (e) {
        console.error(`[submagic-poll] ${episodeId}:`, (e as Error).message.slice(0, 200));
        schedulePoll(episodeId, pollsLeft - 1);
      }
    })();
  }, POLL_DELAY_MS);
}

/** Best-effort: generate yt metadata for clips that just arrived. Never throws. */
export async function tryGenerateReelsMetadata(sb: SupabaseClient, episodeId: string) {
  try {
    await generateReelsMetadata(sb, episodeId);
  } catch (e) {
    console.error("[reels-metadata] generation failed:", (e as Error).message);
  }
}

/* ---------------- External (Submagic-UI) reel edits ---------------- */
// Exports done inside Submagic's own editor never call our webhook, so a clip
// marked edit_status='editing' is polled for a changed downloadUrl. This core
// serves both the manual/auto refresh route and the server-side poller.

const EDITING_MAX_AGE_MS = 24 * 3600_000;

export interface ClipEditRefreshResult {
  status: string | null;
  changed: boolean;
  exported: boolean;
  cleared?: boolean;
  notFound?: boolean;
  /** edit_status as stored BEFORE this check — poller stops unless 'editing'. */
  editStatus: string | null;
}

/** Pull the clip's current state from Submagic and update our row when a new
 *  render exists. Throws on unexpected Submagic errors (caller maps to 500). */
export async function refreshClipEdit(
  sb: SupabaseClient,
  clipId: string,
): Promise<ClipEditRefreshResult> {
  const { data: row } = await sb
    .from("submagic_clips")
    .select("download_url, direct_url, edit_status, edit_opened_at")
    .eq("id", clipId)
    .single();
  if (!row) return { status: null, changed: false, exported: false, notFound: true, editStatus: null };
  const editStatus = (row.edit_status as string | null) ?? null;

  let fresh;
  try {
    fresh = await getProjectDetail(clipId);
  } catch (e) {
    const msg = (e as Error).message;
    if (/\(404\)/.test(msg)) {
      // Deleted on Submagic's side — keep our row (it may already be
      // published), just stop the external-edit tracking.
      if (editStatus === "editing") {
        await sb
          .from("submagic_clips")
          .update({ edit_status: null, edit_opened_at: null })
          .eq("id", clipId);
      }
      return { status: null, changed: false, exported: false, notFound: true, editStatus };
    }
    throw e;
  }

  if (editStatus === "exporting") {
    // In-app export in flight — we know a render was started, so completion
    // status is the signal (unchanged behavior).
    const exported = fresh.status === "completed";
    await sb
      .from("submagic_clips")
      .update({
        ...(exported ? { edit_status: "exported", edit_opened_at: null } : {}),
        ...(fresh.status === "failed" ? { edit_status: "error" } : {}),
        ...(fresh.downloadUrl ? { download_url: fresh.downloadUrl } : {}),
        ...(fresh.directUrl ? { direct_url: fresh.directUrl } : {}),
      })
      .eq("id", clipId);
    return { status: fresh.status ?? null, changed: exported, exported, editStatus };
  }

  // Change-detection mode ('editing' / 'exported' / null): only an actually
  // different downloadUrl counts as a re-export — a completed status alone
  // proves nothing for a clip that was already rendered once.
  if (isNewRender(row.download_url as string | null, fresh.downloadUrl)) {
    await sb
      .from("submagic_clips")
      .update({
        download_url: fresh.downloadUrl,
        ...(fresh.directUrl ? { direct_url: fresh.directUrl } : {}),
        ...(fresh.title ? { title: fresh.title } : {}),
        edit_status: "exported",
        edit_opened_at: null,
      })
      .eq("id", clipId);
    return { status: fresh.status ?? null, changed: true, exported: true, editStatus };
  }

  // Nothing new. Expire a stale external-edit session so tracking stops.
  const openedAt = row.edit_opened_at ? Date.parse(row.edit_opened_at as string) : NaN;
  if (
    editStatus === "editing" &&
    Number.isFinite(openedAt) &&
    Date.now() - openedAt > EDITING_MAX_AGE_MS
  ) {
    await sb
      .from("submagic_clips")
      .update({ edit_status: null, edit_opened_at: null })
      .eq("id", clipId);
    return { status: fresh.status ?? null, changed: false, exported: false, cleared: true, editStatus };
  }

  return { status: fresh.status ?? null, changed: false, exported: false, editStatus };
}

// Server-side polling while the user edits in Submagic's UI — works even when
// her browser tab is closed. Same free-tier caveats as schedulePoll: timers
// die with the process; the boot sweep re-arms active edit sessions.
const EDIT_POLL_DELAY_MS = 2 * 60 * 1000;
export const EDIT_MAX_POLLS = 60; // ~2 hours of coverage

export function scheduleEditPoll(clipId: string, pollsLeft: number) {
  if (pollsLeft <= 0) return;
  setTimeout(() => {
    const admin = createAdminClient();
    if (!admin) return;
    void (async () => {
      try {
        const r = await refreshClipEdit(admin, clipId);
        // Stop on resolution, or when the clip left the 'editing' state some
        // other way (manual check, in-app export, cleanup).
        if (r.changed || r.cleared || r.notFound || r.editStatus !== "editing") return;
        scheduleEditPoll(clipId, pollsLeft - 1);
      } catch (e) {
        console.error(`[edit-poll] ${clipId}:`, (e as Error).message.slice(0, 200));
        scheduleEditPoll(clipId, pollsLeft - 1);
      }
    })();
  }, EDIT_POLL_DELAY_MS);
}

/**
 * Stream the episode video from R2 into Submagic's Magic Clips upload endpoint
 * (no hosted-URL variant exists). Never buffers the file — the fetched R2 body
 * is piped straight through with an exact Content-Length.
 */
async function magicClipsFromR2(
  videoKey: string,
  sourceFilename: string | null,
  opts: {
    title: string;
    webhookUrl?: string;
    templateName?: string;
    userThemeId?: string;
  },
) {
  const url = await signGetUrl(videoKey);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`קריאת וידאו הפרק מ-R2 נכשלה (${res.status})`);
  }
  const size = Number(res.headers.get("content-length") ?? 0) || (await objectSize(videoKey));
  if (!size) {
    void res.body.cancel();
    throw new Error("גודל וידאו הפרק ב-R2 לא ידוע — אי אפשר להזרים ל-Submagic");
  }
  // ASCII-only filename — Hebrew names can break multipart parsing server-side.
  const rawName = sourceFilename || videoKey.split("/").pop() || "episode.mp4";
  const ext = /\.mov$/i.test(rawName) ? ".mov" : ".mp4";
  const base = rawName.replace(/\.[^.]*$/, "").replace(/[^\w.\-]+/g, "_");
  const filename = (/^_*$/.test(base) ? "episode" : base) + ext;
  return createMagicClipsUpload({
    ...opts,
    file: {
      filename,
      contentType: ext === ".mov" ? "video/quicktime" : "video/mp4",
      size,
      stream: res.body,
    },
  });
}

/** Public origins only — Submagic can't reach localhost, so we rely on polling there. */
function webhookUrlFor(origin: string): string | undefined {
  if (/localhost|127\.0\.0\.1/.test(origin)) return undefined;
  return `${origin}/api/webhooks/submagic`;
}

export async function triggerSubmagic(
  sb: SupabaseClient,
  episodeId: string,
  origin: string,
  opts: { recreate?: boolean; retriesLeft?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: ep } = await sb
      .from("episodes")
      .select(
        "title, type, youtube_video_id, channel_id, submagic_project_id, video_key, source_filename",
      )
      .eq("id", episodeId)
      .single();
    if (!ep) return { ok: false, error: "הפרק לא נמצא" };
    if (ep.type === "short") return { ok: false, error: "רילס נוצרים רק לפרקים מלאים" };
    // Never double-create: the trigger now fires both on upload and on YouTube
    // publish (and on scheduled retries) — the first project wins. Re-styling
    // (recreate) is the deliberate exception.
    if (ep.submagic_project_id && !opts.recreate) return { ok: true };
    if (!ep.video_key && !ep.youtube_video_id) {
      return { ok: false, error: "אין וידאו לפרק — נדרש קובץ וידאו או סרטון יוטיוב מפורסם" };
    }

    const { data: gens } = await sb
      .from("generations")
      .select("kind, content")
      .eq("episode_id", episodeId)
      .eq("selected", true)
      .eq("kind", "title");
    const title =
      (gens?.[0]?.content as { text?: string } | undefined)?.text || ep.title || "פרק פודקאסט";

    const { data: style } = await sb
      .from("style_profiles")
      .select("submagic_dictionary, submagic_template, submagic_theme_id")
      .eq("channel_id", ep.channel_id)
      .maybeSingle();
    const dictionary = parseDictionary(style?.submagic_dictionary as string | null);

    // Re-styling an episode = a fresh Magic Clips project. Old clips that were
    // never published are replaced; published ones keep their history.
    if (opts.recreate) {
      const { error: delErr } = await sb
        .from("submagic_clips")
        .delete()
        .eq("episode_id", episodeId)
        .is("yt_video_id", null);
      if (delErr) return { ok: false, error: "מחיקת הרילס הישנים נכשלה: " + delErr.message };
    }

    const baseOpts = {
      title,
      webhookUrl: webhookUrlFor(origin),
      templateName: (style?.submagic_template as string | null) ?? undefined,
      userThemeId: (style?.submagic_theme_id as string | null) ?? undefined,
    };
    const createFromYoutube = async () => {
      const createOpts = {
        ...baseOpts,
        youtubeUrl: `https://www.youtube.com/watch?v=${ep.youtube_video_id}`,
      };
      try {
        return await createMagicClips({ ...createOpts, dictionary });
      } catch (err) {
        // `dictionary` is documented on regular projects but not explicitly on
        // magic-clips — if the API rejects it, fall back to a plain create so the
        // reels still get made.
        if (dictionary.length && /VALIDATION|dictionary/i.test((err as Error).message)) {
          return await createMagicClips(createOpts);
        }
        throw err;
      }
    };

    let project;
    if (ep.video_key) {
      // The episode video is already in R2 — stream it straight to Submagic so
      // reels start rendering right after upload, before any YouTube publish.
      try {
        project = await magicClipsFromR2(ep.video_key as string, ep.source_filename, baseOpts);
      } catch (err) {
        // e.g. >120min episode or a dead R2 object. When a published YouTube
        // video exists (publish-time call) the old path still saves the day.
        if (!ep.youtube_video_id) throw err;
        console.error(
          `[submagic-trigger] ${episodeId} R2 upload failed, falling back to YouTube:`,
          (err as Error).message.slice(0, 300),
        );
        project = await createFromYoutube();
      }
    } else {
      project = await createFromYoutube();
    }
    await sb
      .from("episodes")
      .update({ submagic_project_id: project.id, submagic_status: "processing" })
      .eq("id", episodeId);
    schedulePoll(episodeId, MAX_POLLS);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retriesLeft = opts.retriesLeft ?? MAX_RETRIES;
    if (isVideoNotReadyError(msg) && retriesLeft > 0) {
      console.error(
        `[submagic-trigger] ${episodeId} video not ready on YouTube yet — retrying in ${RETRY_DELAY_MS / 60000} min (${retriesLeft} left)`,
      );
      // Keep the episode looking in-progress while we wait for YouTube.
      await sb.from("episodes").update({ submagic_status: "processing" }).eq("id", episodeId);
      scheduleRetry(episodeId, origin, retriesLeft - 1);
      return { ok: true };
    }
    console.error("[submagic-trigger]", episodeId, msg);
    await sb.from("episodes").update({ submagic_status: "error" }).eq("id", episodeId);
    return { ok: false, error: msg };
  }
}

/** Poll Submagic for the episode's project and store any finished clips. */
export async function refreshSubmagic(
  sb: SupabaseClient,
  episodeId: string,
): Promise<{ status: string; clips: number }> {
  const { data: ep } = await sb
    .from("episodes")
    .select("submagic_project_id")
    .eq("id", episodeId)
    .single();
  if (!ep?.submagic_project_id) return { status: "none", clips: 0 };

  const project = await getProject(ep.submagic_project_id);
  const rows = topClipsByVirality(mapWebhookClips({ magicClips: project.magicClips }, episodeId));
  if (rows.length) {
    const { error } = await sb.from("submagic_clips").upsert(rows, { onConflict: "id" });
    if (error) throw new Error("שמירת הקליפים נכשלה: " + error.message);
  }
  const status =
    project.status === "completed" ? "ready" : project.status === "failed" ? "error" : "processing";
  await sb.from("episodes").update({ submagic_status: status }).eq("id", episodeId);
  if (status === "ready" && rows.length) await tryGenerateReelsMetadata(sb, episodeId);
  return { status, clips: rows.length };
}
