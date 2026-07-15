// studio/src/app/api/episodes/[id]/youtube/analytics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { fetchVideoAnalytics } from "@/lib/youtube-analytics";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: ep } = await supabase
    .from("episodes")
    .select("youtube_video_id")
    .eq("id", id)
    .single();
  if (!ep?.youtube_video_id) {
    return NextResponse.json({ error: "הפרק עדיין לא פורסם ביוטיוב" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(supabase);
    const stats = await fetchVideoAnalytics(accessToken, ep.youtube_video_id as string);
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
