// studio/src/app/api/youtube/sync/route.ts
// Imports the channel's already-published YouTube videos into the system as
// episodes (podcast/short classified by duration), so content uploaded before
// or outside the system shows up in the episode list and analytics.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { fetchAllUploads, isShortDuration } from "@/lib/youtube-channel";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const accessToken = await getValidAccessToken(supabase);
    const uploads = await fetchAllUploads(accessToken);

    const { data: existing } = await supabase
      .from("episodes")
      .select("youtube_video_id")
      .not("youtube_video_id", "is", null);
    const known = new Set((existing ?? []).map((e) => e.youtube_video_id as string));

    const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
    const rows = uploads
      .filter((v) => !known.has(v.videoId) && v.privacyStatus === "public")
      .map((v) => ({
        channel_id: channelId,
        title: v.title,
        type: isShortDuration(v.durationSec) ? "short" : "episode",
        status: "ready",
        youtube_video_id: v.videoId,
        youtube_status: "published",
        publish_at: v.publishedAt || null,
      }));

    if (rows.length) {
      const { error } = await supabase.from("episodes").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, imported: rows.length, totalOnChannel: uploads.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
