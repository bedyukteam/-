// Local-dev / impatience fallback for the reel-edit export webhook: polls the
// clip's project on Submagic and pulls the freshly rendered video links.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail } from "@/lib/submagic";

export async function POST(_req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const fresh = await getProjectDetail(clipId);
    const exported = fresh.status === "completed";
    await supabase
      .from("submagic_clips")
      .update({
        ...(exported ? { edit_status: "exported" } : {}),
        ...(fresh.status === "failed" ? { edit_status: "error" } : {}),
        ...(fresh.downloadUrl ? { download_url: fresh.downloadUrl } : {}),
        ...(fresh.directUrl ? { direct_url: fresh.directUrl } : {}),
      })
      .eq("id", clipId);
    return NextResponse.json({ status: fresh.status ?? null, exported });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
