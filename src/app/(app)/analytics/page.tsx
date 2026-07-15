import { createClient } from "@/lib/supabase/server";
import AnalyticsView, { type AnalyticsEpisode } from "@/components/AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = await createClient();

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, title, type, created_at, youtube_video_id, spotify_stats")
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-extrabold mb-2 text-on-navy">אנליטיקס</h1>
      <p className="text-muted-on-navy text-sm mb-6">
        ביצועי הפרקים והשורטים — נתוני יוטיוב נשלפים חיים לכל פרק שפורסם, ונתוני ספוטיפיי
        מתעדכנים מהעלאת CSV ידנית (לפודקאסטים).
      </p>
      <AnalyticsView episodes={(episodes ?? []) as AnalyticsEpisode[]} />
    </div>
  );
}
