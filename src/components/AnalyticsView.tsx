// studio/src/components/AnalyticsView.tsx
// "ניתוח נתוני הערוץ" — channel-level mirror of YouTube Studio's analytics:
// three tabs (סקירה כללית / תוכן / קהל) over a global period picker, every
// number fetched live via /api/analytics/report. Clicking any video opens the
// per-video drill-down at /analytics/video/[id].
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AreaChart, BarList } from "@/components/analytics/Charts";
import StatTabs from "@/components/analytics/StatTabs";
import PeriodPicker, { defaultChannelPeriod, type Period } from "@/components/analytics/PeriodPicker";
import DisabledCard from "@/components/analytics/DisabledCard";
import { useReports } from "@/components/analytics/useReports";
import { CHART, fmtDateShort, fmtDuration, fmtHours, fmtNum } from "@/components/analytics/format";
import { cumulative } from "@/lib/youtube-analytics";
import { isShortDuration } from "@/lib/youtube-channel";

type ReportRow = (string | number)[];
import {
  DEVICE_LABELS,
  GENDER_LABELS,
  STUDIO_URL,
  SUBSCRIBED_LABELS,
  TRAFFIC_LABELS,
  ageLabel,
  countryLabel,
} from "@/components/analytics/labels";

const TABS = [
  { key: "overview", label: "סקירה כללית" },
  { key: "content", label: "תוכן" },
  { key: "audience", label: "קהל" },
] as const;

