// Prompt builders for the content-generation engine.
// Every builder injects the social manager's written guidelines plus a few
// approved examples (in-context learning) so the house voice improves per episode.

const MAX_TRANSCRIPT_CHARS = 48000;

export interface StyleContext {
  languageGuidelines: string;
  visualGuidelines: string;
  examples: Record<string, string[]>; // kind -> approved example strings
}

function clip(transcript: string): string {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript;
  return transcript.slice(0, MAX_TRANSCRIPT_CHARS) + "\n…[התמלול קוצר]";
}

function guidelinesBlock(g: string, label: string): string {
  const t = g.trim();
  if (!t) return "";
  return `\n\n## הנחיות ${label} ממנהלת הסושיאל (חובה לכבד):\n${t}`;
}

function examplesBlock(examples: string[] | undefined, label: string): string {
  if (!examples || examples.length === 0) return "";
  const list = examples.slice(0, 6).map((e, i) => `${i + 1}. ${e}`).join("\n");
  return `\n\n## דוגמאות ${label} שאושרו בעבר (חקה את הסגנון, אל תעתיק מילולית):\n${list}`;
}

const BASE_SYSTEM =
  "את/ה כותב/ת תוכן מקצועי/ת לערוץ יוטיוב/פודקאסט בעברית. " +
  "כל הפלט בעברית תקנית, חדה ומזמינה. " +
  "כבד/י בקפדנות את הנחיות השפה והוויזואל שמספקת מנהלת הסושיאל. " +
  "החזר/י אך ורק JSON תקין לפי המבנה המבוקש, ללא טקסט נוסף.";

export function buildTitlesPrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    examplesBlock(ctx.examples.title, "כותרות");
  const user =
    `על בסיס תמלול הפרק הבא, הצע/י 5 כותרות שונות ומושכות ליוטיוב ` +
    `(עד ~70 תווים, בלי clickbait זול, מותאמות SEO וסקרנות).\n\n` +
    `החזר/י JSON: {"titles": ["...", "...", "...", "...", "..."]}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

export function buildDescriptionPrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    examplesBlock(ctx.examples.description, "תיאורים");
  const user =
    `כתוב/כתבי תיאור פרק ליוטיוב: פסקה פותחת מסקרנת (2-3 משפטים), ` +
    `ואז 4-6 נקודות "בפרק הזה תגלו" כ-bullets, וקריאה לפעולה בסוף.\n\n` +
    `החזר/י JSON: {"description": "טקסט התיאור המלא עם שורות חדשות"}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

export function buildCarouselsPrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    examplesBlock(ctx.examples.carousel, "קרוסלות");
  const user =
    `הפק/י 5 רעיונות לקרוסלה לאינסטגרם/לינקדאין על בסיס רגעים חזקים בתמלול. ` +
    `לכל קרוסלה: כותרת, ו-4 עד 6 שקופיות (כל שקופית = משפט/נקודה קצרה). השקופית האחרונה = CTA.\n\n` +
    `החזר/י JSON: {"carousels": [{"title": "...", "slides": ["שקופית 1", "שקופית 2", "..."]}, ...]}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

export function buildQuotesPrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    examplesBlock(ctx.examples.quote, "ציטוטים");
  const user =
    `בחר/י 5 ציטוטים חזקים מהתמלול ונסח/י אותם לפוסט ציטוט (קצר, חד, ניתן לשיתוף). ` +
    `שמור/י על נאמנות לרוח הדברים שנאמרו.\n\n` +
    `החזר/י JSON: {"quotes": ["...", "...", "...", "...", "..."]}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

export function buildIdeasPrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM + guidelinesBlock(ctx.languageGuidelines, "שפה");
  const user =
    `הצע/י 6 רעיונות לתוכן נוסף שאפשר להפיק מהפרק (שורטים, רילים, פוסט בלוג, ` +
    `שאלה לקהילה, סקר, ניוזלטר וכו'). לכל רעיון: תיאור קצר + פורמט מומלץ.\n\n` +
    `החזר/י JSON: {"ideas": [{"text": "...", "format": "שורט/ריל/בלוג/..."}, ...]}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

export function buildThumbnailsPrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    guidelinesBlock(ctx.visualGuidelines, "וויזואל") +
    examplesBlock(ctx.examples.thumbnail, "קונספטים לתמונה ממוזערת");
  const user =
    `הצע/י 5 קונספטים לתמונה ממוזערת (thumbnail) ליוטיוב על בסיס הפרק. ` +
    `לכל קונספט: "concept" (רעיון בקצרה), "overlay_text" (טקסט קצר 2-4 מילים לתמונה), ` +
    `ו-"visual" (תיאור ויזואלי מפורט באנגלית לצורך יצירת התמונה — צבעים, קומפוזיציה, אווירה, 16:9).\n\n` +
    `החזר/י JSON: {"thumbnails": [{"concept": "...", "overlay_text": "...", "visual": "..."}, ...]}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

/** Compose the final image-generation prompt for one thumbnail concept. */
export function buildThumbnailImagePrompt(
  visual: string,
  overlayText: string,
  visualGuidelines: string,
): string {
  const style = visualGuidelines.trim()
    ? ` Brand visual guidelines: ${visualGuidelines.trim()}.`
    : "";
  return (
    `YouTube thumbnail, 16:9, bold and high-contrast, eye-catching. ${visual}.${style} ` +
    `Leave clear space for a short Hebrew headline. ` +
    (overlayText ? `Concept headline (do not necessarily render text): "${overlayText}".` : "")
  );
}
