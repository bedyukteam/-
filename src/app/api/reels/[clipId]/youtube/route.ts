// Publishes one Submagic reel to YouTube as a Short — fetches the clip's mp4
// (10-25MB) into memory and uploads it in a single resumable-session PUT.
// Body: { publishAt?: string | null } — ISO datetime schedules (private+publishAt),
// null/absent publishes immediately. Same metadata semantics as the episode flow.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/youtube-token";
import { buildVideoResource } from "@/lib/youtube";

export const maxDuration = 300;

const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";

export async function POST(req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { publishAt } = (await req.json().catch(() => ({}))) as { publishAt?: string | null };

  const { data: clip } = await supabase
    .from("submagic_clips")
    .select("id, download_url, direct_url, yt_title, yt_description, yt_video_id")
    .eq("id", clipId)
    .single();
  if (!clip) return NextResponse.json({ error: "clip not found" }, { status: 404 });
  if (clip.yt_video_id) {
    return NextResponse.json({ error: "הריל הזה כבר פורסם ליוטיוב" }, { status: 409 });
  }
  const videoUrl = (clip.download_url ?? clip.direct_url) as string | null;
  if (!videoUrl) return NextResponse.json({ error: "אין קובץ וידאו לריל" }, { status: 400 });
  if (!clip.yt_title) {
    return NextResponse.json({ error: "חסרה כותרת — צרי או כתבי כותרת לפני פרסום" }, { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(supabase);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await supabase
    .from("submagic_clips")
    .update({ yt_status: "uploading", yt_error: null })
    .eq("id", clipId);

  try {
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`הורדת קובץ הריל נכשלה (${videoRes.status})`);
    const buf = await videoRes.arrayBuffer();

    const initRes = await fetch(UPLOAD_INIT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(buf.byteLength),
      },
      body: JSON.stringify(
        buildVideoResource({
          title: clip.yt_title as string,
          description: (clip.yt_description as string) ?? "",
          publishAt: publishAt ?? null,
        }),
      ),
    });
    if (!initRes.ok) {
      throw new Error(
        `פתיחת העלאה ליוטיוב נכשלה (${initRes.status}): ${(await initRes.text()).slice(0, 300)}`,
      );
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) throw new Error("יוטיוב לא החזיר כתובת העלאה");

    // Whole file in one PUT — no Content-Range needed for a full-body upload.
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-length": String(buf.byteLength) },
      body: new Blob([buf], { type: "video/mp4" }),
    });
    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new Error(`העלאת הריל נכשלה (${putRes.status}): ${(await putRes.text()).slice(0, 300)}`);
    }
    const video = (await putRes.json()) as { id: string };

    await supabase
      .from("submagic_clips")
      .update({
        yt_video_id: video.id,
        yt_status: publishAt ? "scheduled" : "published",
        yt_publish_at: publishAt ?? null,
      })
      .eq("id", clipId);

    return NextResponse.json({ ok: true, videoId: video.id });
  } catch (e) {
    const msg = (e as Error).message;
    await supabase
      .from("submagic_clips")
      .update({ yt_status: "error", yt_error: msg })
      .eq("id", clipId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
