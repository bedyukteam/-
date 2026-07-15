// studio/src/components/analytics/labels.ts
// Hebrew labels for YouTube Analytics enum values (matching Studio's wording).

export const TRAFFIC_LABELS: Record<string, string> = {
  SHORTS: "פיד סרטונים קצרים (Shorts)",
  YT_SEARCH: "חיפוש ב-YouTube",
  YT_CHANNEL: "דפי ערוץ",
  RELATED_VIDEO: "סרטונים מוצעים",
  NOTIFICATION: "הודעות",
  SUBSCRIBER: "פיד מנויים",
  PLAYLIST: "פלייליסטים",
  YT_PLAYLIST_PAGE: "דפי פלייליסט",
  EXT_URL: "אתרים חיצוניים",
  NO_LINK_EMBEDDED: "נגן מוטמע",
  NO_LINK_OTHER: "ישיר או לא ידוע",
  END_SCREEN: "מסכי סיום",
  ANNOTATION: "הערות",
  HASHTAGS: "דפי האשטג",
  SOUND_PAGES: "דפי צליל",
  VIDEO_REMIXES: "רמיקסים",
  LIVE_REDIRECT: "הפניית שידור חי",
  YT_OTHER_PAGE: "תכונות אחרות של YouTube",
  ADVERTISING: "פרסום",
  CAMPAIGN_CARD: "כרטיסי קמפיין",
  PROMOTED: "תוכן ממומן",
  IMMERSIVE_LIVE_FEED: "פיד שידורים חיים",
  PRODUCT_PAGE: "דפי מוצר",
};

export const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "טלפון נייד",
  DESKTOP: "מחשב",
  TABLET: "טאבלט",
  TV: "טלוויזיה",
  GAME_CONSOLE: "קונסולת משחק",
  UNKNOWN_PLATFORM: "אחר",
};

export const SUBSCRIBED_LABELS: Record<string, string> = {
  SUBSCRIBED: "רשומים",
  UNSUBSCRIBED: "לא רשומים",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "גברים",
  female: "נשים",
  user_specified: "מוגדר אחרת",
};

export function ageLabel(age: string): string {
  // "age25-34" → "25–34", "age65-" → "65+"
  const t = age.replace(/^age/, "");
  return t.endsWith("-") ? `${t.slice(0, -1)}+` : t.replace("-", "–");
}

export function countryLabel(code: string): string {
  try {
    return new Intl.DisplayNames(["he"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const STUDIO_URL = "https://studio.youtube.com";

export function studioVideoUrl(videoId: string): string {
  return `${STUDIO_URL}/video/${videoId}/analytics/tab-overview/period-default`;
}
