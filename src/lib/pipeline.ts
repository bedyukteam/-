import { SupabaseClient } from "@supabase/supabase-js";
import { chatJSON, generateThumbnail, transcribeChunk } from "./openai";
import { extractAudioChunks } from "./audio";
import {
  StyleContext,
  buildTitlesPrompt,
  buildDescriptionPrompt,
  buildCarouselsPrompt,
  buildQuotesPrompt,
  buildIdeasPrompt,
  buildThumbnailsPrompt,
  buildThumbnailImagePrompt,
} from "./prompts";
import type { GenerationKind, JobStage } from "./types";

const BUCKET = "media";

export type NextStage = JobStage | null;

async function setEpisodeStatus(sb: SupabaseClient, episodeId: string, status: string) {
  await sb.from("episodes").update({ status }).eq("id", episodeId);
}

/** One job row per (episode, stage): clear any prior attempt, insert a fresh running row. */
async function startJob(sb: SupabaseClient, episodeId: string, stage: JobStage): Promise<string> {
  await sb.from("jobs").delete().eq("episode_id", episodeId).eq("stage", stage);
  const { data } = await sb
    .from("jobs")
    .insert({ episode_id: episodeId, stage, status: "running" })
    .select("id")
    .single();
  return data!.id as string;
}

async function finishJob(sb: SupabaseClient, jobId: string, error?: string) {
  await sb
    .from("jobs")
    .update({
      status: error ? "error" : "done",
      error: error ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

export async function getStyleContext(sb: SupabaseClient, channelId: string): Promise<StyleContext> {
  const { data: profile } = await sb
    .from("style_profiles")
    .select("language_guidelines, visual_guidelines")
    .eq("channel_id", channelId)
    .maybeSingle();

  const { data: rows } = await sb
    .from("style_examples")
    .select("kind, content, created_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(60);

  const examples: Record<string, string[]> = {};
  for (const r of rows ?? []) {
    const c = r.content as Record<string, unknown>;
    const str = typeof c.text === "string" ? c.text : JSON.stringify(c);
    (examples[r.kind] ??= []).push(str);
  }

  return {
    languageGuidelines: profile?.language_guidelines ?? "",
    visualGuidelines: profile?.visual_guidelines ?? "",
    examples,
  };
}

function promptArgs(p: { system: string; user: string }): [string, string] {
  return [p.system, p.user];
}

interface GenRow {
  episode_id: string;
  kind: GenerationKind;
  content: Record<string, unknown>;
}

/* ---------------- Stage 1: transcription ---------------- */
export async function runTranscribe(sb: SupabaseClient, episodeId: string): Promise<NextStage> {
  const { data: ep } = await sb
    .from("episodes")
    .select("source_path, source_filename")
    .eq("id", episodeId)
    .single();
  if (!ep) throw new Error("episode not found");

  await setEpisodeStatus(sb, episodeId, "processing");
  const job = await startJob(sb, episodeId, "transcribe");
  try {
    const { data: file, error: dlErr } = await sb.storage
      .from(BUCKET)
      .download(ep.source_path as string);
    if (dlErr || !file) throw new Error("הורדת הקובץ מהאחסון נכשלה: " + (dlErr?.message ?? ""));

    const buf = await file.arrayBuffer();
    const chunks = await extractAudioChunks(buf, ep.source_filename ?? "audio");
    const parts: string[] = [];
    for (const c of chunks) {
      parts.push(await transcribeChunk(c.buffer, c.name));
    }
    const transcript = parts.join("\n").trim();

    await sb.from("transcripts").upsert(
      { episode_id: episodeId, language: "he", text: transcript, segments: [] },
      { onConflict: "episode_id" },
    );
    await finishJob(sb, job);
    return "generate";
  } catch (e) {
    await finishJob(sb, job, (e as Error).message);
    await setEpisodeStatus(sb, episodeId, "error");
    throw e;
  }
}

/* ---------------- Stage 2: text generation ---------------- */
async function generateAllText(transcript: string, ctx: StyleContext, episodeId: string) {
  const [titles, description, carousels, quotes, ideas, thumbs] = await Promise.all([
    chatJSON<{ titles: string[] }>(...promptArgs(buildTitlesPrompt(transcript, ctx))),
    chatJSON<{ description: string }>(...promptArgs(buildDescriptionPrompt(transcript, ctx))),
    chatJSON<{ carousels: { title: string; slides: string[] }[] }>(
      ...promptArgs(buildCarouselsPrompt(transcript, ctx)),
    ),
    chatJSON<{ quotes: string[] }>(...promptArgs(buildQuotesPrompt(transcript, ctx))),
    chatJSON<{ ideas: { text: string; format?: string }[] }>(
      ...promptArgs(buildIdeasPrompt(transcript, ctx)),
    ),
    chatJSON<{ thumbnails: { concept: string; overlay_text: string; visual: string }[] }>(
      ...promptArgs(buildThumbnailsPrompt(transcript, ctx)),
    ),
  ]);

  const rows: GenRow[] = [];
  for (const t of (titles.titles ?? []).slice(0, 5))
    rows.push({ episode_id: episodeId, kind: "title", content: { text: t } });
  if (description.description)
    rows.push({ episode_id: episodeId, kind: "description", content: { text: description.description } });
  for (const c of (carousels.carousels ?? []).slice(0, 5))
    rows.push({ episode_id: episodeId, kind: "carousel", content: { title: c.title, slides: c.slides } });
  for (const q of (quotes.quotes ?? []).slice(0, 5))
    rows.push({ episode_id: episodeId, kind: "quote", content: { text: q } });
  for (const i of (ideas.ideas ?? []).slice(0, 8))
    rows.push({ episode_id: episodeId, kind: "idea", content: { text: i.text, format: i.format ?? "" } });

  const thumbnails = (thumbs.thumbnails ?? []).slice(0, 5);
  return { rows, thumbnails };
}

export async function runGenerate(sb: SupabaseClient, episodeId: string): Promise<NextStage> {
  const { data: ep } = await sb.from("episodes").select("channel_id").eq("id", episodeId).single();
  const { data: tr } = await sb
    .from("transcripts")
    .select("text")
    .eq("episode_id", episodeId)
    .single();
  if (!ep || !tr) throw new Error("missing episode/transcript");

  const job = await startJob(sb, episodeId, "generate");
  try {
    const ctx = await getStyleContext(sb, ep.channel_id as string);
    const { rows, thumbnails } = await generateAllText(tr.text as string, ctx, episodeId);
    await sb.from("generations").delete().eq("episode_id", episodeId);
    if (rows.length) await sb.from("generations").insert(rows);
    if (thumbnails.length)
      await sb
        .from("generations")
        .insert(thumbnails.map((t) => ({ episode_id: episodeId, kind: "thumbnail", content: t })));
    await finishJob(sb, job);
    return "thumbnails";
  } catch (e) {
    await finishJob(sb, job, (e as Error).message);
    await setEpisodeStatus(sb, episodeId, "error");
    throw e;
  }
}

/* ---------------- Stage 3: thumbnail images ---------------- */
async function renderThumbnail(
  sb: SupabaseClient,
  episodeId: string,
  rowId: string,
  content: { visual: string; overlay_text: string },
  visualGuidelines: string,
) {
  try {
    const prompt = buildThumbnailImagePrompt(content.visual, content.overlay_text, visualGuidelines);
    const png = await generateThumbnail(prompt);
    const path = `thumbnails/${episodeId}/${rowId}.png`;
    await sb.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
    await sb.from("generations").update({ image_path: path }).eq("id", rowId);
  } catch {
    // keep concept-only on failure
  }
}

export async function runThumbnails(sb: SupabaseClient, episodeId: string): Promise<NextStage> {
  const { data: ep } = await sb.from("episodes").select("channel_id").eq("id", episodeId).single();
  const job = await startJob(sb, episodeId, "thumbnails");
  try {
    const { data: thumbRows } = await sb
      .from("generations")
      .select("id, content")
      .eq("episode_id", episodeId)
      .eq("kind", "thumbnail");
    const ctx = await getStyleContext(sb, (ep?.channel_id as string) ?? "");
    await Promise.all(
      (thumbRows ?? []).map((row) =>
        renderThumbnail(sb, episodeId, row.id as string, row.content as never, ctx.visualGuidelines),
      ),
    );
    await finishJob(sb, job);
    await setEpisodeStatus(sb, episodeId, "ready");
    return null;
  } catch (e) {
    await finishJob(sb, job, (e as Error).message);
    await setEpisodeStatus(sb, episodeId, "error");
    throw e;
  }
}

/** Run a single stage and return the next stage to run (client-driven orchestration). */
export async function runStage(
  sb: SupabaseClient,
  episodeId: string,
  stage: JobStage,
): Promise<NextStage> {
  if (stage === "transcribe") return runTranscribe(sb, episodeId);
  if (stage === "generate") return runGenerate(sb, episodeId);
  return runThumbnails(sb, episodeId);
}

/** Run the whole pipeline sequentially (used by scripts / local one-shot). */
export async function processEpisode(sb: SupabaseClient, episodeId: string) {
  await runTranscribe(sb, episodeId);
  await runGenerate(sb, episodeId);
  await runThumbnails(sb, episodeId);
}

/* ---------------- Refresh a single kind ---------------- */
export async function regenerateKind(
  sb: SupabaseClient,
  episodeId: string,
  kind: GenerationKind,
  feedback?: string,
) {
  const { data: ep } = await sb.from("episodes").select("channel_id").eq("id", episodeId).single();
  const { data: tr } = await sb
    .from("transcripts")
    .select("text")
    .eq("episode_id", episodeId)
    .single();
  if (!ep || !tr) throw new Error("הפרק או התמלול לא נמצאו");

  const ctx = await getStyleContext(sb, ep.channel_id as string);
  if (feedback?.trim()) {
    ctx.languageGuidelines += `\n\nהערת מנהלת הסושיאל לסבב הזה (תני לה משקל גבוה): ${feedback.trim()}`;
  }
  const transcript = tr.text as string;

  let rows: GenRow[] = [];
  let thumbs: { concept: string; overlay_text: string; visual: string }[] = [];

  if (kind === "title") {
    const r = await chatJSON<{ titles: string[] }>(...promptArgs(buildTitlesPrompt(transcript, ctx)));
    rows = (r.titles ?? []).slice(0, 5).map((t) => ({ episode_id: episodeId, kind, content: { text: t } }));
  } else if (kind === "description") {
    const r = await chatJSON<{ description: string }>(...promptArgs(buildDescriptionPrompt(transcript, ctx)));
    rows = [{ episode_id: episodeId, kind, content: { text: r.description } }];
  } else if (kind === "carousel") {
    const r = await chatJSON<{ carousels: { title: string; slides: string[] }[] }>(
      ...promptArgs(buildCarouselsPrompt(transcript, ctx)),
    );
    rows = (r.carousels ?? []).slice(0, 5).map((c) => ({ episode_id: episodeId, kind, content: { title: c.title, slides: c.slides } }));
  } else if (kind === "quote") {
    const r = await chatJSON<{ quotes: string[] }>(...promptArgs(buildQuotesPrompt(transcript, ctx)));
    rows = (r.quotes ?? []).slice(0, 5).map((q) => ({ episode_id: episodeId, kind, content: { text: q } }));
  } else if (kind === "idea") {
    const r = await chatJSON<{ ideas: { text: string; format?: string }[] }>(
      ...promptArgs(buildIdeasPrompt(transcript, ctx)),
    );
    rows = (r.ideas ?? []).slice(0, 8).map((i) => ({ episode_id: episodeId, kind, content: { text: i.text, format: i.format ?? "" } }));
  } else if (kind === "thumbnail") {
    const r = await chatJSON<{ thumbnails: { concept: string; overlay_text: string; visual: string }[] }>(
      ...promptArgs(buildThumbnailsPrompt(transcript, ctx)),
    );
    thumbs = (r.thumbnails ?? []).slice(0, 5);
    rows = thumbs.map((t) => ({ episode_id: episodeId, kind, content: t }));
  }

  await sb.from("generations").delete().eq("episode_id", episodeId).eq("kind", kind);
  if (rows.length) {
    const { data: inserted } = await sb.from("generations").insert(rows).select("id, content");
    if (kind === "thumbnail" && inserted) {
      await Promise.all(
        inserted.map((row) =>
          renderThumbnail(sb, episodeId, row.id as string, row.content as never, ctx.visualGuidelines),
        ),
      );
    }
  }
}
