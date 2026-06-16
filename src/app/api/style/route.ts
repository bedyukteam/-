import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Save the channel's language + visual guidelines (the "teach" screen).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { language_guidelines, visual_guidelines } = (await req.json()) as {
    language_guidelines: string;
    visual_guidelines: string;
  };
  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;

  const { error } = await supabase
    .from("style_profiles")
    .update({
      language_guidelines: language_guidelines ?? "",
      visual_guidelines: visual_guidelines ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("channel_id", channelId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
