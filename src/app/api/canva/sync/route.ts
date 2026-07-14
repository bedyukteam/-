import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidCanvaToken } from "@/lib/canva-token";
import { syncCanvaTemplates } from "@/lib/canva-sync";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const accessToken = await getValidCanvaToken(supabase);
    const count = await syncCanvaTemplates(supabase, accessToken);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
