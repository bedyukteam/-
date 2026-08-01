// Manual/auto refresh of a clip's Submagic state. Thin auth wrapper around
// refreshClipEdit — the same core the server-side edit poller uses.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshClipEdit } from "@/lib/submagic-trigger";

export async function POST(_req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const r = await refreshClipEdit(supabase, clipId);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
