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
