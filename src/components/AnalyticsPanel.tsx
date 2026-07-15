// studio/src/components/AnalyticsPanel.tsx
"use client";

import { useEffect, useState } from "react";

interface YouTubeAnalytics {
  views: number;
  watchTimeMinutes: number;
  averageViewPercentage: number;
  ctr: number | null;
}

interface SpotifyStats {
  streams: number | null;
  listeners: number | null;
  starts: number | null;
  uploaded_at: string;
}

export default function AnalyticsPanel({
  episodeId,
  youtubeVideoId,
  spotifyStats,
  showSpotify = true,
  onChange,
}: {
  episodeId: string;
  youtubeVideoId: string | null;
  spotifyStats: SpotifyStats | null;
  /** Shorts are YouTube-only — hide the Spotify CSV section for them. */
  showSpotify?: boolean;
  onChange: () => void;
}) {
  const [yt, setYt] = useState<YouTubeAnalytics | null>(null);
  const [ytError, setYtError] = useState("");
  const [loadingYt, setLoadingYt] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState("");

  useEffect(() => {
    if (!youtubeVideoId) return;
    setLoadingYt(true);
    setYtError("");
    fetch(`/api/episodes/${episodeId}/youtube/analytics`)
      .then((r) => r.json())
      .then((j) => (j.error ? setYtError(j.error) : setYt(j)))
      .catch(() => setYtError("שגיאת רשת"))
      .finally(() => setLoadingYt(false));
  }, [episodeId, youtubeVideoId]);

  async function uploadCsv(file: File) {
    setCsvBusy(true);
    setCsvError("");
    try {
      const csv = await file.text();
      const res = await fetch(`/api/episodes/${episodeId}/spotify-stats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const json = await res.json();
      if (json.error) setCsvError(json.error);
      else onChange();
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-6">
      <h3 className="font-bold text-sm">אנליטיקס</h3>

      <div>
        <h4 className="font-semibold text-xs text-muted mb-2">יוטיוב</h4>
        {!youtubeVideoId && <p className="text-xs text-muted">יופיע אחרי פרסום ביוטיוב.</p>}
        {youtubeVideoId && loadingYt && <p className="text-xs text-muted">טוען…</p>}
        {youtubeVideoId && ytError && <p className="text-xs text-danger">{ytError}</p>}
        {yt && (
          <div className="grid grid-cols-4 gap-3 text-sm">
            <Stat label="צפיות" value={yt.views} />
            <Stat label="דק' צפייה" value={Math.round(yt.watchTimeMinutes)} />
            <Stat label="% צפייה ממוצע" value={`${yt.averageViewPercentage.toFixed(1)}%`} />
            <Stat label="CTR" value={yt.ctr != null ? `${yt.ctr.toFixed(1)}%` : "—"} />
          </div>
        )}
      </div>

      {showSpotify && (
      <div>
        <h4 className="font-semibold text-xs text-muted mb-2">ספוטיפיי (העלאת CSV ידנית)</h4>
        <p className="text-xs text-muted mb-2">
          הורידי CSV מהדשבורד של Spotify for Creators והעלי אותו כאן.
        </p>
        <input
          type="file"
          accept=".csv"
          disabled={csvBusy}
          onChange={(e) => e.target.files?.[0] && uploadCsv(e.target.files[0])}
          className="text-sm"
        />
        {csvError && <p className="text-xs text-danger mt-1">{csvError}</p>}
        {spotifyStats && (
          <div className="grid grid-cols-3 gap-3 text-sm mt-3">
            <Stat label="Streams" value={spotifyStats.streams ?? "—"} />
            <Stat label="Listeners" value={spotifyStats.listeners ?? "—"} />
            <Stat label="Starts" value={spotifyStats.starts ?? "—"} />
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
