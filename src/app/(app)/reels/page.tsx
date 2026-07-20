import { createClient } from "@/lib/supabase/server";
import ClipCard, { type ClipCardData } from "@/components/ClipCard";

export const dynamic = "force-dynamic";

interface ClipRow extends ClipCardData {
  episode_id: string;
  created_at: string;
}

export default async function ReelsPage() {
  const supabase = await createClient();

  const [{ data: clips }, { data: episodes }] = await Promise.all([
    supabase
      .from("submagic_clips")
      .select("*")
      .order("created_at", { ascending: false })
      .order("virality_total", { ascending: false }),
    supabase.from("episodes").select("id, title"),
  ]);

  const episodeTitle = new Map(
    ((episodes ?? []) as { id: string; title: string | null }[]).map((e) => [
      e.id,
      e.title ?? "פרק ללא שם",
    ]),
  );
  const rows = (clips ?? []) as ClipRow[];

  return (
    <div>
      <p className="text-muted-foreground text-sm mb-6">
        כל הרילס ש-Submagic יצר מהפרקים שלך — מהחדש לישן. צפייה מתנגנת כאן בפנים, ופרסום
        ליוטיוב כשורט — בלחיצה על &quot;🚀 פרסום ליוטיוב&quot; (כולל עריכת כותרת/תיאור ותזמון).
      </p>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted-foreground">
          עדיין אין רילס. פרסמי פרק מלא ליוטיוב (או לחצי &quot;צור רילס&quot; בעמוד פרק שכבר
          פורסם) — והם יופיעו כאן ✨
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 items-start">
          {rows.map((c) => (
            <ClipCard
              key={c.id}
              clip={c}
              episodeId={c.episode_id}
              episodeHref={`/episodes/${c.episode_id}`}
              episodeTitle={episodeTitle.get(c.episode_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
