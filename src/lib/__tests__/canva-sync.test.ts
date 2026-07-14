import { describe, expect, it } from "vitest";
import { mergeCoverRows, DEFAULT_RECT, type CoverRow } from "@/lib/canva-sync";

describe("mergeCoverRows", () => {
  it("keeps a saved position for a page that still exists", () => {
    const existing: CoverRow[] = [
      { page_number: 6, storage_path: "old/path.jpg", cx: 999, cy: 500, max_w: 700, max_h: 300, side: "none", max_font_px: 84 },
    ];
    const result = mergeCoverRows(existing, [6], (p) => `covers/bg${p}.jpg`);
    expect(result).toEqual([
      { page_number: 6, storage_path: "covers/bg6.jpg", cx: 999, cy: 500, max_w: 700, max_h: 300, side: "none", max_font_px: 84 },
    ]);
  });

  it("gives a brand-new page the shared default rect", () => {
    const result = mergeCoverRows([], [7], (p) => `covers/bg${p}.jpg`);
    expect(result).toEqual([
      { page_number: 7, storage_path: "covers/bg7.jpg", ...DEFAULT_RECT },
    ]);
  });

  it("drops pages that no longer exist in the fresh list", () => {
    const existing: CoverRow[] = [
      { page_number: 1, storage_path: "a", cx: 1, cy: 1, max_w: 1, max_h: 1, side: "none", max_font_px: 100 },
      { page_number: 2, storage_path: "b", cx: 2, cy: 2, max_w: 2, max_h: 2, side: "none", max_font_px: 100 },
    ];
    const result = mergeCoverRows(existing, [1], (p) => `covers/bg${p}.jpg`);
    expect(result.map((r) => r.page_number)).toEqual([1]);
  });

  it("preserves the requested page order", () => {
    const result = mergeCoverRows([], [3, 1, 2], (p) => `covers/bg${p}.jpg`);
    expect(result.map((r) => r.page_number)).toEqual([3, 1, 2]);
  });
});
