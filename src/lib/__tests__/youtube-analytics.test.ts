// studio/src/lib/__tests__/youtube-analytics.test.ts
import { describe, expect, it } from "vitest";
import { buildAnalyticsUrl, parseAnalyticsResponse } from "@/lib/youtube-analytics";

describe("buildAnalyticsUrl", () => {
  it("filters to a single video and requests the four metrics we display", () => {
    const url = buildAnalyticsUrl("abc123");
    expect(url).toContain("filters=video%3D%3Dabc123");
    expect(url).toContain("metrics=views%2CestimatedMinutesWatched%2CaverageViewPercentage%2CimpressionsClickThroughRate");
    expect(url).toContain("ids=channel%3D%3DMINE");
  });
});

describe("parseAnalyticsResponse", () => {
  it("maps the first data row to named fields, in the requested metric order", () => {
    const r = parseAnalyticsResponse({ rows: [[1234, 567, 45.6, 8.9]] });
    expect(r).toEqual({ views: 1234, watchTimeMinutes: 567, averageViewPercentage: 45.6, ctr: 8.9 });
  });

  it("defaults missing values to zero/null rather than throwing", () => {
    expect(parseAnalyticsResponse({})).toEqual({
      views: 0,
      watchTimeMinutes: 0,
      averageViewPercentage: 0,
      ctr: null,
    });
  });
});
