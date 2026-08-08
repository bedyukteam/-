// studio/src/components/PublishPanel.tsx
"use client";

import { useState } from "react";

export default function PublishPanel({
  episodeId,
  locked,
  hasVideo,
  hasAudio = false,
  spotifyPublishedAt = null,
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
  /** Episode has a podcast-quality MP3 (episodes.audio_key) — enables Spotify. */
  hasAudio?: boolean;
  spotifyPublishedAt?: string | null;
  youtubeStatus: string | null;
  youtubeVideoId: string | null;
  youtubeError: string | null;
  uploadedBytes: number;
  totalBytes: number;
  onChange: () => void;
}) {
  const [publishAt, setPublishAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [podcastAt, setPodcastAt] = useState("");
  const [podcastBusy, setPodcastBusy] = useState(false);
  const [podcastErr, setPodcastErr] = useState<string | null>(null);

  async function setPodcastPublish(publishAtIso: string | null, remove = false) {
    setPodcastBusy(true);
    setPodcastErr(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/podcast`, {
        method: remove ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: remove ? undefined : JSON.stringify({ publishAt: publishAtIso }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error) setPodcastErr(body.error);
    } finally {
      setPodcastBusy(false);
      onChange();
    }
  }

  async function startDrive(publishAtIso: string | null) {
    const res = await fetch(`/api/episodes/${episodeId}/youtube/drive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishAt: publishAtIso }),
    });
    return !((await res.json().catch(() => ({}))) as { error?: string }).error;
  }

  async function publish(publishAtIso: string | null) {
    setBusy(true);
    try {
      // The server drives the whole upload (closing this tab no longer stalls
      // it) — we only poll for progress, and re-kick the driver if the byte
      // count stops moving (e.g. the server restarted mid-upload).
      if (!(await startDrive(publishAtIso))) return;
      let lastBytes = -1;
      let stalledPolls = 0;
      for (let i = 0; i < 2000; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        onChange();
        const res = await fetch(`/api/episodes/${episodeId}/publish-state`).catch(() => null);
        const st = ((await res?.json().catch(() => null)) ?? {}) as {
          youtube_status?: string | null;
          youtube_uploaded_bytes?: number;
        };
        if (
          st.youtube_status === "published" ||
          st.youtube_status === "scheduled" ||
          st.youtube_status === "error"
        )
          break;
        const bytes = st.youtube_uploaded_bytes ?? 0;
        stalledPolls = bytes === lastBytes ? stalledPolls + 1 : 0;
        lastBytes = bytes;
        if (stalledPolls >= 20) {
          // ~80s with no movement — the driver likely died (server restart);
          // kick it again, the resumable session continues from the DB offset.
          stalledPolls = 0;
          await startDrive(publishAtIso);
        }
      }
    } finally {
      setBusy(false);
      onChange();
    }
  }

  const progress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
  const isLive = youtubeStatus === "published" || youtubeStatus === "scheduled";

  const podcastSection = (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
      <h3 className="font-bold text-sm">פרסום לספוטיפיי (פודקאסט)</h3>

      {!hasAudio ? (
        <p className="text-sm text-muted-foreground">
          זמין אחרי שנוצר קובץ אודיו לפרק (קורה אוטומטית בעיבוד פרק וידאו/אודיו).
        </p>
      ) : locked ? (
        <p className="text-xs text-muted-foreground">נעול עד שכל האישורים הנדרשים למעלה יושלמו.</p>
      ) : spotifyPublishedAt ? (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-success font-medium">
            ✓ בפיד הפודקאסט מאז{" "}
            {new Date(spotifyPublishedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <span className="text-xs text-muted-foreground">
            ספוטיפיי מושך את הפיד כל ~שעתיים
          </span>
          <button
            onClick={() => setPodcastPublish(null, true)}
            disabled={podcastBusy}
            className="text-xs underline text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            הסרה מהפיד
          </button>
        </div>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">תאריך פרסום (ריק = עכשיו; אפשר גם תאריך עבר לפרקי ארכיון)</span>
            <input
              type="datetime-local"
              value={podcastAt}
              onChange={(e) => setPodcastAt(e.target.value)}
              dir="ltr"
              className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm w-fit"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                setPodcastPublish(podcastAt ? new Date(podcastAt).toISOString() : null)
              }
              disabled={podcastBusy}
              className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
            >
              {podcastBusy ? "מפרסם…" : "פרסם לפיד"}
            </button>
            <span className="text-xs text-muted-foreground">
              הפרק ייכנס לפיד ה-RSS ויופיע בספוטיפיי (ואפל) אוטומטית
            </span>
          </div>
          {podcastErr && <p className="text-xs text-destructive">שגיאה: {podcastErr}</p>}
        </>
      )}
    </div>
  );

  if (!hasVideo) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
          פרסום ליוטיוב זמין רק לפרקים שהועלו כווידאו מלא.
        </div>
        {podcastSection}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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
    {podcastSection}
    </div>
  );
}
