import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import ffmpegPath from "ffmpeg-static";

const exec = promisify(execFile);

// gpt-4o-transcribe rejects audio longer than 1400 seconds per request
// ("maximum for this model", verified empirically 2026-07-17), on top of the
// 25 MB size cap. 22-minute segments (~10.6 MB at 64 kbps mono) clear both
// with margin — ffmpeg's segmenter overshoots the nominal cut by a few ms.
const SEGMENT_SECONDS = 1320;

export interface AudioChunk {
  buffer: Buffer;
  name: string;
}

/**
 * Extract a speech-optimized audio track from any audio/video file and split it
 * into ordered chunks each well under the transcription size limit.
 * Mono 16 kHz 64 kbps mp3 is ideal for speech-to-text and shrinks files ~10-50x.
 */
export async function extractAudioChunks(
  input: ArrayBuffer,
  filename: string,
): Promise<AudioChunk[]> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available");

  const dir = await mkdtemp(join(tmpdir(), "pod-"));
  try {
    const inPath = join(dir, "input" + (extname(filename) || ".bin"));
    await writeFile(inPath, Buffer.from(input));

    const outPattern = join(dir, "chunk%03d.mp3");
    await exec(
      ffmpegPath,
      [
        "-i", inPath,
        "-vn",                       // drop any video stream
        "-ac", "1",                  // mono
        "-ar", "16000",              // 16 kHz
        "-b:a", "64k",
        "-f", "segment",
        "-segment_time", String(SEGMENT_SECONDS),
        "-reset_timestamps", "1",
        outPattern,
      ],
      { maxBuffer: 1024 * 1024 * 64 },
    );

    const files = (await readdir(dir)).filter((f) => f.startsWith("chunk")).sort();
    const chunks: AudioChunk[] = [];
    for (const f of files) {
      chunks.push({ buffer: await readFile(join(dir, f)), name: f });
    }
    if (chunks.length === 0) throw new Error("לא חולץ אודיו מהקובץ");
    return chunks;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Extract a podcast-quality mp3 from a remote video (presigned R2 URL).
 * ffmpeg streams the input over https; only the mp3 output touches disk.
 * 44.1 kHz / 128 kbps keeps publishing quality (~1 MB/min).
 */
export async function extractPodcastAudio(inputUrl: string): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not available");
  const dir = await mkdtemp(join(tmpdir(), "pod-"));
  try {
    const out = join(dir, "episode.mp3");
    try {
      await exec(
        ffmpegPath,
        ["-i", inputUrl, "-vn", "-ar", "44100", "-b:a", "128k", out],
        { maxBuffer: 1024 * 1024 * 64 },
      );
    } catch (e) {
      // Never propagate the presigned URL (it embeds live credentials) — keep only
      // the tail of ffmpeg's stderr, with any URLs scrubbed.
      const stderr = String((e as { stderr?: string }).stderr ?? "")
        .replace(/https?:\/\/\S+/g, "<url>")
        .trim()
        .slice(-300);
      throw new Error("חילוץ האודיו נכשל (ffmpeg)" + (stderr ? `: ${stderr}` : ""));
    }
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
