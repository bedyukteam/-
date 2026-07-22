import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EpisodeRow from "@/components/EpisodeRow";
import type { Episode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
  const { data: episodes } = await supabase
    .from("episodes")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });

  const list = (episodes ?? []) as Episode[];

  return (
    <section className="max-w-3xl">
      {list.length === 0 ? (
        <p className="text-muted-foreground text-sm bg-card border border-border rounded-2xl p-6">
          עדיין אין פרקים.{" "}
          <Link href="/new" className="underline font-medium">
            העלי פרק ראשון
          </Link>{" "}
          כדי להתחיל ✨
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((ep) => (
            <li key={ep.id}>
              <EpisodeRow ep={ep} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
