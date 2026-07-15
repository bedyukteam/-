// studio/src/components/AnalyticsView.tsx
// "אנליטיקס" — mirrors YouTube Studio's channel overview (totals, daily views
// chart, top content) plus per-episode panels and a one-click sync that imports
// already-published channel videos into the system.
"use client";

import { useCallback, useEffect, useState } from "react";
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

interface ChannelData {
  days: number;
  channelTitle: string;
  subscriberCount: number;
  totals: {
    views: number;
    watchTimeMinutes: number;
    subsGained: number;
    subsLost: number;
    averageViewDurationSec: number;
  };
  series: { date: string; views: number }[];
  topVideos: {
    videoId: string;
    title: string;
    views: number;
    averageViewDurationSec: number;
    averageViewPercentage: number;
    ctr: number | null;
  }[];
}

const PERIODS = [
  { days: 7, label: "7 ימים" },
  { days: 28, label: "28 ימים" },
  { days: 90, label: "90 ימים" },
];

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AnalyticsView({ episodes }: { episodes: AnalyticsEpisode[] }) {
  const router = useRouter();
  const [days, setDays] = useState(28);
  const [data, setData] = useState<ChannelData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const loadChannel = useCallback(async (d: number) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/analytics/channel?days=${d}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch {
      setError("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the effect body itself doesn't set state synchronously
    // (react-hooks/set-state-in-effect); cancelled on rapid period switches.
    const t = setTimeout(() => void loadChannel(days), 0);
    return () => clearTimeout(t);
  }, [days, loadChannel]);

  async function syncFromYouTube() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/youtube/sync", { method: "POST" });
      const json = await res.json();
      if (json.error) setSyncMsg(`שגיאה: ${json.error}`);
      else {
        setSyncMsg(
          json.imported > 0
            ? `יובאו ${json.imported} סרטונים חדשים מהערוץ ✓`
            : "הכל כבר מסונכרן ✓",
        );
        router.refresh();
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* ---- channel overview (mirror of Studio) ---- */}
      <section className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold">
            סקירת הערוץ{data ? ` — ${data.channelTitle}` : ""}
          </h2>
          <div className="flex items-center gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`text-xs rounded-full px-3 py-1.5 border transition ${
                  days === p.days
                    ? "bg-accent text-accent-foreground border-accent font-semibold"
                    : "border-border text-muted hover:border-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={syncFromYouTube}
              disabled={syncing}
              className="text-xs border border-border rounded-full px-3 py-1.5 hover:border-accent disabled:opacity-50 transition"
              title="מייבא למערכת סרטונים שכבר פורסמו בערוץ"
            >
              {syncing ? "מסנכרן…" : "🔄 סנכרן תוכן מיוטיוב"}
            </button>
          </div>
        </div>
        {syncMsg && <p className="text-xs text-muted">{syncMsg}</p>}

        {loading && <p className="text-sm text-muted">טוען נתוני ערוץ…</p>}
        {!loading && error && <p className="text-sm text-danger">{error}</p>}

        {!loading && data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label={`צפיות · ${days} ימים`} value={data.totals.views.toLocaleString()} />
              <Stat
                label="זמן צפייה (שעות)"
                value={(data.totals.watchTimeMinutes / 60).toFixed(1)}
              />
              <Stat
                label="שינוי מנויים בתקופה"
                value={`${data.totals.subsGained - data.totals.subsLost >= 0 ? "+" : ""}${
                  data.totals.subsGained - data.totals.subsLost
                }`}
              />
              <Stat label="סה״כ מנויים" value={data.subscriberCount.toLocaleString()} />
            </div>

            <ViewsChart series={data.series} />

            <div>
              <h3 className="font-semibold text-sm mb-2">התוכן המוביל בתקופה</h3>
              {data.topVideos.length === 0 ? (
                <p className="text-xs text-muted">אין עדיין נתוני תוכן לתקופה הזו.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted text-right">
                        <th className="py-1.5 font-medium">תוכן</th>
                        <th className="py-1.5 font-medium">משך צפייה ממוצע</th>
                        <th className="py-1.5 font-medium">CTR</th>
                        <th className="py-1.5 font-medium">צפיות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topVideos.map((v) => (
                        <tr key={v.videoId} className="border-t border-border">
                          <td className="py-2 pl-3">
                            <a
                              href={`https://youtube.com/watch?v=${v.videoId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-3 hover:text-accent"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}
                                alt=""
                                className="w-20 h-11 object-cover rounded-md shrink-0"
                              />
                              <span className="line-clamp-2">{v.title}</span>
                            </a>
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {fmtDuration(v.averageViewDurationSec)}{" "}
                            <span className="text-muted text-xs">
                              ({v.averageViewPercentage.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {v.ctr != null ? `${v.ctr.toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-2 font-semibold">{v.views.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---- per-episode panels (system episodes) ---- */}
      <div>
        <h2 className="font-bold text-on-navy mb-1">פירוט לפי פרק</h2>
        <p className="text-muted-on-navy text-xs mb-4">
          פרקים ושורטים שבמערכת — כולל העלאת CSV של ספוטיפיי לפודקאסטים.
        </p>
        {episodes.length === 0 ? (
          <p className="text-muted text-sm bg-surface border border-border rounded-2xl p-6">
            עדיין אין פרקים במערכת. אפשר לייבא את התוכן הקיים עם ״סנכרן תוכן מיוטיוב״ למעלה.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {episodes.map((ep) => (
              <section key={ep.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-on-navy">
                    {ep.type === "short" ? "🎬" : "🎙"} {ep.title || "ללא כותרת"}
                  </h3>
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
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-extrabold">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/** Simple daily-views area chart (matches the Studio overview graph). */
function ViewsChart({ series }: { series: { date: string; views: number }[] }) {
  if (series.length < 2) return null;
  const W = 600;
  const H = 140;
  const max = Math.max(...series.map((p) => p.views), 1);
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 10);
  const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join(" ");
  const first = series[0].date;
  const last = series[series.length - 1].date;
  const fmt = (d: string) => new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
  return (
    <div dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-36 text-accent"
        role="img"
        aria-label="גרף צפיות יומי"
      >
        <polygon points={`0,${H} ${line} ${W},${H}`} fill="currentColor" opacity="0.15" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted mt-1">
        <span>{fmt(first)}</span>
        <span>מקס׳ יומי: {max.toLocaleString()}</span>
        <span>{fmt(last)}</span>
      </div>
    </div>
  );
}
