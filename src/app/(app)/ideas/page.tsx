import { createClient } from "@/lib/supabase/server";
import IdeasView, { type IdeasEpisode } from "@/components/IdeasView";
import type { Generation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ episode?: string }>;
}) {
  const { episode: initialEpisodeId } = await searchParams;
  const supabase = await createClient();

  const [{ data: episodes }, { data: generations }] = await Promise.all([
    supabase
      .from("episodes")
      .select("id, title, type, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("generations")
      .select("*")
      .in("kind", ["quote", "carousel", "idea"])
      .order("created_at"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2 text-foreground">רעיונות לתוכן</h1>
      <p className="text-muted-foreground text-sm mb-6">
        ציטוטים, קרוסלות ורעיונות לתוכן נוסף שנוצרו מהתמלול של כל פרק ושורט — מסודרים לפי
        הפרק שממנו נוצרו. סימון ★ שומר פריט כדוגמה ללמידת הסגנון.
      </p>
      <IdeasView
        episodes={(episodes ?? []) as IdeasEpisode[]}
        generations={(generations ?? []) as Generation[]}
        initialEpisodeId={initialEpisodeId}
      />
    </div>
  );
}
