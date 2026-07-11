import type { GenerationKind, JobStage } from "./types";

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
