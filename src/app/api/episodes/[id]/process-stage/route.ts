import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runStage } from "@/lib/pipeline";
import type { JobStage } from "@/lib/types";

// Each pipeline stage runs as its own bounded request so a long podcast never
// exceeds the serverless function limit. The client calls this per stage and
// follows the returned `next` until it is null.
export const maxDuration = 300;

const VALID: JobStage[] = ["extract", "transcribe", "generate", "thumbnails"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { stage } = (await req.json()) as { stage: JobStage };
  if (!VALID.includes(stage)) {
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });
  }

  // Prefer a service-role worker when configured; otherwise use the user's
  // authenticated client (works fine within a single request).
  const worker = createAdminClient() ?? supabase;

  try {
    const next = await runStage(worker, id, stage);
    return NextResponse.json({ ok: true, next });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
