// studio/src/components/AnalyticsView.tsx
// "אנליטיקס" page — per-episode YouTube stats (live) and Spotify CSV snapshots,
// grouped by episode. Reuses AnalyticsPanel per episode.
"use client";

import { useRouter } from "next/navigation";
import AnalyticsPanel from "@/components/AnalyticsPanel";

export interface AnalyticsEpisode {
  id: string;
  title: string | null;
  type: string | null;
  created_at: string;
  youtube_video_id: string | null;
  spotify_stats: {
    streams: number | null;
    listeners: number | null;
    starts: number | null;
    uploaded_at: string;
  } | null;
}

export default function AnalyticsView({ episodes }: { episodes: AnalyticsEpisode[] }) {
  const router = useRouter();

  if (episodes.length === 0) {
    return (
      <p className="text-muted text-sm bg-surface border border-border rounded-2xl p-6">
        עדיין אין פרקים מוכנים. אחרי פרסום ביוטיוב הנתונים יופיעו כאן אוטומטית.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {episodes.map((ep) => (
        <section key={ep.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-on-navy">
              {ep.type === "short" ? "🎬" : "🎙"} {ep.title || "ללא כותרת"}
            </h2>
            <span className="text-xs text-muted-on-navy">
              {new Date(ep.created_at).toLocaleDateString("he-IL")}
            </span>
            <a href={`/episodes/${ep.id}`} className="text-xs text-accent hover:underline">
              לדף הפרק ←
            </a>
          </div>
          <AnalyticsPanel
            episodeId={ep.id}
            youtubeVideoId={ep.youtube_video_id}
            spotifyStats={ep.spotify_stats}
            showSpotify={ep.type !== "short"}
            onChange={() => router.refresh()}
          />
        </section>
      ))}
    </div>
  );
}
