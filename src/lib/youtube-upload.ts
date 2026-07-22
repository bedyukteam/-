// One step of the resumable YouTube upload, shared by the upload-chunk route
// (browser-driven fallback) and the youtube/drive server loop. Extracted so the
// server driver calls it DIRECTLY — an internal HTTP self-fetch of the public
// origin fails on Render ("fetch failed"), which froze server-driven uploads.
import { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/youtube-token";
import { getRange, deleteObject } from "@/lib/r2";
import { buildVideoResource, nextChunkRange, parseRangeEnd } from "@/lib/youtube";
import { triggerSubmagic } from "@/lib/submagic-trigger";

const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

// The resumable session bakes title/description at session-init — if the user
// edited an approved item after a previous publish attempt opened the session,
// the video would keep the stale metadata. Once the upload completes we
// re-assert the currently-approved values with videos.update. Best-effort:
// failure must never fail the publish itself.
async function trySyncMetadata(sb: SupabaseClient, accessToken: string, videoId: string, episodeId: string) {
  try {
    const { data: gens } = await sb
      .from("generations")
      .select("kind, content")
      .eq("episode_id", episodeId)
      .eq("selected", true)
      .in("kind", ["title", "description"]);
    const title =
      (gens?.find((g) => g.kind === "title")?.content as { text?: string } | undefined)?.text;
    const description =
      (gens?.find((g) => g.kind === "description")?.content as { text?: string } | undefined)?.text;
    if (!title && !description) return;
    // buildVideoResource supplies the full snippet (incl. required categoryId).
    const { snippet } = buildVideoResource({
      title: title || "פרק פודקאסט",
      description: description ?? "",
      publishAt: null,
    });
    await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ id: videoId, snippet }),
    });
  } catch {
    // swallow — see comment above
  }
}

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

export interface ChunkResult {
  done: boolean;
  uploadedBytes: number;
  totalBytes: number;
  videoId?: string;
}

/**
 * Uploads the next chunk of the episode's video to YouTube (opening the
 * resumable session on the first call). Throws on failure after recording the
 * error on the episode row.
 */
export async function uploadNextChunk(
  sb: SupabaseClient,
  episodeId: string,
  publishAt: string | null,
  origin: string,
): Promise<ChunkResult> {
  const { data: ep } = await sb
    .from("episodes")
    .select("video_key, video_size, youtube_upload_url, youtube_uploaded_bytes")
    .eq("id", episodeId)
    .single();
  if (!ep?.video_key || !ep.video_size) throw new Error("אין קובץ וידאו לפרק");

  const accessToken = await getValidAccessToken(sb);

  try {
    let uploadUrl = ep.youtube_upload_url as string | null;

    // First call for this episode: open the resumable session with Google.
    if (!uploadUrl) {
      const { data: gens } = await sb
        .from("generations")
        .select("kind, content")
        .eq("episode_id", episodeId)
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
        body: JSON.stringify(buildVideoResource({ title, description, publishAt })),
      });
      if (!initRes.ok) {
        throw new Error(`פתיחת העלאה ליוטיוב נכשלה (${initRes.status}): ${(await initRes.text()).slice(0, 300)}`);
      }
      uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) throw new Error("יוטיוב לא החזיר כתובת העלאה");

      await sb
        .from("episodes")
        .update({
          youtube_upload_url: uploadUrl,
          youtube_status: "uploading",
          youtube_error: null,
          publish_at: publishAt,
        })
        .eq("id", episodeId);
    }

    const uploadedBytes = (ep.youtube_uploaded_bytes as number) ?? 0;
    const totalBytes = ep.video_size as number;
    const range = nextChunkRange(uploadedBytes, totalBytes);

    // Nothing left to upload (can happen if a previous call completed the PUT
    // but the response never made it back) — treat as done.
    if (!range) return { done: true, uploadedBytes: totalBytes, totalBytes };

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
      await trySyncMetadata(sb, accessToken, video.id, episodeId);
      await trySetThumbnail(sb, accessToken, video.id, episodeId);
      await sb
        .from("episodes")
        .update({
          youtube_video_id: video.id,
          youtube_status: publishAt ? "scheduled" : "published",
          youtube_uploaded_bytes: totalBytes,
        })
        .eq("id", episodeId);
      await deleteObject(ep.video_key as string); // publish succeeded — free the R2 slot
      // Immediate publishes kick off Submagic reels right away. Scheduled ones
      // wait — the video isn't publicly watchable until its publish time — and
      // are covered by the manual "צור רילס" trigger. triggerSubmagic never throws.
      if (!publishAt) {
        await triggerSubmagic(sb, episodeId, origin);
      }
      return { done: true, videoId: video.id, uploadedBytes: totalBytes, totalBytes };
    }

    if (putRes.status === 308) {
      const nextOffset = parseRangeEnd(putRes.headers.get("range")) ?? range.end + 1;
      await sb.from("episodes").update({ youtube_uploaded_bytes: nextOffset }).eq("id", episodeId);
      return { done: false, uploadedBytes: nextOffset, totalBytes };
    }

    throw new Error(`העלאת חלק ליוטיוב נכשלה (${putRes.status}): ${(await putRes.text()).slice(0, 300)}`);
  } catch (e) {
    await sb
      .from("episodes")
      .update({ youtube_status: "error", youtube_error: (e as Error).message })
      .eq("id", episodeId);
    throw e;
  }
}
