"use client";

import { useState } from "react";
import Link from "next/link";
import ReelPublishSheet from "@/components/ReelPublishSheet";

export interface ClipCardData {
  id: string;
  title: string | null;
  duration_sec: number | null;
  virality_total: number | null;
  preview_url: string | null;
  download_url: string | null;
  direct_url: string | null;
  yt_title?: string | null;
  yt_description?: string | null;
  yt_video_id?: string | null;
  yt_status?: string | null;
  yt_error?: string | null;
  yt_publish_at?: string | null;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function YtBadge({ clip }: { clip: ClipCardData }) {
  if (clip.yt_status === "published")
    return (
      <a
        href={`https://youtube.com/shorts/${clip.yt_video_id}`}
        target="_blank"
        rel="noreferrer"
        className="text-xs font-medium rounded-full px-2 py-1 bg-green-600/15 text-green-700 underline"
      >
        פורסם ביוטיוב ✓
      </a>
    );
  if (clip.yt_status === "scheduled")
    return (
      <span
        className="text-xs font-medium rounded-full px-2 py-1 bg-accent/20"
        title={clip.yt_publish_at ?? undefined}
      >
        מתוזמן 🕒
      </span>
    );
  if (clip.yt_status === "uploading")
    return <span className="text-xs font-medium rounded-full px-2 py-1 bg-accent/20">מעלה…</span>;
  if (clip.yt_status === "error")
    return (
      <span
        className="text-xs font-medium rounded-full px-2 py-1 bg-red-600/15 text-danger"
        title={clip.yt_error ?? undefined}
      >
        שגיאת פרסום
      </span>
    );
  return null;
}

/**
 * One reel card, shared by the episode panel and the /reels inbox.
 * The player is always visible — press play to watch; the publish button opens
 * the metadata+publish drawer (ReelPublishSheet).
 */
export default function ClipCard({
  clip,
  episodeId,
  episodeHref,
  episodeTitle,
  onChanged,
}: {
  clip: ClipCardData;
  episodeId?: string;
  episodeHref?: string;
  episodeTitle?: string;
  onChanged?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const videoSrc = clip.download_url ?? clip.direct_url;

  return (
    <li className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-sm">{clip.title ?? "קליפ"}</span>
        {clip.virality_total != null && (
          <span
            className="shrink-0 text-xs font-bold rounded-full px-2 py-1 bg-accent/20"
            title="ציון ויראליות"
          >
            🔥 {Math.round(clip.virality_total)}
          </span>
        )}
      </div>

      {episodeHref && (
        <Link href={episodeHref} className="text-xs text-muted-foreground underline truncate">
          מתוך: {episodeTitle ?? "פרק"}
        </Link>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{fmtDuration(clip.duration_sec)}</span>
        <YtBadge clip={clip} />
      </div>

      {videoSrc && (
        <video
          // #t=0.1 makes browsers render the first video frame as the preview
          // while preload="metadata" still avoids downloading the whole file.
          src={`${videoSrc}#t=0.1`}
          controls
          preload="metadata"
          playsInline
          className="w-full rounded-xl bg-black aspect-[9/16] object-contain"
        />
      )}

      <div className="flex items-center gap-3 text-sm mt-auto pt-2 flex-wrap">
        <button
          onClick={() => setSheetOpen(true)}
          className="bg-accent text-accent-foreground rounded-lg px-3 py-1.5 text-sm font-semibold hover:opacity-90"
        >
          {clip.yt_video_id ? "פרטי פרסום" : "🚀 פרסום ליוטיוב"}
        </button>
        {clip.download_url && (
          <a href={clip.download_url} target="_blank" rel="noreferrer" className="underline">
            ⬇️ הורדה
          </a>
        )}
      </div>

      <ReelPublishSheet
        clip={clip}
        episodeId={episodeId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onChanged={onChanged}
      />
    </li>
  );
}
