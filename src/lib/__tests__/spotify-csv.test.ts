// studio/src/lib/__tests__/spotify-csv.test.ts
import { describe, expect, it } from "vitest";
import { parseSpotifyCsv } from "@/lib/spotify-csv";

describe("parseSpotifyCsv", () => {
  it("sums Streams/Listeners/Starts columns across all data rows", () => {
    const csv = "Date,Streams,Listeners,Starts\n2026-07-01,10,8,12\n2026-07-02,15,9,20";
    expect(parseSpotifyCsv(csv)).toEqual({ streams: 25, listeners: 17, starts: 32 });
  });

  it("matches column names case-insensitively and tolerates extra columns", () => {
    const csv = "date,STREAMS,podcast name,listeners\n2026-07-01,5,My Show,3";
    expect(parseSpotifyCsv(csv)).toEqual({ streams: 5, listeners: 3, starts: null });
  });

  it("throws a clear error when no recognizable column exists", () => {
    expect(() => parseSpotifyCsv("date,foo\n2026-07-01,1")).toThrow(/לא נמצאו עמודות מוכרות/);
  });

  it("throws on an empty or header-only file", () => {
    expect(() => parseSpotifyCsv("Date,Streams")).toThrow(/ריק או לא תקין/);
  });
});
