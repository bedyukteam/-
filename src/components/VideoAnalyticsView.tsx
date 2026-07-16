// studio/src/components/VideoAnalyticsView.tsx
// Per-video analytics drill-down mirroring YouTube Studio's video screens:
// סקירה כללית / היקף החשיפה / מעורבות הצופים / קהל, over a since-publish
// period picker. Opened by clicking any video in the channel dashboard.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AreaChart, BarList, Donut, RetentionChart } from "@/components/analytics/Charts";
import StatTabs from "@/components/analytics/StatTabs";
import PeriodPicker, { sincePublishPeriod, type Period } from "@/components/analytics/PeriodPicker";
import DisabledCard from "@/components/analytics/DisabledCard";
import { useReports } from "@/components/analytics/useReports";
import { CHART, fmtDateShort, fmtDuration, fmtHours, fmtNum } from "@/components/analytics/format";
import {
  DEVICE_LABELS,
  GENDER_LABELS,
  SUBSCRIBED_LABELS,
  TRAFFIC_LABELS,
  ageLabel,
  countryLabel,
  studioVideoUrl,
} from "@/components/analytics/labels";
import { cumulative } from "@/lib/youtube-analytics";
import type { VideoMeta } from "@/lib/youtube-channel";

interface EpisodeLink {
  id: string;
  type: string;
  spotifyStats: { streams: number | null; listeners: number | null; starts: number | null; uploaded_at: string } | null;
}

const TABS = [
  { key: "overview", label: "סקירה כללית" },
  { key: "reach", label: "היקף החשיפה" },
  { key: "engagement", label: "מעורבות הצופים" },
  { key: "audience", label: "קהל" },
] as const;

export default function VideoAnalyticsView({
  videoId,
  meta,
  episode,
}: {
  videoId: string;
  meta: VideoMeta;
  episode: EpisodeLink | null;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  const [period, setPeriod] = useState<Period>(sincePublishPeriod(meta.publishedAt));

  return (
    <div className="flex flex-col gap-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="w-28 h-16 object-cover rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <a href="/analytics" className="text-xs text-muted-on-navy hover:text-accent">← ניתוח נתוני הערוץ</a>
          <h1 className="text-lg font-extrabold text-on-navy line-clamp-2">{meta.title}</h1>
          <p className="text-xs text-muted-on-navy">
            {fmtDuration(meta.durationSec)} · פורסם {fmtDateShort(meta.publishedAt)}
            {episode && (
              <>
                {" · "}
                <a href={`/episodes/${episode.id}`} className="text-accent hover:underline">לדף הפרק ←</a>
              </>
            )}
          </p>
        </div>
        <div className="bg-surface rounded-lg">
          <PeriodPicker value={period} onChange={setPeriod} publishedAt={meta.publishedAt} />
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 self-start">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-sm rounded-lg px-4 py-1.5 transition ${
              tab === t.key ? "bg-accent text-accent-foreground font-bold" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab videoId={videoId} meta={meta} period={period} />}
      {tab === "reach" && <ReachTab videoId={videoId} period={period} />}
      {tab === "engagement" && <EngagementTab videoId={videoId} meta={meta} period={period} />}
      {tab === "audience" && <AudienceTab videoId={videoId} period={period} episode={episode} />}
    </div>
  );
}

/* ================= סקירה כללית ================= */

function OverviewTab({ videoId, meta, period }: { videoId: string; meta: VideoMeta; period: Period }) {
  const { data, loading, error } = useReports(
    ["video_totals", "video_series", "retention", "typical_performance"],
    period,
    videoId,
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const t = data.video_totals?.rows?.[0] ?? [];
  const views = Number(t[0] ?? 0);
  const engaged = Number(t[1] ?? 0);
  const avgDur = Number(t[3] ?? 0);
  const daily = (data.video_series?.rows ?? []).map((r) => Number(r[1] ?? 0));
  const cum = cumulative(daily);
  const typical = (data.typical_performance?.median ?? []).slice(0, Math.max(cum.length, 2));
  const vsTypical = typical.length && cum.length && typical[Math.min(cum.length, typical.length) - 1] > 0
    ? cum[cum.length - 1] / typical[Math.min(cum.length, typical.length) - 1]
    : null;
  const retention = (data.retention?.rows ?? []).map((r) => ({ x: Number(r[0]), y: Number(r[1]) }));
  const stayedPct = views > 0 ? (engaged / views) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
        <h2 className="font-bold text-center">
          {vsTypical && vsTypical > 1
            ? `מעולה! מספר הצפיות גבוה פי ${vsTypical.toFixed(1)} מהביצועים האופייניים של הערוץ.`
            : `לסרטון ${fmtNum(views)} צפיות בתקופה: ${period.label}`}
        </h2>
        <StatTabs stats={[{ key: "views", label: "צפיות", value: fmtNum(views) }]} />
        <AreaChart
          series={[
            { points: cum, color: CHART.primary, fill: true },
            { points: typical, color: CHART.muted, dashed: true },
          ]}
          xFirst="0"
          xLast={`${cum.length} ימים`}
        />
        <p className="text-[11px] text-muted">
          ▬ הסרטון הזה · <span style={{ color: CHART.muted }}>◌ ביצועים אופייניים</span> (חציון מחושב של סרטונים
          דומים בערוץ — קירוב, לא נתון רשמי של יוטיוב)
        </p>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
        <h3 className="font-bold text-sm">רגעים משמעותיים של שימור קהל</h3>
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div>
            <p className="text-2xl font-extrabold">{stayedPct.toFixed(1)}%</p>
            <p className="text-xs text-muted">המשיכו לצפות (קירוב)</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold">{fmtDuration(avgDur)}</p>
            <p className="text-xs text-muted">משך צפייה ממוצע</p>
          </div>
        </div>
        <RetentionChart points={retention} durationSec={meta.durationSec} />
      </section>
    </div>
  );
}

