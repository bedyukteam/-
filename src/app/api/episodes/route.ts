import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { triggerSubmagic } from "@/lib/submagic-trigger";

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
      video_size: hasVideo && typeof video_size === "number" ? video_size : null,
      input_mode: mode,
      status: hasTranscript ? "processing" : "uploaded",
      // Reels start right away for full video episodes; marking 'processing'
      // here (not after the slow stream to Submagic) lets the boot sweep
      // re-arm the trigger if the server dies mid-upload.
      ...(hasVideo && type !== "short" ? { submagic_status: "processing" } : {}),
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

  // Full episode uploaded as video → start the Submagic reels right away,
  // without waiting for the YouTube publish (the video is already in R2).
  // Fire-and-forget on the persistent server: the multi-GB stream to Submagic
  // must not block this response. The publish-time trigger stays as fallback —
  // triggerSubmagic dedups on submagic_project_id.
  if (hasVideo && type !== "short") {
    const admin = createAdminClient();
    if (admin) {
      const origin = new URL(req.url).origin;
      void triggerSubmagic(admin, ep.id, origin);
    }
  }

  return NextResponse.json({ id: ep.id });
}
