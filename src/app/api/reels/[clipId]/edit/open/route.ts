// Marks a clip as being edited externally in Submagic's own editor
// (app.submagic.co/v/{clipId}). ClipCard calls this when the user follows the
// edit link, then polls the sibling refresh route for a changed downloadUrl —
// UI exports never call our webhook, so this flag scopes the polling.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // An in-flight in-app export ('exporting') is owned by the webhook/refresh
  // completion path — don't clobber it. Re-clicking while already 'editing'
  // just resets the 24h polling window.
  const { error } = await supabase
    .from("submagic_clips")
    .update({ edit_status: "editing", edit_opened_at: new Date().toISOString() })
    .eq("id", clipId)
    .or("edit_status.neq.exporting,edit_status.is.null");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
