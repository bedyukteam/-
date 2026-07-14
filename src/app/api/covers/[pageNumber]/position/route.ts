import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<{ pageNumber: string }> }) {
  const { pageNumber } = await params;
  const page = Number(pageNumber);
  if (!Number.isInteger(page)) {
    return NextResponse.json({ error: "מספר עמוד לא תקין" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cx, cy, maxFontPx } = (await req.json().catch(() => ({}))) as {
    cx?: number;
    cy?: number;
    maxFontPx?: number;
  };
  if (typeof cx !== "number" || typeof cy !== "number" || typeof maxFontPx !== "number") {
    return NextResponse.json({ error: "חסרים ערכי מיקום" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cover_templates")
    .update({ cx, cy, max_font_px: maxFontPx, updated_at: new Date().toISOString() })
    .eq("page_number", page);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
