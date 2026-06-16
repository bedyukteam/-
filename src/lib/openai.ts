import OpenAI, { toFile } from "openai";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribe one audio chunk (already extracted to mono/16k and kept under the
 * 25 MB per-request cap by `extractAudioChunks`). Hebrew by default.
 */
export async function transcribeChunk(
  buffer: Buffer,
  filename: string,
  language = "he",
): Promise<string> {
  const file = await toFile(buffer, filename);
  const res = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe",
    language,
    response_format: "text",
  });
  // With response_format "text" the SDK returns the raw string.
  return typeof res === "string" ? res : (res as { text: string }).text;
}

/** Call a chat model and parse a JSON object response. */
export async function chatJSON<T>(system: string, user: string): Promise<T> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.8,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as T;
}

/** Generate a 16:9 thumbnail preview image, returned as a PNG buffer. */
export async function generateThumbnail(prompt: string): Promise<Buffer> {
  const res = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1536x1024",
    quality: "low",
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation returned no data");
  return Buffer.from(b64, "base64");
}
