import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { fetchVideosMeta } from "@/lib/youtube-channel";
import VideoAnalyticsView from "@/components/VideoAnalyticsView";

export const dynamic = "force-dynamic";

export default async function VideoAnalyticsPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const supabase = await createClient();

  // System episode linked to this video (if it went out through the studio app).
  const { data: episode } = await supabase
    .from("episodes")
    .select("id, title, type, spotify_stats")
    .eq("youtube_video_id", videoId)
    .maybeSingle();

  let meta = null;
  let metaError = "";
  try {
    const accessToken = await getValidAccessToken(supabase);
    meta = (await fetchVideosMeta(accessToken, [videoId]))[videoId] ?? null;
  } catch (e) {
    metaError = (e as Error).message;
  }

  if (!meta) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-sm">
        <p className="text-destructive">לא ניתן לטעון את פרטי הסרטון{metaError ? ` — ${metaError}` : ""}.</p>
        <a href="/analytics" className="text-primary hover:underline text-xs">← חזרה לאנליטיקס</a>
      </div>
    );
  }

  return (
    <VideoAnalyticsView
      videoId={videoId}
      meta={meta}
      episode={
        episode
          ? {
              id: episode.id as string,
              type: (episode.type as string) ?? "episode",
              spotifyStats:
                (episode.spotify_stats as {
                  streams: number | null;
                  listeners: number | null;
                  starts: number | null;
                  uploaded_at: string;
                } | null) ?? null,
            }
          : null
      }
    />
  );
}
