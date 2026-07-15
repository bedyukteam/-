// studio/src/app/api/analytics/channel/route.ts
// Channel-level analytics mirroring YouTube Studio's overview: totals,
// daily views series, and top content (with titles).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { fetchChannelOverview } from "@/lib/youtube-analytics";
import { fetchChannelMeta, fetchVideoTitles } from "@/lib/youtube-channel";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 28));

  try {
    const accessToken = await getValidAccessToken(supabase);
    const [overview, meta] = await Promise.all([
      fetchChannelOverview(accessToken, days),
      fetchChannelMeta(accessToken),
    ]);
    const titles = await fetchVideoTitles(
      accessToken,
      overview.topVideos.map((v) => v.videoId),
    );
    return NextResponse.json({
      ...overview,
      channelTitle: meta.title,
      subscriberCount: meta.subscriberCount,
      topVideos: overview.topVideos.map((v) => ({ ...v, title: titles[v.videoId] ?? v.videoId })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
