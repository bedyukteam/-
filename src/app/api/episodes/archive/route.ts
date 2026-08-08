// Archive episodes: back-catalog items that go straight into the podcast RSS
// feed with no pipeline processing (no transcription, no Submagic, no YouTube).
// Creates the row with a preset audio_key; the client then multipart-uploads
// the MP3 to that R2 key and calls /api/episodes/[id]/podcast with the
// original (backdated) publish date.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    description?: string;
  } | null;
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "כותרת חובה לפרק ארכיון" }, { status: 400 });
  }

  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
  const { data: ep, error } = await supabase
    .from("episodes")
    .insert({
      channel_id: channelId,
      type: "episode",
      title: body.title.trim(),
      title_chosen: body.title.trim(),
      description_chosen: body.description?.trim() || null,
      input_mode: "audio",
      status: "ready",
    })
    .select("id")
    .single();
  if (error || !ep) {
    return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });
  }

  const audioKey = `audio/${ep.id}.mp3`;
  await supabase.from("episodes").update({ audio_key: audioKey }).eq("id", ep.id);
  return NextResponse.json({ id: ep.id, audioKey });
}
