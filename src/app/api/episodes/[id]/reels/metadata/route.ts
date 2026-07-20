// Generates YouTube Shorts title+description for an episode's Submagic reels
// in one gpt-4o call. Body: {} = only clips missing a title; {clipId} = just
// that clip (regenerate); {force:true} = regenerate all.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReelsMetadata } from "@/lib/reels-metadata";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { clipId, force } = (await req.json().catch(() => ({}))) as {
    clipId?: string;
    force?: boolean;
  };

  try {
    const res = await generateReelsMetadata(supabase, id, { clipId, force });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
