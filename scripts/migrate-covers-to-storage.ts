// studio/scripts/migrate-covers-to-storage.ts
// One-time: move the 5 hand-picked covers.json templates into Supabase Storage + cover_templates.
import { readFile } from "fs/promises";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const PAGE_BY_FILE: Record<string, number> = {
  "bg01.jpg": 1,
  "bg06.jpg": 6,
  "bg08.jpg": 8,
  "bg16.jpg": 16,
  "bg22.jpg": 22,
};

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const publicDir = join(__dirname, "..", "public");
  const covers = JSON.parse(await readFile(join(publicDir, "covers.json"), "utf-8")) as {
    file: string;
    cx: number;
    cy: number;
    maxW: number;
    maxH: number;
    side: string;
  }[];

  for (const c of covers) {
    const filename = c.file.split("/").pop()!;
    const page = PAGE_BY_FILE[filename];
    if (!page) throw new Error(`אין מיפוי עמוד עבור ${filename} — עדכני PAGE_BY_FILE בקובץ הזה`);

    const bytes = await readFile(join(publicDir, c.file));
    const storagePath = `covers/bg${String(page).padStart(2, "0")}.jpg`;
    const { error: upErr } = await sb.storage
      .from("media")
      .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error(`העלאת ${filename} נכשלה: ${upErr.message}`);

    const { error: dbErr } = await sb.from("cover_templates").upsert({
      page_number: page,
      storage_path: storagePath,
      cx: c.cx,
      cy: c.cy,
      max_w: c.maxW,
      max_h: c.maxH,
      side: c.side,
      max_font_px: 100,
      updated_at: new Date().toISOString(),
    });
    if (dbErr) throw new Error(`כתיבת DB עבור עמוד ${page} נכשלה: ${dbErr.message}`);
    console.log(`✓ עמוד ${page} (${filename}) → ${storagePath}`);
  }
  console.log("הושלם — 5 תבניות עברו ל-Storage + cover_templates.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
