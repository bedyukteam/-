// Upload the show's square artwork straight into the public R2 bucket.
// Explicit auth — /api/podcast/* is public in the middleware for the feed.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadBufferPublic } from "@/lib/r2";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "image/jpeg";
  if (!/^image\/(jpeg|png)$/.test(contentType)) {
    return NextResponse.json({ error: "רק JPEG או PNG" }, { status: 400 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "קובץ ריק" }, { status: 400 });
  if (buf.length > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "קובץ גדול מדי (מקס' 15MB)" }, { status: 400 });
  }

  try {
    const ext = contentType === "image/png" ? "png" : "jpg";
    // Versioned key so directories re-fetch after a swap (they cache by URL).
    const key = `artwork/cover-${Date.now()}.${ext}`;
    await uploadBufferPublic(key, buf, contentType);
    const { error } = await supabase
      .from("podcast_settings")
      .upsert({ id: true, artwork_key: key, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, key });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