/* ================= היקף החשיפה ================= */

function ReachTab({ videoId, period }: { videoId: string; period: Period }) {
  const { data, loading, error } = useReports(
    ["video_totals", "video_series", "traffic_sources", "search_terms"],
    period,
    videoId,
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const views = Number(data.video_totals?.rows?.[0]?.[0] ?? 0);
  const daily = (data.video_series?.rows ?? []).map((r) => Number(r[1] ?? 0));
  const traffic = (data.traffic_sources?.rows ?? [])
    .map((r) => ({ label: TRAFFIC_LABELS[String(r[0])] ?? String(r[0]), value: Number(r[1] ?? 0) }))
    .sort((a, b) => b.value - a.value);
  const terms = (data.search_terms?.rows ?? []).map((r) => ({ label: String(r[0]), value: Number(r[1] ?? 0) }));

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
        <StatTabs stats={[{ key: "views", label: "צפיות", value: fmtNum(views) }]} />
        <AreaChart series={[{ points: cumulative(daily), color: CHART.primary, fill: true }]} xFirst="0" xLast={`${daily.length} ימים`} />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="bg-surface border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-1">איך הצופים מגיעים לסרטון הזה</h3>
          <p className="text-xs text-muted mb-3">צפיות · {period.label}</p>
          <div className="flex items-center gap-5">
            <Donut items={traffic.slice(0, 6)} />
            <div className="flex-1 min-w-0">
              <BarList items={traffic.slice(0, 6)} />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-border rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-1">מונחי חיפוש ב-YouTube</h3>
            <p className="text-xs text-muted mb-3">צפיות · {period.label}</p>
            {terms.length ? <BarList items={terms.slice(0, 8)} /> : <p className="text-xs text-muted">אין עדיין תנועה מחיפוש.</p>}
          </section>
          <DisabledCard title="התראות שנשלחו + חשיפות (Impressions/CTR)" studioUrl={studioVideoUrl(videoId)} />
        </div>
      </div>
    </div>
  );
}

/* ================= מעורבות הצופים ================= */

function EngagementTab({ videoId, meta, period }: { videoId: string; meta: VideoMeta; period: Period }) {
  const { data, loading, error } = useReports(["video_totals", "retention"], period, videoId);
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const t = data.video_totals?.rows?.[0] ?? [];
  const retention = (data.retention?.rows ?? []).map((r) => ({ x: Number(r[0]), y: Number(r[1]) }));

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface border border-border rounded-2xl p-5">
        <StatTabs
          stats={[
            { key: "engaged", label: "צפיות פעילות", value: fmtNum(Number(t[1] ?? 0)) },
            { key: "watch", label: "זמן צפייה (שעות)", value: fmtHours(Number(t[2] ?? 0)) },
            { key: "avg", label: "משך צפייה ממוצע", value: fmtDuration(Number(t[3] ?? 0)) },
            { key: "likes", label: "לייקים", value: fmtNum(Number(t[6] ?? 0)) },
            { key: "comments", label: "תגובות", value: fmtNum(Number(t[7] ?? 0)) },
            { key: "shares", label: "שיתופים", value: fmtNum(Number(t[8] ?? 0)) },
          ]}
        />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="bg-surface border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-3">שימור קהל</h3>
          <RetentionChart points={retention} durationSec={meta.durationSec} />
        </section>
        <div className="flex flex-col gap-4">
          <section className="bg-surface border border-border rounded-2xl p-3">
            <div className="aspect-video rounded-xl overflow-hidden">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                title={meta.title}
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </section>
          <DisabledCard title="שיעור קליקים על רכיב במסך הסיום · רמיקסים" studioUrl={studioVideoUrl(videoId)} />
        </div>
      </div>
    </div>
  );
}

/* ================= קהל ================= */

