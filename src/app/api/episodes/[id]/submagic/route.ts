// Manual "צור רילס" / retry trigger for an episode that's already on YouTube
// (published through the system, scheduled-then-live, or imported by channel sync).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerSubmagic } from "@/lib/submagic-trigger";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const res = await triggerSubmagic(supabase, id, new URL(req.url).origin);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
