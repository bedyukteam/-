// studio/src/app/api/episodes/[id]/youtube/upload-chunk/route.ts
// Thin wrapper over uploadNextChunk (src/lib/youtube-upload.ts) — kept for the
// browser-driven fallback; the youtube/drive route calls the lib directly.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadNextChunk } from "@/lib/youtube-upload";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { publishAt } = (await req.json().catch(() => ({}))) as { publishAt?: string | null };

  try {
    const result = await uploadNextChunk(supabase, id, publishAt ?? null, new URL(req.url).origin);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === "אין קובץ וידאו לפרק" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