export default function AnalyticsView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("overview");
  const [period, setPeriod] = useState<Period>(defaultChannelPeriod());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const router = useRouter();

  async function syncFromYouTube() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/youtube/sync", { method: "POST" });
      const json = await res.json();
      setSyncMsg(json.error ? `שגיאה: ${json.error}` : json.imported > 0 ? `יובאו ${json.imported} סרטונים ✓` : "הכל מסונכרן ✓");
      if (!json.error) router.refresh();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* header: tabs + period + sync */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`text-sm rounded-lg px-4 py-1.5 transition ${
                tab === t.key ? "bg-brand text-brand-foreground font-bold" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-card rounded-lg">
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <button
            onClick={syncFromYouTube}
            disabled={syncing}
            title="מייבא למערכת סרטונים שכבר פורסמו בערוץ"
            className="text-xs bg-card border border-border rounded-lg px-3 py-2 hover:border-primary disabled:opacity-50 transition"
          >
            {syncing ? "מסנכרן…" : "🔄 סנכרן תוכן מיוטיוב"}
          </button>
        </div>
      </div>
      {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}

      {tab === "overview" && <OverviewTab period={period} />}
      {tab === "content" && <ContentTab period={period} />}
      {tab === "audience" && <AudienceTab period={period} />}
    </div>
  );
}

/* ================= סקירה כללית ================= */

function OverviewTab({ period }: { period: Period }) {
  const { data, loading, error } = useReports(["channel_totals", "channel_series", "top_videos"], period);
  const [metric, setMetric] = useState("views");

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const t = data.channel_totals?.rows?.[0] ?? [];
  const views = Number(t[0] ?? 0);
  const minutes = Number(t[2] ?? 0);
  const subsNet = Number(t[4] ?? 0) - Number(t[5] ?? 0);
  const series = data.channel_series?.rows ?? [];

  const seriesFor = (m: string) =>
    series.map((r) =>
      m === "views" ? Number(r[1] ?? 0) : m === "watch" ? Number(r[2] ?? 0) / 60 : Number(r[3] ?? 0) - Number(r[4] ?? 0),
    );

  const top = data.top_videos?.rows ?? [];
  const meta = data.top_videos?.meta ?? {};

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="font-bold text-center">
          היו {fmtNum(views)} צפיות בערוץ בתקופה: {period.label}
        </h2>
        <StatTabs
          active={metric}
          onChange={setMetric}
          stats={[
            { key: "views", label: "צפיות", value: fmtNum(views) },
            { key: "watch", label: "זמן צפייה (שעות)", value: fmtHours(minutes) },
            { key: "subs", label: "מנויים", value: `${subsNet >= 0 ? "+" : ""}${fmtNum(subsNet)}` },
          ]}
        />
        <AreaChart
          series={[{ points: seriesFor(metric), color: CHART.primary, fill: true }]}
          xFirst={series.length ? fmtDateShort(String(series[0][0])) : ""}
          xLast={series.length ? fmtDateShort(String(series[series.length - 1][0])) : ""}
        />
      </section>

      {(() => {
        // Newest-first, split into podcast episodes vs shorts (user request):
        // the raw report is ordered by views, which reads as a jumbled date list.
        const byDateDesc = (a: ReportRow, b: ReportRow) =>
          (meta[String(b[0])]?.publishedAt ?? "").localeCompare(meta[String(a[0])]?.publishedAt ?? "");
        const episodes = top.filter((r) => !isShortDuration(meta[String(r[0])]?.durationSec ?? 0)).sort(byDateDesc);
        const shorts = top.filter((r) => isShortDuration(meta[String(r[0])]?.durationSec ?? 0)).sort(byDateDesc);
        const sections: { title: string; rows: ReportRow[] }[] = [
          { title: "פרקי פודקאסט — מהחדש לישן", rows: episodes },
          { title: "שורטס — מהחדש לישן", rows: shorts },
        ];
        return sections.map(({ title, rows }) => (
          <section key={title} className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-3">{title}</h3>
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין נתוני תוכן לתקופה הזו.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-right">
                      <th className="py-1.5 font-medium">תוכן</th>
                      <th className="py-1.5 font-medium">משך צפייה ממוצע</th>
                      <th className="py-1.5 font-medium">צפיות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const id = String(r[0]);
                      const m = meta[id];
                      return (
                        <tr key={id} className="border-t border-border">
                          <td className="py-2 pl-3">
                            <a href={`/analytics/video/${id}`} className="flex items-center gap-3 hover:text-primary">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="w-20 h-11 object-cover rounded-md shrink-0" />
                              <span className="min-w-0">
                                <span className="line-clamp-2">{m?.title ?? id}</span>
                                {m?.publishedAt && <span className="block text-xs text-muted-foreground">{fmtDateShort(m.publishedAt)}</span>}
                              </span>
                            </a>
                          </td>
                          <td className="py-2 whitespace-nowrap">
                            {fmtDuration(Number(r[4] ?? 0))}{" "}
                            <span className="text-muted-foreground text-xs">({Number(r[5] ?? 0).toFixed(1)}%)</span>
                          </td>
                          <td className="py-2 font-semibold">{fmtNum(Number(r[1] ?? 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ));
      })()}

      <DisabledCard title="זמן אמת (48 השעות האחרונות)" studioUrl={`${STUDIO_URL}`} />
    </div>
  );
}

/* ================= תוכן ================= */

function ContentTab({ period }: { period: Period }) {
  const { data, loading, error } = useReports(["channel_totals", "top_videos", "traffic_sources"], period);
  const [filter, setFilter] = useState<"all" | "videos" | "shorts">("all");

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const t = data.channel_totals?.rows?.[0] ?? [];
  const top = data.top_videos?.rows ?? [];
  const meta = data.top_videos?.meta ?? {};
  const isShort = (id: string) => (meta[id]?.durationSec ?? 9999) <= 185;
  const filtered = top.filter((r) => {
    const id = String(r[0]);
    return filter === "all" ? true : filter === "shorts" ? isShort(id) : !isShort(id);
  });

  const traffic = (data.traffic_sources?.rows ?? [])
    .map((r) => ({ label: TRAFFIC_LABELS[String(r[0])] ?? String(r[0]), value: Number(r[1] ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {(
            [
              { key: "all", label: "הכל" },
              { key: "videos", label: "סרטונים" },
              { key: "shorts", label: "סרטוני Shorts" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs rounded-full px-3 py-1.5 border transition ${
                filter === f.key ? "bg-foreground text-white border-foreground font-semibold" : "border-border text-muted-foreground hover:border-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <StatTabs
          stats={[
            { key: "views", label: "צפיות", value: fmtNum(Number(t[0] ?? 0)) },
            { key: "engaged", label: "צפיות פעילות", value: fmtNum(Number(t[1] ?? 0)) },
            { key: "likes", label: "לייקים", value: fmtNum(Number(t[6] ?? 0)) },
            { key: "subs", label: "מנויים", value: `${Number(t[4] ?? 0) - Number(t[5] ?? 0) >= 0 ? "+" : ""}${fmtNum(Number(t[4] ?? 0) - Number(t[5] ?? 0))}` },
          ]}
        />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-1">איך הצופים הגיעו לתוכן שלך</h3>
          <p className="text-xs text-muted-foreground mb-3">צפיות · {period.label}</p>
          <BarList items={traffic} />
        </section>

        <section className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-1">
            {filter === "shorts" ? "סרטוני Shorts מובילים" : "התוכן המוביל"}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">צפיות · {period.label}</p>
          <div className="flex flex-col gap-2">
            {filtered.slice(0, 8).map((r) => {
              const id = String(r[0]);
              return (
                <a key={id} href={`/analytics/video/${id}`} className="flex items-center gap-3 hover:text-primary text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="w-16 h-9 object-cover rounded shrink-0" />
                  <span className="flex-1 truncate">{meta[id]?.title ?? id}</span>
                  <span className="font-semibold shrink-0">{fmtNum(Number(r[1] ?? 0))}</span>
                </a>
              );
            })}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground">אין תוכן מהסוג הזה בתקופה.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ================= קהל ================= */

function AudienceTab({ period }: { period: Period }) {
  const { data, loading, error } = useReports(
    ["channel_series", "subscribed_status", "geography", "demographics", "devices"],
    period,
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBox msg={error} />;

  const series = data.channel_series?.rows ?? [];
  const subsCumulative = cumulative(series.map((r) => Number(r[3] ?? 0) - Number(r[4] ?? 0)));

  const subStatus = (data.subscribed_status?.rows ?? []).map((r) => ({
    label: SUBSCRIBED_LABELS[String(r[0])] ?? String(r[0]),
    value: Number(r[2] ?? 0),
    sub: "דקות צפייה",
  }));

  const geo = (data.geography?.rows ?? []).map((r) => ({
    label: countryLabel(String(r[0])),
    value: Number(r[1] ?? 0),
  }));

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
    <div className="flex flex-col gap-4">
      <section className="bg-card border border-border rounded-2xl p-5">
        <h3 className="font-bold text-sm mb-3">שינוי מצטבר במנויים · {period.label}</h3>
        <AreaChart
          series={[{ points: subsCumulative, color: CHART.primary, fill: true }]}
          xFirst={series.length ? fmtDateShort(String(series[0][0])) : ""}
          xLast={series.length ? fmtDateShort(String(series[series.length - 1][0])) : ""}
        />
      </section>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Card title="זמן צפייה של מנויים" sub={period.label}>
            <BarList items={subStatus} />
          </Card>
          <Card title="אזורים גיאוגרפיים מובילים" sub={`צפיות · ${period.label}`}>
            {geo.length ? <BarList items={geo} /> : <Empty />}
          </Card>
          <DisabledCard title="פילוח קהל: צופים חדשים / אקראיים / קבועים" studioUrl={STUDIO_URL} />
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
          <DisabledCard title="מתי הצופים שלך פעילים ב-YouTube" studioUrl={STUDIO_URL} />
        </div>
      </div>
    </div>
  );
}

/* ================= shared bits ================= */

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold text-sm mb-1">{title}</h3>
      {sub && <p className="text-xs text-muted-foreground mb-3">{sub}</p>}
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
      ⏳ טוען נתונים מיוטיוב…
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 text-sm text-destructive">
      שגיאה בשליפת הנתונים: {msg}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-muted-foreground">אין מספיק נתונים לתקופה הזו.</p>;
}
