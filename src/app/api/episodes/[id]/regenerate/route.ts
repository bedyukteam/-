import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createTokenClient } from "@/lib/supabase/admin";
import { regenerateKind } from "@/lib/pipeline";
import type { GenerationKind } from "@/lib/types";

export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { kind, feedback } = (await req.json()) as {
    kind: GenerationKind;
    feedback?: string;
  };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const worker =
    createAdminClient() ??
    (session?.access_token ? createTokenClient(session.access_token) : null);
  if (!worker) return NextResponse.json({ error: "no worker" }, { status: 500 });

  try {
    await regenerateKind(worker, id, kind, feedback);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
