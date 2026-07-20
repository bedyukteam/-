// Core of reel metadata generation — one gpt-4o call per episode batch.
// Called by the API route (user-scoped client) and best-effort by the
// Submagic webhook/refresh once clips arrive (admin client).
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON } from "@/lib/openai";
import { buildReelsMetadataPrompt } from "@/lib/prompts";
import { getStyleContext } from "@/lib/pipeline";

export async function generateReelsMetadata(
  sb: SupabaseClient,
  episodeId: string,
  opts: { clipId?: string; force?: boolean } = {},
): Promise<{ updated: number }> {
  const { data: ep } = await sb
    .from("episodes")
    .select("channel_id")
    .eq("id", episodeId)
    .single();
  if (!ep) throw new Error("episode not found");

  let q = sb
    .from("submagic_clips")
    .select("id, title, duration_sec, yt_title")
    .eq("episode_id", episodeId);
  if (opts.clipId) q = q.eq("id", opts.clipId);
  const { data: allClips } = await q;
  const clips = (allClips ?? []).filter((c) => opts.clipId || opts.force || !c.yt_title);
  if (clips.length === 0) return { updated: 0 };

  const { data: tr } = await sb
    .from("transcripts")
    .select("text")
    .eq("episode_id", episodeId)
    .maybeSingle();

  const ctx = await getStyleContext(sb, ep.channel_id as string);
  const prompt = buildReelsMetadataPrompt(
    clips.map((c) => ({
      id: c.id as string,
      title: c.title as string | null,
      durationSec: c.duration_sec as number | null,
    })),
    (tr?.text as string) ?? "",
    ctx,
  );
  const r = await chatJSON<{ reels?: { id: string; title?: string; description?: string }[] }>(
    prompt.system,
    prompt.user,
  );

  let updated = 0;
  for (const reel of r.reels ?? []) {
    if (!reel.id || !reel.title) continue;
    const { error } = await sb
      .from("submagic_clips")
      .update({ yt_title: reel.title.slice(0, 100), yt_description: reel.description ?? "" })
      .eq("id", reel.id)
      .eq("episode_id", episodeId);
    if (!error) updated++;
  }
  return { updated };
}
