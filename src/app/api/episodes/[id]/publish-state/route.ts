// Lightweight progress endpoint for the publish flow: the client polls this
// while the server-side driver pushes the upload.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: ep } = await supabase
    .from("episodes")
    .select("youtube_status, youtube_uploaded_bytes, youtube_video_id, youtube_error")
    .eq("id", id)
    .single();
  if (!ep) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(ep);
}
