// Server-side driver for the YouTube resumable upload: one call starts a
// fire-and-forget loop that pushes chunk after chunk until the upload
// completes — the browser no longer has to stay open. The loop calls
// uploadNextChunk DIRECTLY (an HTTP self-fetch of the public origin fails on
// Render) and runs on the admin client so a long upload isn't cut short by
// the caller's session-token expiry.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadNextChunk } from "@/lib/youtube-upload";

// Episodes currently being driven by THIS process. A server restart clears it,
// and the client's stall-guard simply calls drive again — the resumable
// session (upload url + offset) lives in the DB, so the loop picks up where
// it left off.
const driving = new Set<string>();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { publishAt } = (await req.json().catch(() => ({}))) as { publishAt?: string | null };

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "חסר SUPABASE_SERVICE_ROLE_KEY בשרת" }, { status: 500 });

  if (driving.has(id)) return NextResponse.json({ ok: true, driving: true, already: true });
  driving.add(id);

  const origin = new URL(req.url).origin;

  void (async () => {
    try {
      for (let i = 0; i < 2000; i++) {
        const result = await uploadNextChunk(admin, id, publishAt ?? null, origin);
        if (result.done) break;
      }
    } catch (e) {
      console.error(`[youtube-drive] ${id}:`, (e as Error).message.slice(0, 300));
    } finally {
      driving.delete(id);
    }
  })();

  return NextResponse.json({ ok: true, driving: true });
}