function AudienceTab({ videoId, period, episode }: { videoId: string; period: Period; episode: EpisodeLink | null }) {
  const { data, loading, error } = useReports(
    ["subscribed_status", "geography", "demographics", "devices"],
    period,
    videoId,
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const subStatus = (data.subscribed_status?.rows ?? []).map((r) => ({
    label: SUBSCRIBED_LABELS[String(r[0])] ?? String(r[0]),
    value: Number(r[2] ?? 0),
    sub: "דקות צפייה",
  }));
  const geo = (data.geography?.rows ?? []).map((r) => ({ label: countryLabel(String(r[0])), value: Number(r[1] ?? 0) }));
  const demo = data.demographics?.rows ?? [];
  const byAge = new Map<string, number>();
  const byGender = new Map<string, number>();
  for (const r of demo) {
    byAge.set(String(r[0]), (byAge.get(String(r[0])) ?? 0) + Number(r[2] ?? 0));
    byGender.set(String(r[1]), (byGender.get(String(r[1])) ?? 0) + Number(r[2] ?? 0));
  }
  const ages = [...byAge.entries()].sort().map(([k, v]) => ({ label: ageLabel(k), value: v }));
  const genders = [...byGender.entries()].map(([k, v]) => ({ label: GENDER_LABELS[k] ?? k, value: v }));
  const devices = (data.devices?.rows ?? [])
    .map((r) => ({ label: DEVICE_LABELS[String(r[0])] ?? String(r[0]), value: Number(r[2] ?? 0), sub: "דקות צפייה" }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      <div className="flex flex-col gap-4">
        <Card title="זמן צפייה לפי מנוי" sub={period.label}>
          {subStatus.length ? <BarList items={subStatus} /> : <Empty />}
        </Card>
        <Card title="אזורים גיאוגרפיים מובילים" sub={`צפיות · ${period.label}`}>
          {geo.length ? <BarList items={geo} /> : <Empty />}
        </Card>
        <DisabledCard title="פילוח קהל: צופים חדשים / אקראיים / קבועים" studioUrl={studioVideoUrl(videoId)} />
      </div>
      <div className="flex flex-col gap-4">
        <Card title="גיל" sub={`אחוז צפיות · ${period.label}`}>
          {ages.length ? <BarList items={ages} valueFmt={(v) => `${v.toFixed(1)}%`} /> : <Empty />}
        </Card>
        <Card title="מגדר" sub={`אחוז צפיות · ${period.label}`}>
          {genders.length ? <BarList items={genders} valueFmt={(v) => `${v.toFixed(1)}%`} /> : <Empty />}
        </Card>
        <Card title="סוג מכשיר" sub={`זמן צפייה · ${period.label}`}>
          {devices.length ? <BarList items={devices} /> : <Empty />}
        </Card>
        {episode && episode.type !== "short" && <SpotifyCard episode={episode} />}
      </div>
    </div>
  );
}

/* ================= Spotify (linked podcast episodes) ================= */

function SpotifyCard({ episode }: { episode: EpisodeLink }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const s = episode.spotifyStats;

  async function uploadCsv(file: File) {
    setBusy(true);
    setErr("");
    try {
      const csv = await file.text();
      const res = await fetch(`/api/episodes/${episode.id}/spotify-stats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const json = await res.json();
      if (json.error) setErr(json.error);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="ספוטיפיי (העלאת CSV ידנית)" sub="אין API ציבורי לספוטיפיי — הורידי CSV מ-Spotify for Creators">
      <input
        type="file"
        accept=".csv"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && uploadCsv(e.target.files[0])}
        className="text-sm"
      />
      {err && <p className="text-xs text-danger mt-1">{err}</p>}
      {s && (
        <div className="grid grid-cols-3 gap-3 text-sm mt-3">
          <div><p className="text-lg font-bold">{s.streams ?? "—"}</p><p className="text-xs text-muted">Streams</p></div>
          <div><p className="text-lg font-bold">{s.listeners ?? "—"}</p><p className="text-xs text-muted">Listeners</p></div>
          <div><p className="text-lg font-bold">{s.starts ?? "—"}</p><p className="text-xs text-muted">Starts</p></div>
        </div>
      )}
    </Card>
  );
}

/* ================= shared bits ================= */

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-5">
      <h3 className="font-bold text-sm mb-1">{title}</h3>
      {sub && <p className="text-xs text-muted mb-3">{sub}</p>}
      {children}
    </section>
  );
}

function Loading() {
  return <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-muted">⏳ טוען נתונים מיוטיוב…</div>;
}

function ErrorBox({ msg }: { msg: string }) {
  return <div className="bg-surface border border-border rounded-2xl p-6 text-sm text-danger">שגיאה בשליפת הנתונים: {msg}</div>;
}

function Empty() {
  return <p className="text-xs text-muted">אין מספיק נתונים לתקופה הזו.</p>;
}
