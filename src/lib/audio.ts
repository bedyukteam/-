import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import ffmpegPath from "ffmpeg-static";

const exec = promisify(execFile);

// At 64 kbps mono, ~0.48 MB/min → a 25-minute segment is ~12 MB, safely under
// OpenAI's 25 MB per-request cap. Long podcasts get split into ordered chunks.
const SEGMENT_SECONDS = 1500;

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
