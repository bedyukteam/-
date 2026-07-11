import { describe, expect, it } from "vitest";
import { buildVideoResource, nextChunkRange, parseRangeEnd, truncateUtf8, YT_CHUNK } from "@/lib/youtube";

describe("buildVideoResource", () => {
  it("immediate publish → public, no publishAt", () => {
    const r = buildVideoResource({ title: "כותרת הפרק", description: "תיאור" });
    expect(r.status.privacyStatus).toBe("public");
    expect("publishAt" in r.status).toBe(false);
    expect(r.status.selfDeclaredMadeForKids).toBe(false);
  });

  it("scheduled → private + publishAt passthrough", () => {
    const r = buildVideoResource({
      title: "כ",
      description: "ת",
      publishAt: "2026-07-15T18:00:00.000Z",
    });
    expect(r.status.privacyStatus).toBe("private");
    expect(r.status.publishAt).toBe("2026-07-15T18:00:00.000Z");
  });

  it("truncates title to YouTube's 100-char limit", () => {
    const r = buildVideoResource({ title: "א".repeat(150), description: "" });
    expect(r.snippet.title.length).toBe(100);
  });

  it("caps Hebrew description at 4900 UTF-8 bytes", () => {
    const r = buildVideoResource({ title: "כ", description: "א".repeat(4000) });
    expect(new TextEncoder().encode(r.snippet.description).length).toBeLessThanOrEqual(4900);
  });
});

describe("truncateUtf8", () => {
  it("returns short strings unchanged", () => {
    expect(truncateUtf8("שלום", 100)).toBe("שלום");
  });

  it("caps Hebrew text by UTF-8 bytes, not characters", () => {
    const out = truncateUtf8("א".repeat(4000), 4900);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(4900);
    expect(out.length).toBe(2450); // 2 bytes per Hebrew char
  });

  it("never leaves a broken trailing character", () => {
    const out = truncateUtf8("א".repeat(10), 5); // 5 bytes cuts mid-char
    expect(out).toBe("אא"); // 4 bytes, clean
  });
});

describe("nextChunkRange", () => {
  it("first chunk of a large file", () => {
    const r = nextChunkRange(0, YT_CHUNK * 3);
    expect(r).toEqual({
      start: 0,
      end: YT_CHUNK - 1,
      contentRange: `bytes 0-${YT_CHUNK - 1}/${YT_CHUNK * 3}`,
    });
  });

  it("final partial chunk", () => {
    const total = YT_CHUNK + 5;
    const r = nextChunkRange(YT_CHUNK, total);
    expect(r).toEqual({
      start: YT_CHUNK,
      end: total - 1,
      contentRange: `bytes ${YT_CHUNK}-${total - 1}/${total}`,
    });
  });

  it("upload complete → null", () => {
    expect(nextChunkRange(10, 10)).toBeNull();
  });

  it("empty file → null", () => {
    expect(nextChunkRange(0, 0)).toBeNull();
  });

  it("resumes from a non-chunk-aligned offset", () => {
    const half = YT_CHUNK / 2;
    const r = nextChunkRange(half, YT_CHUNK * 3);
    expect(r).toEqual({
      start: half,
      end: half + YT_CHUNK - 1,
      contentRange: `bytes ${half}-${half + YT_CHUNK - 1}/${YT_CHUNK * 3}`,
    });
  });
});

describe("parseRangeEnd", () => {
  it("parses the next offset from a 308 Range header", () => {
    expect(parseRangeEnd("bytes=0-1048575")).toBe(1048576);
  });

  it("null header → null", () => {
    expect(parseRangeEnd(null)).toBeNull();
  });
});
