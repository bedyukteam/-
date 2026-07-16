// studio/src/components/PublishPanel.tsx
"use client";

import { useState } from "react";

export default function PublishPanel({
  episodeId,
  locked,
  hasVideo,
  youtubeStatus,
  youtubeVideoId,
  youtubeError,
  uploadedBytes,
  totalBytes,
  onChange,
}: {
  episodeId: string;
  locked: boolean;
  hasVideo: boolean;
  youtubeStatus: string | null;
  youtubeVideoId: string | null;
  youtubeError: string | null;
  uploadedBytes: number;
  totalBytes: number;
  onChange: () => void;
}) {
  const [publishAt, setPublishAt] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish(publishAtIso: string | null) {
    setBusy(true);
    try {
      let done = false;
      while (!done) {
        const res = await fetch(`/api/episodes/${episodeId}/youtube/upload-chunk`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ publishAt: publishAtIso }),
        });
        const json: { done?: boolean; error?: string } = await res.json().catch(() => ({ error: "שגיאת רשת" }));
        onChange();
        if (json.error) break;
        done = !!json.done;
      }
    } finally {
      setBusy(false);
    }
  }

  if (!hasVideo) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
        פרסום ליוטיוב זמין רק לפרקים שהועלו כווידאו מלא.
      </div>
    );
  }

  const progress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
  const isLive = youtubeStatus === "published" || youtubeStatus === "scheduled";

  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
      <h3 className="font-bold text-sm">פרסום ליוטיוב</h3>

      {locked && <p className="text-xs text-muted-foreground">נעול עד שכל האישורים הנדרשים למעלה יושלמו.</p>}

      {!locked && isLive && youtubeVideoId && (
        <div className="text-sm">
          <span className="text-success font-medium">
            ✓ {youtubeStatus === "scheduled" ? "מתוזמן" : "פורסם"}
          </span>{" "}
          —{" "}
          <a
            href={`https://youtube.com/watch?v=${youtubeVideoId}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            פתיחה ביוטיוב
          </a>{" "}
          ·{" "}
          <a href={`/analytics/video/${youtubeVideoId}`} className="text-primary underline">
            📊 אנליטיקס
          </a>
        </div>
      )}

      {!locked && youtubeStatus === "error" && <p className="text-xs text-destructive">שגיאה: {youtubeError}</p>}

      {!locked && !isLive && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">תזמון (אופציונלי — ריק = פרסום מיידי)</span>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              dir="ltr"
              className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm w-fit"
            />
          </label>

          {youtubeStatus === "uploading" && (
            <div className="w-full bg-border rounded-full h-2">
              <div className="bg-brand h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          {youtubeStatus === "uploading" ? (
            <button
              onClick={() => publish(publishAt ? new Date(publishAt).toISOString() : null)}
              disabled={busy}
              className="self-start bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? `מעלה… ${progress}%` : "המשך העלאה"}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => publish(null)}
                disabled={busy}
                className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {busy ? `מעלה… ${progress}%` : "פרסם"}
              </button>
              <button
                onClick={() => publish(new Date(publishAt).toISOString())}
                disabled={busy || !publishAt}
                title={publishAt ? "" : "בחרי תאריך ושעה כדי לתזמן"}
                className="border border-border rounded-lg px-5 py-2.5 font-semibold hover:border-primary disabled:opacity-50 transition"
              >
                תזמן
              </button>
              <span className="text-xs text-muted-foreground">פרסם = עולה מיד בגלוי לכולם · תזמן = לפי התאריך שנבחר</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
