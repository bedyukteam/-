import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { abortMultipart, completeMultipart, createMultipart, signPartUrl } from "@/lib/r2";

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

// Browser-driven multipart upload to R2: create → sign-part (×N, PUT from the
// browser directly to R2) → complete. Auth-gated like every other API route.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (body.action === "create") {
      const key = `video/${crypto.randomUUID()}/${safeName(body.filename ?? "episode.mp4")}`;
      const uploadId = await createMultipart(key, body.contentType || "video/mp4");
      return NextResponse.json({ key, uploadId });
    }
    if (body.action === "sign-part") {
      const url = await signPartUrl(body.key, body.uploadId, body.partNumber);
      return NextResponse.json({ url });
    }
    if (body.action === "complete") {
      await completeMultipart(body.key, body.uploadId, body.parts);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "abort") {
      await abortMultipart(body.key, body.uploadId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
