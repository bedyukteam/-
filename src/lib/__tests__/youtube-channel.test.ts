// studio/src/lib/__tests__/youtube-channel.test.ts
import { describe, expect, it } from "vitest";
import { parseIsoDuration, isShortDuration } from "@/lib/youtube-channel";

describe("parseIsoDuration", () => {
  it("parses minutes+seconds", () => {
    expect(parseIsoDuration("PT2M45S")).toBe(165);
  });
  it("parses hours", () => {
    expect(parseIsoDuration("PT1H0M33S")).toBe(3633);
  });
  it("parses seconds-only shorts", () => {
    expect(parseIsoDuration("PT58S")).toBe(58);
  });
  it("returns 0 for garbage", () => {
    expect(parseIsoDuration("")).toBe(0);
    expect(parseIsoDuration("P1D")).toBe(0);
  });
});

describe("isShortDuration", () => {
  it("classifies ≤3min as short", () => {
    expect(isShortDuration(58)).toBe(true);
    expect(isShortDuration(180)).toBe(true);
  });
  it("classifies longer videos and unknowns as full episodes", () => {
    expect(isShortDuration(1200)).toBe(false);
    expect(isShortDuration(0)).toBe(false);
  });
});
