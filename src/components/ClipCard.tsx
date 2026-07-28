"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  edit_status?: string | null;
  edit_opened_at?: string | null;
}

// External-edit sessions expire after 24h — past that the card stops polling
// and the state self-clears on the next check.
const EDITING_MAX_AGE_MS = 24 * 3600_000;
const POLL_INTERVAL_MS = 180_000;

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
  const [checking, setChecking] = useState(false);
  const router = useRouter();
  const reload = onChanged ?? (() => router.refresh());
  const videoSrc = clip.download_url ?? clip.direct_url;

  const checkForUpdate = async () => {
    const res = await fetch(`/api/reels/${clip.id}/edit/refresh`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as {
      changed?: boolean;
      cleared?: boolean;
      notFound?: boolean;
    };
    if (body.changed || body.cleared || body.notFound) reload();
    return body;
  };

  // While the clip is being edited in Submagic's own editor, poll for the
  // re-exported render (their UI never calls our webhook). Visibility-gated to
  // respect Submagic's 100 GET/hour budget; jittered first tick picks up edits
  // made while the app was closed without a thundering herd on page load.
  useEffect(() => {
    if (clip.edit_status !== "editing") return;
    const opened = clip.edit_opened_at ? Date.parse(clip.edit_opened_at) : Date.now();
    if (Date.now() - opened > EDITING_MAX_AGE_MS) return;
    const tick = () => {
      if (document.hidden) return;
      void fetch(`/api/reels/${clip.id}/edit/refresh`, { method: "POST" })
        .then((r) => r.json())
        .then((body: { changed?: boolean; cleared?: boolean; notFound?: boolean }) => {
          if (body.changed || body.cleared || body.notFound) reload();
        })
        .catch(() => {});
    };
    const first = setTimeout(tick, 2000 + Math.random() * 10_000);
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.edit_status, clip.edit_opened_at, clip.id]);

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
        <Link href={`/reels/${clip.id}`} className="underline">
          ✏️ עריכה
        </Link>
        <a
          href={`https://app.submagic.co/v/${clip.id}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
          onClick={() => {
            // Mark as externally-edited so the card starts polling for the
            // re-exported render; the new tab opens regardless.
            void fetch(`/api/reels/${clip.id}/edit/open`, { method: "POST" }).then(() => reload());
          }}
        >
          🪄 עריכה ב-Submagic
        </a>
        {clip.download_url && (
          <a href={clip.download_url} target="_blank" rel="noreferrer" className="underline">
            ⬇️ הורדה
          </a>
        )}
        {clip.edit_status === "exporting" && (
          <span className="text-xs text-muted-foreground">מרנדר מחדש…</span>
        )}
        {clip.edit_status === "editing" && (
          <>
            <span className="text-xs font-medium rounded-full px-2 py-1 bg-accent/20">
              נערך ב-Submagic…
            </span>
            <button
              onClick={() => {
                setChecking(true);
                void checkForUpdate().finally(() => setChecking(false));
              }}
              disabled={checking}
              className="text-xs underline disabled:opacity-50"
              title="בדיקה מיידית אם נשמרה גרסה חדשה ב-Submagic"
            >
              {checking ? "בודק…" : "בדקי עדכון"}
            </button>
          </>
        )}
        {clip.edit_status === "exported" && (
          <span className="text-xs font-medium rounded-full px-2 py-1 bg-green-600/15 text-green-700">
            עודכן ✓
          </span>
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
