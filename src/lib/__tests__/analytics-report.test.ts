// studio/src/lib/__tests__/analytics-report.test.ts
import { describe, expect, it } from "vitest";
import { buildReportParams, cumulative, medianCumulative } from "@/lib/youtube-analytics";

const RANGE = { startDate: "2026-06-01", endDate: "2026-07-01" };

describe("buildReportParams", () => {
  it("builds a channel totals query without dimensions", () => {
    const p = buildReportParams("channel_totals", RANGE)!;
    expect(p.metrics).toContain("views");
    expect(p.metrics).toContain("engagedViews");
    expect(p.dimensions).toBeUndefined();
  });

  it("scopes video reports with a video filter and rejects them without an id", () => {
    expect(buildReportParams("video_totals", RANGE)).toBeNull();
    expect(buildReportParams("retention", RANGE)).toBeNull();
    const p = buildReportParams("retention", { ...RANGE, videoId: "abc123xyz" })!;
    expect(p.filters).toBe("video==abc123xyz");
    expect(p.dimensions).toBe("elapsedVideoTimeRatio");
  });

  it("search terms filter combines YT_SEARCH with the optional video", () => {
    expect(buildReportParams("search_terms", RANGE)!.filters).toBe("insightTrafficSourceType==YT_SEARCH");
    expect(buildReportParams("search_terms", { ...RANGE, videoId: "v1d3o" })!.filters).toBe(
      "insightTrafficSourceType==YT_SEARCH;video==v1d3o",
    );
  });

  it("adds the video filter to breakdown reports only when given", () => {
    expect(buildReportParams("geography", RANGE)!.filters).toBeUndefined();
    expect(buildReportParams("geography", { ...RANGE, videoId: "v1d3o" })!.filters).toBe("video==v1d3o");
  });

  it("returns null for unknown types", () => {
    expect(buildReportParams("drop table", RANGE)).toBeNull();
  });
});

describe("cumulative", () => {
  it("accumulates a daily series", () => {
    expect(cumulative([5, 3, 0, 2])).toEqual([5, 8, 8, 10]);
  });
});

describe("medianCumulative", () => {
  it("takes the median across videos at each day index", () => {
    // cumulatives: [10,20,30], [2,4,6], [4,8,12] → medians [4,8,12]
    expect(medianCumulative([[10, 10, 10], [2, 2, 2], [4, 4, 4]])).toEqual([4, 8, 12]);
  });

  it("only counts videos old enough at each index and averages even splits", () => {
    // day0: [1,3] → 2 ; day1: only second video → 8
    expect(medianCumulative([[1], [3, 5]])).toEqual([2, 8]);
  });

  it("returns empty for no data", () => {
    expect(medianCumulative([[], []])).toEqual([]);
  });
});
