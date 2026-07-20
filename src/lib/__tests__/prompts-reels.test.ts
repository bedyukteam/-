import { describe, expect, it } from "vitest";
import { buildReelsMetadataPrompt, type StyleContext } from "@/lib/prompts";

const ctx: StyleContext = {
  languageGuidelines: "שפה חמה ואנושית, בלי קלישאות",
  visualGuidelines: "",
  examples: { title: ["כותרת מאושרת לדוגמה"] },
};

const clips = [
  { id: "clip-1", title: "אף אחד לא בא להציל", durationSec: 63 },
  { id: "clip-2", title: "סליחה היא בשביל חופש", durationSec: 62 },
];

describe("buildReelsMetadataPrompt", () => {
  it("returns system+user with base rules, guidelines and title examples", () => {
    const { system, user } = buildReelsMetadataPrompt(clips, "תמלול הפרק", ctx);
    expect(system).toContain("לשון רבים");
    expect(system).toContain("שפה חמה ואנושית");
    expect(system).toContain("כותרת מאושרת לדוגמה");
    expect(user).toContain("תמלול הפרק");
  });

  it("lists every clip id and title so the model can map results back", () => {
    const { user } = buildReelsMetadataPrompt(clips, "ת", ctx);
    for (const c of clips) {
      expect(user).toContain(c.id);
      expect(user).toContain(c.title!);
    }
  });

  it("requests the exact JSON shape and #Shorts in the description only", () => {
    const { user } = buildReelsMetadataPrompt(clips, "ת", ctx);
    expect(user).toContain('"reels"');
    expect(user).toContain('"id"');
    expect(user).toContain('"title"');
    expect(user).toContain('"description"');
    expect(user).toContain("#Shorts");
  });

  it("truncates very long transcripts", () => {
    const long = "א".repeat(40000);
    const { user } = buildReelsMetadataPrompt(clips, long, ctx);
    expect(user.length).toBeLessThan(40000);
    expect(user).toContain("[התמלול קוצר]");
  });
});
