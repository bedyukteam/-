// studio/src/lib/youtube-analytics.ts
// YouTube Analytics API v2 — single-video report (views/watch time/retention/CTR).

const REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";

const METRICS = ["views", "estimatedMinutesWatched", "averageViewPercentage", "impressionsClickThroughRate"];

export function buildAnalyticsUrl(videoId: string): string {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: "2020-01-01", // channel launch date is unknown to us — wide enough to cover any video
    endDate: new Date().toISOString().slice(0, 10),
    metrics: METRICS.join(","),
    filters: `video==${videoId}`,
  });
  return `${REPORTS_URL}?${params.toString()}`;
}

export interface VideoAnalytics {
  views: number;
  watchTimeMinutes: number;
  averageViewPercentage: number;
  /**
   * impressionsClickThroughRate — YouTube only starts reporting this once a
   * video has enough impressions; null (not 0) means "not enough data yet",
   * distinct from a genuine 0% CTR.
   */
  ctr: number | null;
}

export function parseAnalyticsResponse(json: { rows?: number[][] }): VideoAnalytics {
  const row = json.rows?.[0];
  return {
    views: row?.[0] ?? 0,
    watchTimeMinutes: row?.[1] ?? 0,
    averageViewPercentage: row?.[2] ?? 0,
    ctr: row?.[3] ?? null,
  };
}

export async function fetchVideoAnalytics(accessToken: string, videoId: string): Promise<VideoAnalytics> {
  const res = await fetch(buildAnalyticsUrl(videoId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`שליפת אנליטיקס נכשלה (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return parseAnalyticsResponse(await res.json());
}

/* ---------------- channel overview (mirrors Studio's סקירה כללית) ---------------- */

export interface ChannelOverview {
  days: number;
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
    views: number;
    watchTimeMinutes: number;
    averageViewDurationSec: number;
    averageViewPercentage: number;
    ctr: number | null;
  }[];
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

async function runReport(
  accessToken: string,
  params: Record<string, string>,
): Promise<{ rows?: (string | number)[][] }> {
  const qs = new URLSearchParams({ ids: "channel==MINE", ...params });
  const res = await fetch(`${REPORTS_URL}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`שליפת אנליטיקס נכשלה (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function fetchChannelOverview(accessToken: string, days = 28): Promise<ChannelOverview> {
  const startDate = isoDaysAgo(days);
  const endDate = new Date().toISOString().slice(0, 10);
  const range = { startDate, endDate };

  const [totalsRes, seriesRes] = await Promise.all([
    runReport(accessToken, {
      ...range,
      metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,averageViewDuration",
    }),
    runReport(accessToken, { ...range, dimensions: "day", metrics: "views", sort: "day" }),
  ]);

  // impressions CTR isn't available on every channel/report combination — retry without it.
  let topRes: { rows?: (string | number)[][] };
  let topHasCtr = true;
  try {
    topRes = await runReport(accessToken, {
      ...range,
      dimensions: "video",
      metrics:
        "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,impressionsClickThroughRate",
      sort: "-views",
      maxResults: "10",
    });
  } catch {
    topHasCtr = false;
    topRes = await runReport(accessToken, {
      ...range,
      dimensions: "video",
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage",
      sort: "-views",
      maxResults: "10",
    });
  }

  const t = totalsRes.rows?.[0] ?? [];
  return {
    days,
    totals: {
      views: Number(t[0] ?? 0),
      watchTimeMinutes: Number(t[1] ?? 0),
      subsGained: Number(t[2] ?? 0),
      subsLost: Number(t[3] ?? 0),
      averageViewDurationSec: Number(t[4] ?? 0),
    },
    series: (seriesRes.rows ?? []).map((r) => ({ date: String(r[0]), views: Number(r[1] ?? 0) })),
    topVideos: (topRes.rows ?? []).map((r) => ({
      videoId: String(r[0]),
      views: Number(r[1] ?? 0),
      watchTimeMinutes: Number(r[2] ?? 0),
      averageViewDurationSec: Number(r[3] ?? 0),
      averageViewPercentage: Number(r[4] ?? 0),
      ctr: topHasCtr && r[5] != null ? Number(r[5]) : null,
    })),
  };
}
