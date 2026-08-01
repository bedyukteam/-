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

  // Per-episode counts for the reels/content shortcut buttons — two grouped
  // queries (id-only payload), counted into Maps. No N+1.
  const ids = list.map((e) => e.id);
  const clipCounts = new Map<string, number>();
  const ideaCounts = new Map<string, number>();
  if (ids.length) {
    const [{ data: clipRows }, { data: ideaRows }] = await Promise.all([
      supabase.from("submagic_clips").select("episode_id").in("episode_id", ids),
      supabase
        .from("generations")
        .select("episode_id")
        .in("kind", ["quote", "carousel"])
        .in("episode_id", ids),
    ]);
    for (const r of (clipRows ?? []) as { episode_id: string }[]) {
      clipCounts.set(r.episode_id, (clipCounts.get(r.episode_id) ?? 0) + 1);
    }
    for (const r of (ideaRows ?? []) as { episode_id: string }[]) {
      ideaCounts.set(r.episode_id, (ideaCounts.get(r.episode_id) ?? 0) + 1);
    }
  }

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
              <EpisodeRow
                ep={ep}
                clipsCount={clipCounts.get(ep.id) ?? 0}
                ideasCount={ideaCounts.get(ep.id) ?? 0}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
