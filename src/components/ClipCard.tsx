"use client";

import { useState } from "react";
import Link from "next/link";

export interface ClipCardData {
  id: string;
  title: string | null;
  duration_sec: number | null;
  virality_total: number | null;
  preview_url: string | null;
  download_url: string | null;
  direct_url: string | null;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One reel card, shared by the episode panel and the /reels inbox.
 * "צפייה" plays the clip inline (download_url serves a direct mp4) —
 * no download or external tab needed.
 */
export default function ClipCard({
  clip,
  episodeHref,
  episodeTitle,
}: {
  clip: ClipCardData;
  episodeHref?: string;
  episodeTitle?: string;
}) {
  const [playing, setPlaying] = useState(false);
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
      <span className="text-xs text-muted-foreground">{fmtDuration(clip.duration_sec)}</span>

      {playing && videoSrc && (
        <video
          src={videoSrc}
          controls
          autoPlay
          playsInline
          className="w-full max-h-[70vh] rounded-xl bg-black"
        />
      )}

      <div className="flex gap-3 text-sm mt-auto pt-2">
        {videoSrc && (
          <button onClick={() => setPlaying((p) => !p)} className="underline">
            {playing ? "סגור נגן" : "▶️ צפייה"}
          </button>
        )}
        {clip.download_url && (
          <a href={clip.download_url} target="_blank" rel="noreferrer" className="underline">
            ⬇️ הורדה
          </a>
        )}
        {clip.direct_url && (
          <a
            href={clip.direct_url}
            target="_blank"
            rel="noreferrer"
            className="underline text-muted-foreground"
          >
            פתיחה ב-Submagic
          </a>
        )}
      </div>
    </li>
  );
}
