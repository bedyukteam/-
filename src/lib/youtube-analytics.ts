// studio/src/lib/youtube-analytics.ts
// YouTube Analytics API v2 client: whitelisted report catalog + the computed
// typical-performance helpers behind /api/analytics/report.
// Note: thumbnail impressions/CTR and unique viewers are NOT exposed for
// channels (probed live 2026-07-16) — those stay Studio-only.

const REPORTS_URL = "https://youtubeanalytics.googleapis.com/v2/reports";

/* ---------------- report catalog (Analytics 2.0) ---------------- */
// Hard whitelist of report types the /api/analytics/report route can run —
// each maps to a fixed Analytics API query shape (no free-form parameters).

export interface ReportRequest {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  videoId?: string;
}

const CORE_METRICS =
  "views,engagedViews,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares";

/** null = unknown type or missing required videoId. */
export function buildReportParams(type: string, req: ReportRequest): Record<string, string> | null {
  const range = { startDate: req.startDate, endDate: req.endDate };
  const vid = req.videoId;
  const vfilter: Record<string, string> = vid ? { filters: `video==${vid}` } : {};
  switch (type) {
    case "channel_totals":
      return { ...range, metrics: CORE_METRICS };
    case "channel_series":
      return {
        ...range,
        dimensions: "day",
        sort: "day",
        metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost",
      };
    case "top_videos":
      return {
        ...range,
        dimensions: "video",
        sort: "-views",
        maxResults: "15",
        metrics: "views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes",
      };
    case "traffic_sources":
      return { ...range, ...vfilter, dimensions: "insightTrafficSourceType", metrics: "views,estimatedMinutesWatched" };
    case "search_terms":
      return {
        ...range,
        dimensions: "insightTrafficSourceDetail",
        filters: vid ? `insightTrafficSourceType==YT_SEARCH;video==${vid}` : "insightTrafficSourceType==YT_SEARCH",
        metrics: "views",
        sort: "-views",
        maxResults: "25",
      };
    case "video_totals":
      return vid
        ? { ...range, filters: `video==${vid}`, metrics: `${CORE_METRICS},averageViewPercentage` }
        : null;
    case "video_series":
      return vid
        ? { ...range, filters: `video==${vid}`, dimensions: "day", sort: "day", metrics: "views,estimatedMinutesWatched" }
        : null;
    case "retention":
      return vid
        ? { ...range, filters: `video==${vid}`, dimensions: "elapsedVideoTimeRatio", metrics: "audienceWatchRatio" }
        : null;
    case "subscribed_status":
      return { ...range, ...vfilter, dimensions: "subscribedStatus", metrics: "views,estimatedMinutesWatched" };
    case "geography":
      return { ...range, ...vfilter, dimensions: "country", sort: "-views", maxResults: "10", metrics: "views,estimatedMinutesWatched" };
    case "demographics":
      return { ...range, ...vfilter, dimensions: "ageGroup,gender", metrics: "viewerPercentage" };
    case "devices":
      return { ...range, ...vfilter, dimensions: "deviceType", metrics: "views,estimatedMinutesWatched" };
    default:
      return null;
  }
}

/* ---------------- typical performance (computed, Studio has no API for it) ---------------- */

/** Running cumulative sum of a daily series. */
export function cumulative(daily: number[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const v of daily) out.push((sum += v));
  return out;
}

/**
 * Median cumulative-views curve across videos, index = days since publish.
 * At each day index only videos that were already that old participate.
 */
export function medianCumulative(dailySeriesList: number[][], maxLen = 90): number[] {
  const cums = dailySeriesList.filter((s) => s.length > 0).map((s) => cumulative(s));
  const out: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const vals = cums.filter((c) => c.length > i).map((c) => c[i]).sort((a, b) => a - b);
    if (vals.length === 0) break;
    const mid = Math.floor(vals.length / 2);
    out.push(vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2);
  }
  return out;
}

export async function runReport(
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
