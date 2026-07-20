// Polls Submagic for the episode's Magic Clips project and stores finished
// clips — the local-dev path (no public webhook) and the "רענן סטטוס" button.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshSubmagic } from "@/lib/submagic-trigger";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const res = await refreshSubmagic(supabase, id);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
