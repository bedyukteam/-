import { SupabaseClient } from "@supabase/supabase-js";

const CANVA_DESIGN_ID = "DAHMw4fGgJ0"; // "טמפלטים למערכת תוכן פרסום אוטומטי" — see spec §2
const DESIGNS_URL = "https://api.canva.com/rest/v1/designs";
const EXPORTS_URL = "https://api.canva.com/rest/v1/exports";

// Shared starting point for a brand-new template — matches the typical values
// already in use across the 5 hand-picked templates (see plan's "codebase facts").
export const DEFAULT_RECT = { cx: 1080, cy: 486, max_w: 860, max_h: 360, side: "none", max_font_px: 100 };

export interface CoverRow {
  page_number: number;
  storage_path: string;
  cx: number;
  cy: number;
  max_w: number;
  max_h: number;
  side: string;
  max_font_px: number;
}

/** Pure: existing saved rows + the current page list from Canva → the new row set (full replace). */
export function mergeCoverRows(
  existing: CoverRow[],
  freshPageNumbers: number[],
  storagePathFor: (page: number) => string,
): CoverRow[] {
  const byPage = new Map(existing.map((r) => [r.page_number, r]));
  return freshPageNumbers.map((page) => {
    const prev = byPage.get(page);
    if (prev) return { ...prev, storage_path: storagePathFor(page) };
    return { page_number: page, storage_path: storagePathFor(page), ...DEFAULT_RECT };
  });
}

interface CanvaJob {
  id: string;
  status: "in_progress" | "success" | "failed";
  urls?: string[];
  error?: { code: string; message: string };
}

async function createExportJob(accessToken: string, pages: number[]): Promise<string> {
  const res = await fetch(EXPORTS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      design_id: CANVA_DESIGN_ID,
      format: { type: "jpg", quality: 90 },
      pages,
    }),
  });
  if (!res.ok) throw new Error(`יצירת ייצוא בקנבה נכשלה (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const { job } = (await res.json()) as { job: CanvaJob };
  return job.id;
}

async function pollExportJob(accessToken: string, jobId: string): Promise<string[]> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${EXPORTS_URL}/${jobId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`בדיקת סטטוס ייצוא נכשלה (${res.status})`);
    const { job } = (await res.json()) as { job: CanvaJob };
    if (job.status === "success") return job.urls ?? [];
    if (job.status === "failed") throw new Error(`ייצוא מקנבה נכשל: ${job.error?.message ?? "שגיאה לא ידועה"}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("ייצוא מקנבה לא הסתיים בזמן סביר (60 שניות)");
}

export async function syncCanvaTemplates(sb: SupabaseClient, accessToken: string): Promise<number> {
  const designRes = await fetch(`${DESIGNS_URL}/${CANVA_DESIGN_ID}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!designRes.ok) throw new Error(`שליפת פרטי העיצוב מקנבה נכשלה (${designRes.status})`);
  const { design } = (await designRes.json()) as { design: { page_count: number } };
  const pages = Array.from({ length: design.page_count }, (_, i) => i + 1);

  const jobId = await createExportJob(accessToken, pages);
  const urls = await pollExportJob(accessToken, jobId);
  if (urls.length !== pages.length) {
    throw new Error(`קנבה החזירה ${urls.length} תמונות במקום ${pages.length} — לא ממשיכה`);
  }

  // Download + upload every page BEFORE touching the DB — no half-broken sync.
  const uploads: { page: number; path: string }[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const imgRes = await fetch(urls[i]);
    if (!imgRes.ok) throw new Error(`הורדת עמוד ${page} מקנבה נכשלה (${imgRes.status})`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const path = `covers/bg${String(page).padStart(2, "0")}.jpg`;
    const { error } = await sb.storage.from("media").upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`העלאת עמוד ${page} ל-Storage נכשלה: ${error.message}`);
    uploads.push({ page, path });
  }

  const { data: existingRows } = await sb.from("cover_templates").select("*");
  const merged = mergeCoverRows(
    (existingRows ?? []) as CoverRow[],
    pages,
    (page) => uploads.find((u) => u.page === page)!.path,
  );

  await sb.from("cover_templates").delete().neq("page_number", -1); // clear all, full replace
  await sb.from("cover_templates").insert(merged);
  return merged.length;
}
