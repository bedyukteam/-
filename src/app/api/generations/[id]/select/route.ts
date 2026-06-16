import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Approve a generation (one approved item per kind per episode). Approving also
// records the item as a style example (the in-context learning loop).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { selected } = (await req.json()) as { selected: boolean };

  const { data: gen, error } = await supabase
    .from("generations")
    .select("episode_id, kind, content")
    .eq("id", id)
    .single();
  if (error || !gen) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 500 });
  }

  if (selected) {
    // single approved item per (episode, kind)
    await supabase
      .from("generations")
      .update({ selected: false })
      .eq("episode_id", gen.episode_id)
      .eq("kind", gen.kind);
    await supabase.from("generations").update({ selected: true }).eq("id", id);

    const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
    const c = gen.content as Record<string, unknown>;
    const text = typeof c.text === "string" ? c.text : JSON.stringify(c);
    await supabase.from("style_examples").insert({
      channel_id: channelId,
      kind: gen.kind,
      content: { text },
      source_episode_id: gen.episode_id,
    });
  } else {
    await supabase.from("generations").update({ selected: false }).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
