import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, title, source_path, source_filename } = body ?? {};
  if (!source_path) {
    return NextResponse.json({ error: "missing source_path" }, { status: 400 });
  }

  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
  const { data: ep, error } = await supabase
    .from("episodes")
    .insert({
      channel_id: channelId,
      type: type === "short" ? "short" : "episode",
      title: title ?? "",
      source_path,
      source_filename: source_filename ?? null,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (error || !ep) {
    return NextResponse.json({ error: error?.message ?? "failed" }, { status: 500 });
  }

  // The episode dashboard drives the pipeline stage-by-stage (resilient to
  // serverless time limits). No background work is kicked off here.
  return NextResponse.json({ id: ep.id });
}
