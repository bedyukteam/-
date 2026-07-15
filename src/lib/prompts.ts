// Prompt builders for the content-generation engine.
// Every builder injects the social manager's written guidelines plus a few
// approved examples (in-context learning) so the house voice improves per episode.

const MAX_TRANSCRIPT_CHARS = 32000;

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

/**
 * Shorts get a different description brief than full podcast episodes: a short
 * video needs a hooky 2-4 sentence blurb, hashtags, and several CTA variants
 * that push viewers to more content on the channel — not "בפרק הזה תגלו" bullets.
 */
const SHORT_DESCRIPTIONS_SPEC =
  `"descriptions": [3 גרסאות תיאור לשורט ביוטיוב. כל גרסה: 2-4 משפטים קצרים וקליטים שנפתחים בוו מסקרן ` +
  `(בלי רשימת 'בפרק הזה תגלו'), 2-3 האשטגים רלוונטיים בעברית + #Shorts בסוף, ` +
  `וכל גרסה מסתיימת בהנעה-לפעולה שונה לראות עוד תוכן בעמוד — למשל: לצפות בפרק המלא, לעקוב אחרי הערוץ, לצפות בעוד שורטס בנושא]`;

/**
 * One consolidated call that produces the whole content package — avoids the
 * per-minute token limit you hit when running 6 generations in parallel.
 */
export function buildAllContentPrompt(
  transcript: string,
  ctx: StyleContext,
  episodeType?: string | null,
) {
  const isShort = episodeType === "short";
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    guidelinesBlock(ctx.visualGuidelines, "וויזואל") +
    examplesBlock(ctx.examples.title, "כותרות") +
    examplesBlock(ctx.examples.thumbnail_title, "כותרות לתמונה") +
    examplesBlock(ctx.examples.description, "תיאורים") +
    examplesBlock(ctx.examples.carousel, "קרוסלות") +
    examplesBlock(ctx.examples.quote, "ציטוטים");
  const descriptionSpec = isShort
    ? SHORT_DESCRIPTIONS_SPEC
    : `"description": "תיאור פרק: פסקה פותחת מסקרנת + 4-6 נקודות 'בפרק הזה תגלו' + קריאה לפעולה (שורות חדשות)"`;
  const user =
    (isShort
      ? `על בסיס תמלול השורט (סרטון יוטיוב קצר), הפק/י חבילת תוכן מלאה בעברית. החזר/י JSON יחיד בלבד במבנה:\n`
      : `על בסיס תמלול הפרק, הפק/י חבילת תוכן מלאה בעברית. החזר/י JSON יחיד בלבד במבנה:\n`) +
    `{\n` +
    (isShort
      ? `  "titles": [5 כותרות לשורט, קצרות וקליטות עד ~50 תווים, וו חזק שמושך צפייה מיידית],\n`
      : `  "titles": [5 כותרות לפרק, עד ~70 תווים, מסקרנות ולא clickbait זול],\n`) +
    `  "thumbnail_titles": [5 כותרות קצרות מאוד לתמונה הממוזערת, 2-4 מילים],\n` +
    `  ${descriptionSpec},\n` +
    `  "carousels": [5 פריטים {"title": "...", "slides": ["שקופית קצרה", ... 4-6 סה""כ, האחרונה CTA]}],\n` +
    `  "quotes": [5 ציטוטים חזקים מהתמלול, מנוסחים לפוסט קצר וניתן לשיתוף],\n` +
    `  "ideas": [6 פריטים {"text": "רעיון לתוכן נוסף", "format": "שורט/ריל/בלוג/סקר/..."}],\n` +
    `  "thumbnails": [5 פריטים {"concept": "רעיון בקצרה", "overlay_text": "טקסט קצר 2-4 מילים", "visual": "תיאור ויזואלי מפורט באנגלית, 16:9, ניגודיות גבוהה"}]\n` +
    `}\n\n### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

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

export function buildThumbnailTitlePrompt(transcript: string, ctx: StyleContext) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    guidelinesBlock(ctx.visualGuidelines, "וויזואל") +
    examplesBlock(ctx.examples.thumbnail_title, "כותרות לתמונה ממוזערת");
  const user =
    `הצע/י 5 **כותרות לתמונה הממוזערת** (overlay text): טקסט קצר מאוד וקולע, ` +
    `2-4 מילים, גדול וקריא על תמונה, שמסקרן ומושך קליק. שונה מכותרת הפרק המלאה.\n\n` +
    `החזר/י JSON: {"thumbnail_titles": ["...", "...", "...", "...", "..."]}\n\n` +
    `### תמלול:\n${clip(transcript)}`;
  return { system, user };
}

export function buildDescriptionPrompt(
  transcript: string,
  ctx: StyleContext,
  episodeType?: string | null,
) {
  const system =
    BASE_SYSTEM +
    guidelinesBlock(ctx.languageGuidelines, "שפה") +
    examplesBlock(ctx.examples.description, "תיאורים");
  const user =
    episodeType === "short"
      ? `כתוב/כתבי תיאורים לשורט ביוטיוב (סרטון קצר). החזר/י JSON:\n` +
        `{${SHORT_DESCRIPTIONS_SPEC}}\n\n` +
        `### תמלול:\n${clip(transcript)}`
      : `כתוב/כתבי תיאור פרק ליוטיוב: פסקה פותחת מסקרנת (2-3 משפטים), ` +
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
