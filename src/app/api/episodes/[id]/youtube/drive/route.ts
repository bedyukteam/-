// Server-side driver for the YouTube resumable upload: one call starts a
// fire-and-forget loop that pushes chunk after chunk (by calling our own
// upload-chunk route with the caller's session cookie) until the upload
// completes. The browser no longer has to stay open — closing the tab used
// to freeze the upload mid-way.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  if (driving.has(id)) return NextResponse.json({ ok: true, driving: true, already: true });
  driving.add(id);

  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") ?? "";

  void (async () => {
    try {
      for (let i = 0; i < 1000; i++) {
        const res = await fetch(`${origin}/api/episodes/${id}/youtube/upload-chunk`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ publishAt: publishAt ?? null }),
        });
        const json = (await res.json().catch(() => ({}))) as { done?: boolean; error?: string };
        if (json.error) {
          console.error(`[youtube-drive] ${id} chunk failed:`, json.error.slice(0, 200));
          break;
        }
        if (json.done) break;
      }
    } catch (e) {
      console.error(`[youtube-drive] ${id}:`, (e as Error).message);
    } finally {
      driving.delete(id);
    }
  })();

  return NextResponse.json({ ok: true, driving: true });
}
