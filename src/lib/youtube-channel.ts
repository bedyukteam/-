// studio/src/lib/youtube-channel.ts
// Channel-level YouTube Data API helpers: uploads listing (for syncing
// already-published content into the system) and video metadata.

const DATA_URL = "https://www.googleapis.com/youtube/v3";

/** ISO8601 duration (PT#H#M#S) → seconds. */
export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** YouTube Shorts are ≤3 minutes — used to classify synced videos. */
export function isShortDuration(seconds: number): boolean {
  return seconds > 0 && seconds <= 185;
}

async function ytGet(accessToken: string, path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${DATA_URL}/${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube API (${path}) נכשל (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export interface ChannelMeta {
  channelId: string;
  title: string;
  subscriberCount: number;
  uploadsPlaylistId: string;
}

export async function fetchChannelMeta(accessToken: string): Promise<ChannelMeta> {
  const j = await ytGet(accessToken, "channels", {
    part: "snippet,statistics,contentDetails",
    mine: "true",
  });
  const c = j.items?.[0];
  if (!c) throw new Error("לא נמצא ערוץ מחובר");
  return {
    channelId: c.id,
    title: c.snippet?.title ?? "",
    subscriberCount: Number(c.statistics?.subscriberCount ?? 0),
    uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

export interface UploadedVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  privacyStatus: string;
}

/** Every upload on the channel (paginated, capped), with duration + privacy. */
export async function fetchAllUploads(accessToken: string, maxVideos = 200): Promise<UploadedVideo[]> {
  const { uploadsPlaylistId } = await fetchChannelMeta(accessToken);
  if (!uploadsPlaylistId) return [];

  const ids: string[] = [];
  let pageToken = "";
  while (ids.length < maxVideos) {
    const j = await ytGet(accessToken, "playlistItems", {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of j.items ?? []) ids.push(it.contentDetails.videoId);
    pageToken = j.nextPageToken ?? "";
    if (!pageToken) break;
  }

  const out: UploadedVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await ytGet(accessToken, "videos", {
      part: "snippet,contentDetails,status",
      id: ids.slice(i, i + 50).join(","),
    });
    for (const v of j.items ?? []) {
      out.push({
        videoId: v.id,
        title: v.snippet?.title ?? "",
        publishedAt: v.snippet?.publishedAt ?? "",
        durationSec: parseIsoDuration(v.contentDetails?.duration ?? ""),
        privacyStatus: v.status?.privacyStatus ?? "",
      });
    }
  }
  return out;
}

/** id → title map for a batch of videos (used by the top-content table). */
export async function fetchVideoTitles(accessToken: string, videoIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const j = await ytGet(accessToken, "videos", {
      part: "snippet",
      id: videoIds.slice(i, i + 50).join(","),
    });
    for (const v of j.items ?? []) map[v.id] = v.snippet?.title ?? v.id;
  }
  return map;
}
