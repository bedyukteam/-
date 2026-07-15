// studio/src/app/api/episodes/[id]/youtube/upload-chunk/route.ts
import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { getRange, deleteObject } from "@/lib/r2";
import { buildVideoResource, nextChunkRange, parseRangeEnd } from "@/lib/youtube";

const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

// Best-effort: sets the approved cover as the video's thumbnail. Failure here
// must never fail the overall publish — the video is already live/scheduled.
async function trySetThumbnail(sb: SupabaseClient, accessToken: string, videoId: string, episodeId: string) {
  try {
    const { data: ep } = await sb
      .from("episodes")
      .select("thumbnail_path")
      .eq("id", episodeId)
      .single();
    if (!ep?.thumbnail_path) return;
    const { data: file } = await sb.storage.from("media").download(ep.thumbnail_path as string);
    if (!file) return;
    const buf = new Blob([await file.arrayBuffer()], { type: "image/png" });
    await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "image/png" },
      body: buf,
    });
  } catch {
    // swallow — see comment above
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { publishAt } = (await req.json().catch(() => ({}))) as { publishAt?: string | null };

  const { data: ep } = await supabase
    .from("episodes")
    .select("video_key, video_size, youtube_upload_url, youtube_uploaded_bytes")
    .eq("id", id)
    .single();
  if (!ep?.video_key || !ep.video_size) {
    return NextResponse.json({ error: "אין קובץ וידאו לפרק" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(supabase);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    let uploadUrl = ep.youtube_upload_url as string | null;

    // First call for this episode: open the resumable session with Google.
    if (!uploadUrl) {
      const { data: gens } = await supabase
        .from("generations")
        .select("kind, content")
        .eq("episode_id", id)
        .eq("selected", true)
        .in("kind", ["title", "description"]);
      const title =
        (gens?.find((g) => g.kind === "title")?.content as { text?: string } | undefined)?.text ||
        "פרק פודקאסט";
      const description =
        (gens?.find((g) => g.kind === "description")?.content as { text?: string } | undefined)
          ?.text ?? "";

      const initRes = await fetch(UPLOAD_INIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "content-type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": "video/*",
          "X-Upload-Content-Length": String(ep.video_size),
        },
        body: JSON.stringify(buildVideoResource({ title, description, publishAt: publishAt ?? null })),
      });
      if (!initRes.ok) {
        throw new Error(`פתיחת העלאה ליוטיוב נכשלה (${initRes.status}): ${(await initRes.text()).slice(0, 300)}`);
      }
      uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) throw new Error("יוטיוב לא החזיר כתובת העלאה");

      await supabase
        .from("episodes")
        .update({
          youtube_upload_url: uploadUrl,
          youtube_status: "uploading",
          youtube_error: null,
          publish_at: publishAt ?? null,
        })
        .eq("id", id);
    }

    const uploadedBytes = (ep.youtube_uploaded_bytes as number) ?? 0;
    const totalBytes = ep.video_size as number;
    const range = nextChunkRange(uploadedBytes, totalBytes);

    // Nothing left to upload (can happen if a previous call completed the PUT
    // but the response never made it back to the browser) — treat as done.
    if (!range) {
      return NextResponse.json({ done: true, uploadedBytes: totalBytes, totalBytes });
    }

    const chunk = await getRange(ep.video_key as string, range.start, range.end);
    // Buffer/Uint8Array aren't in this TS config's BodyInit union — copy into a
    // plain ArrayBuffer and wrap in a Blob (a valid BodyInit, global in the Node
    // route runtime). getRange's Buffer may sit on a SharedArrayBuffer, so a copy
    // is what keeps the type clean.
    const ab = new ArrayBuffer(chunk.byteLength);
    new Uint8Array(ab).set(chunk);
    const chunkBody = new Blob([ab]);
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-length": String(chunk.length), "content-range": range.contentRange },
      body: chunkBody,
    });

    if (putRes.status === 200 || putRes.status === 201) {
      const video = (await putRes.json()) as { id: string };
      await trySetThumbnail(supabase, accessToken, video.id, id);
      await supabase
        .from("episodes")
        .update({
          youtube_video_id: video.id,
          youtube_status: publishAt ? "scheduled" : "published",
          youtube_uploaded_bytes: totalBytes,
        })
        .eq("id", id);
      await deleteObject(ep.video_key as string); // publish succeeded — free the R2 slot
      return NextResponse.json({ done: true, videoId: video.id, uploadedBytes: totalBytes, totalBytes });
    }

    if (putRes.status === 308) {
      const nextOffset = parseRangeEnd(putRes.headers.get("range")) ?? range.end + 1;
      await supabase.from("episodes").update({ youtube_uploaded_bytes: nextOffset }).eq("id", id);
      return NextResponse.json({ done: false, uploadedBytes: nextOffset, totalBytes });
    }

    throw new Error(`העלאת חלק ליוטיוב נכשלה (${putRes.status}): ${(await putRes.text()).slice(0, 300)}`);
  } catch (e) {
    await supabase
      .from("episodes")
      .update({ youtube_status: "error", youtube_error: (e as Error).message })
      .eq("id", id);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
