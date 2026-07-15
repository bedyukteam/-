// studio/src/app/api/episodes/[id]/spotify-stats/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSpotifyCsv } from "@/lib/spotify-csv";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { csv } = (await req.json().catch(() => ({}))) as { csv?: string };
  if (!csv) return NextResponse.json({ error: "לא התקבל קובץ" }, { status: 400 });

  let stats;
  try {
    stats = parseSpotifyCsv(csv);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const spotify_stats = { ...stats, uploaded_at: new Date().toISOString() };
  const { error } = await supabase.from("episodes").update({ spotify_stats }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, stats: spotify_stats });
}
