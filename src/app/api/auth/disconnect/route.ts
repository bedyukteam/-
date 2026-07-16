// studio/src/app/api/auth/disconnect/route.ts
// Removes a stored OAuth connection so the user can re-run the consent flow
// (e.g. after adding a new scope) or revoke access entirely.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PROVIDERS = new Set(["youtube", "canva"]);

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { provider } = (await req.json().catch(() => ({}))) as { provider?: string };
  if (!provider || !PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "ספק לא מוכר" }, { status: 400 });
  }

  const { error } = await supabase.from("oauth_tokens").delete().eq("provider", provider);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
