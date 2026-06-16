import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Persist an inline edit to a generation's content.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { content } = (await req.json()) as { content: Record<string, unknown> };
  const { error } = await supabase
    .from("generations")
    .update({ content })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
