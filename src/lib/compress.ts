import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// Compress threshold — files above this are re-encoded client-side so the
// upload fits under Supabase's 50MB free-tier cap.
export const COMPRESS_OVER_BYTES = 45 * 1024 * 1024;

// Single-threaded core (no SharedArrayBuffer / COOP-COEP needed), loaded from CDN.
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let ffmpegPromise: Promise<FFmpeg> | null = null;

function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegPromise) return ffmpegPromise;
  ffmpegPromise = (async () => {
    const ff = new FFmpeg();
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    return ff;
  })();
  return ffmpegPromise;
}

/**
 * Re-encode an audio/video file to a compact speech-optimized mp3
 * (mono, 16 kHz, 48 kbps ≈ 0.36 MB/min) entirely in the browser.
 * onProgress receives 0..1.
 */
export async function compressToAudio(
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const ff = await loadFFmpeg();
  const handler = (e: { progress: number }) =>
    onProgress?.(Math.min(1, Math.max(0, e.progress)));
  ff.on("progress", handler);
  try {
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const inName = `in_${Date.now()}.${ext || "bin"}`;
    const outName = `out_${Date.now()}.mp3`;
    await ff.writeFile(inName, await fetchFile(file));
    // -vn drop video, mono, 16kHz, 48kbps mp3
    await ff.exec(["-i", inName, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", outName]);
    const data = (await ff.readFile(outName)) as Uint8Array;
    const blob = new Blob([data as unknown as BlobPart], { type: "audio/mpeg" });
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
    const base = file.name.replace(/\.[^.]+$/, "") || "audio";
    return new File([blob], `${base}.mp3`, { type: "audio/mpeg" });
  } finally {
    ff.off("progress", handler);
  }
}
