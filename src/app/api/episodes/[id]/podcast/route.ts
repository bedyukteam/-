// Publish/unpublish an episode to the podcast RSS feed (Spotify & friends).
// Publishing = copy the episode MP3 into the public R2 bucket and stamp
// episodes.spotify_published_at — the feed route serves everything stamped.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { copyToPublicBucket, objectSize } from "@/lib/r2";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: ep } = await supabase
    .from("episodes")
    .select("audio_key, audio_size, duration_seconds")
    .eq("id", id)
    .single();
  if (!ep?.audio_key) {
    return NextResponse.json(
      { error: "לפרק אין קובץ אודיו — יש להעלות/לעבד אותו קודם" },
      { status: 400 },
    );
  }

  let publishAt: string | null = null;
  try {
    const body = (await req.json()) as { publishAt?: string | null };
    if (body.publishAt) {
      const t = Date.parse(body.publishAt);
      if (!Number.isFinite(t)) {
        return NextResponse.json({ error: "תאריך פרסום לא תקין" }, { status: 400 });
      }
      publishAt = new Date(t).toISOString();
    }
  } catch {
    // empty body → publish now
  }

  try {
    // Lazy backfill for episodes extracted before size/duration capture.
    let { audio_size, duration_seconds } = ep as {
      audio_size: number | null;
      duration_seconds: number | null;
    };
    if (!audio_size) {
      audio_size = await objectSize(ep.audio_key as string);
      if (!duration_seconds && audio_size) {
        duration_seconds = Math.round((audio_size * 8) / 128000); // CBR 128kbps
      }
    }

    await copyToPublicBucket(ep.audio_key as string);

    const { error } = await supabase
      .from("episodes")
      .update({
        spotify_published_at: publishAt ?? new Date().toISOString(),
        audio_size,
        duration_seconds,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Removes the episode from the feed; the public audio copy is left in place
  // (harmless, and re-publishing becomes instant).
  const { error } = await supabase
    .from("episodes")
    .update({ spotify_published_at: null })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
