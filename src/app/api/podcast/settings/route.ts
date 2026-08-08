// Save the show-level podcast settings (single-row podcast_settings table).
// NOTE: /api/podcast/* is public in the middleware (for the feed) — so this
// route enforces its own auth explicitly.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "שם התוכנית חובה" }, { status: 400 });
  }

  const { error } = await supabase.from("podcast_settings").upsert(
    {
      id: true,
      title: (body.title as string).trim(),
      description: typeof body.description === "string" ? body.description : "",
      author: typeof body.author === "string" ? body.author : "",
      owner_email: typeof body.owner_email === "string" && body.owner_email ? body.owner_email : null,
      category: typeof body.category === "string" && body.category ? body.category : "Society & Culture",
      explicit: !!body.explicit,
      site_url: typeof body.site_url === "string" && body.site_url ? body.site_url : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
