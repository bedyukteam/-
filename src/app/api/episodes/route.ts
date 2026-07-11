import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, title, source_path, source_filename, transcript_text, input_mode, video_key, video_size } =
    body ?? {};

  const hasTranscript = typeof transcript_text === "string" && transcript_text.trim().length > 0;
  const hasVideo = typeof video_key === "string" && video_key.length > 0;
  if (!source_path && !hasTranscript && !hasVideo) {
    return NextResponse.json(
      { error: "missing source_path, transcript_text or video_key" },
      { status: 400 },
    );
  }

  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
  const mode = hasTranscript
    ? input_mode === "srt"
      ? "srt"
      : "transcript"
    : hasVideo
      ? "video"
      : "audio";

  const { data: ep, error } = await supabase
    .from("episodes")
    .insert({
      channel_id: channelId,
      type: type === "short" ? "short" : "episode",
      title: title ?? "",
      source_path: source_path ?? null,
      source_filename: source_filename ?? null,
      video_key: hasVideo ? video_key : null,
      video_size: hasVideo ? (video_size ?? null) : null,
      input_mode: mode,
      status: hasTranscript ? "processing" : "uploaded",
    })
    .select("id")
    .single();

  if (error || !ep) {
    return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });
  }

  // Transcript pasted/imported → store it and mark transcription done so the
  // dashboard drives straight to generation (no audio upload / ffmpeg / OpenAI).
  if (hasTranscript) {
    await supabase.from("transcripts").upsert(
      { episode_id: ep.id, language: "he", text: transcript_text.trim(), segments: [] },
      { onConflict: "episode_id" },
    );
    await supabase.from("jobs").insert({
      episode_id: ep.id,
      stage: "transcribe",
      status: "done",
    });
  }

  return NextResponse.json({ id: ep.id });
}
