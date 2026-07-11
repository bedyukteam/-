// YouTube Data API v3 — resumable upload + OAuth, via raw REST (no googleapis dep).

/** Chunk size for resumable uploads — must be a multiple of 256 KiB. */
export const YT_CHUNK = 16 * 1024 * 1024;

export interface YouTubeMeta {
  title: string;
  description: string;
  publishAt?: string | null;
}

/** videos.insert resource. Scheduling = private + publishAt (YouTube flips it live). */
export function buildVideoResource(meta: YouTubeMeta) {
  const scheduled = !!meta.publishAt;
  return {
    snippet: {
      title: meta.title.slice(0, 100),
      description: meta.description.slice(0, 4900),
      categoryId: "22", // People & Blogs
      defaultLanguage: "he",
      defaultAudioLanguage: "he",
    },
    status: {
      privacyStatus: scheduled ? "private" : "public",
      selfDeclaredMadeForKids: false,
      ...(scheduled ? { publishAt: meta.publishAt } : {}),
    },
  };
}

/** The next Content-Range to upload, or null when done. */
export function nextChunkRange(uploadedBytes: number, totalBytes: number) {
  if (totalBytes <= 0 || uploadedBytes >= totalBytes) return null;
  const start = uploadedBytes;
  const end = Math.min(start + YT_CHUNK, totalBytes) - 1;
  return { start, end, contentRange: `bytes ${start}-${end}/${totalBytes}` };
}

/** "bytes=0-1048575" (308 Range header) → next byte offset (1048576). */
export function parseRangeEnd(rangeHeader: string | null): number | null {
  const m = rangeHeader?.match(/bytes=\d+-(\d+)/);
  return m ? parseInt(m[1], 10) + 1 : null;
}
