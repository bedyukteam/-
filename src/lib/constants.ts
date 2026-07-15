import type { Generation, GenerationKind, JobStage } from "./types";

export const KIND_LABELS: Record<GenerationKind, string> = {
  title: "כותרות לפרק",
  thumbnail_title: "כותרות לתמונה הממוזערת",
  thumbnail: "תמונות ממוזערות",
  description: "תיאור",
  carousel: "קרוסלות",
  quote: "ציטוטים",
  idea: "רעיונות לתוכן נוסף",
};

export const KIND_ORDER: GenerationKind[] = [
  "title",
  "thumbnail_title",
  "thumbnail",
  "description",
  "carousel",
  "quote",
  "idea",
];

// Categories that must be approved before publishing (Phase C gating).
export const REQUIRED_KINDS: GenerationKind[] = [
  "title",
  "thumbnail_title",
  "description",
  "thumbnail",
];

// Shorts skip the thumbnail flow entirely — YouTube Shorts don't show custom
// thumbnails, so only title + description gate their publish.
export const SHORT_REQUIRED_KINDS: GenerationKind[] = ["title", "description"];

export function requiredKindsFor(episodeType: string | null | undefined): GenerationKind[] {
  return episodeType === "short" ? SHORT_REQUIRED_KINDS : REQUIRED_KINDS;
}

export const STAGE_LABELS: Record<JobStage, string> = {
  extract: "חילוץ אודיו מהוידאו",
  transcribe: "תמלול הפרק",
  generate: "יצירת תוכן",
  thumbnails: "יצירת תמונות ממוזערות",
};

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "הועלה",
  processing: "בעיבוד",
  ready: "מוכן",
  error: "שגיאה",
};

/** Same "approved" rule ApprovalBar renders — shared so EpisodeView can gate PublishPanel on it too. */
export function isPublishReady(
  gens: Generation[],
  thumbnailReady: boolean,
  episodeType?: string | null,
): boolean {
  return requiredKindsFor(episodeType).every((k) =>
    k === "thumbnail" ? thumbnailReady : gens.some((g) => g.kind === k && g.selected),
  );
}
