// Kicks off Submagic Magic Clips for a published episode and records the
// project on the episode row. Never throws — a Submagic failure must not
// break the YouTube publish flow that calls this.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMagicClips,
  getProject,
  mapWebhookClips,
  parseDictionary,
  topClipsByVirality,
} from "@/lib/submagic";
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

function schedulePoll(episodeId: string, pollsLeft: number) {
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
      .select("title, type, youtube_video_id, channel_id, submagic_project_id")
      .eq("id", episodeId)
      .single();
    if (!ep?.youtube_video_id) return { ok: false, error: "אין סרטון יוטיוב מפורסם לפרק" };
    if (ep.type === "short") return { ok: false, error: "רילס נוצרים רק לפרקים מלאים" };
    // A scheduled retry must not double-create if a project appeared meanwhile
    // (manual trigger, or an earlier retry that succeeded).
    if (opts.retriesLeft !== undefined && ep.submagic_project_id) return { ok: true };

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

    const createOpts = {
      title,
      youtubeUrl: `https://www.youtube.com/watch?v=${ep.youtube_video_id}`,
      webhookUrl: webhookUrlFor(origin),
      templateName: (style?.submagic_template as string | null) ?? undefined,
      userThemeId: (style?.submagic_theme_id as string | null) ?? undefined,
    };
    let project;
    try {
      project = await createMagicClips({ ...createOpts, dictionary });
    } catch (err) {
      // `dictionary` is documented on regular projects but not explicitly on
      // magic-clips — if the API rejects it, fall back to a plain create so the
      // reels still get made.
      if (dictionary.length && /VALIDATION|dictionary/i.test((err as Error).message)) {
        project = await createMagicClips(createOpts);
      } else {
        throw err;
      }
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
