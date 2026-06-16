import type { GenerationKind, JobStage } from "./types";

export const KIND_LABELS: Record<GenerationKind, string> = {
  title: "כותרות",
  thumbnail: "תמונות ממוזערות",
  description: "תיאור",
  carousel: "קרוסלות",
  quote: "ציטוטים",
  idea: "רעיונות לתוכן נוסף",
};

export const KIND_ORDER: GenerationKind[] = [
  "title",
  "thumbnail",
  "description",
  "carousel",
  "quote",
  "idea",
];

export const STAGE_LABELS: Record<JobStage, string> = {
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
