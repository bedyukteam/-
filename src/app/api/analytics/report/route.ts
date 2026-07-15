// studio/src/app/api/analytics/report/route.ts
// Single gateway for every analytics report the dashboard renders. The `type`
// parameter maps to a hard-whitelisted YouTube Analytics query — no free-form
// metrics/dimensions ever reach the API.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { buildReportParams, medianCumulative, runReport } from "@/lib/youtube-analytics";
import { fetchAllUploads, fetchVideosMeta, isShortDuration } from "@/lib/youtube-channel";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIDEO_RE = /^[A-Za-z0-9_-]{5,20}$/;

// typical-performance is ~20 API calls — cache per (channel-type) for 10 minutes.
const typicalCache = new Map<string, { at: number; median: number[] }>();
const TYPICAL_TTL_MS = 10 * 60_000;

async function typicalPerformance(accessToken: string, videoId: string) {
  const uploads = await fetchAllUploads(accessToken, 100);
  const target = uploads.find((u) => u.videoId === videoId);
  const wantShort = target ? isShortDuration(target.durationSec) : false;
  const cacheKey = wantShort ? "short" : "episode";
  const hit = typicalCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TYPICAL_TTL_MS) return hit.median;

  const peers = uploads
    .filter((u) => u.videoId !== videoId && u.privacyStatus === "public")
    .filter((u) => isShortDuration(u.durationSec) === wantShort)
    .slice(0, 20);

  const endDate = new Date().toISOString().slice(0, 10);
  const seriesList = await Promise.all(
    peers.map(async (p) => {
      try {
        const startDate = (p.publishedAt || endDate).slice(0, 10);
        const params = buildReportParams("video_series", { startDate, endDate, videoId: p.videoId });
        const r = await runReport(accessToken, params!);
        return (r.rows ?? []).map((row: (string | number)[]) => Number(row[1] ?? 0));
      } catch {
        return [] as number[];
      }
    }),
  );

  const median = medianCumulative(seriesList, 90);
  typicalCache.set(cacheKey, { at: Date.now(), median });
  return median;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "";
  const startDate = url.searchParams.get("start") ?? "";
  const endDate = url.searchParams.get("end") ?? "";
  const videoId = url.searchParams.get("videoId") ?? undefined;

  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return NextResponse.json({ error: "טווח תאריכים לא תקין" }, { status: 400 });
  }
  if (videoId && !VIDEO_RE.test(videoId)) {
    return NextResponse.json({ error: "מזהה סרטון לא תקין" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(supabase);

    if (type === "typical_performance") {
      if (!videoId) return NextResponse.json({ error: "חסר מזהה סרטון" }, { status: 400 });
      const median = await typicalPerformance(accessToken, videoId);
      return NextResponse.json({ median });
    }

    const params = buildReportParams(type, { startDate, endDate, videoId });
    if (!params) return NextResponse.json({ error: "סוג דוח לא מוכר" }, { status: 400 });

    const report = await runReport(accessToken, params);
    const rows = report.rows ?? [];

    // Top-content rows are video IDs — enrich with title/duration/date so the
    // table can render without a second round-trip.
    if (type === "top_videos" && rows.length) {
      const meta = await fetchVideosMeta(
        accessToken,
        rows.map((r: (string | number)[]) => String(r[0])),
      );
      return NextResponse.json({ rows, meta });
    }

    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
