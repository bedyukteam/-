import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ClipRow {
  id: string;
  episode_id: string;
  title: string | null;
  duration_sec: number | null;
  virality_total: number | null;
  preview_url: string | null;
  download_url: string | null;
  direct_url: string | null;
  created_at: string;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
        כל הרילס ש-Submagic יצר מהפרקים שלך — מהחדש לישן. כל קליפ מקושר לפרק שממנו נוצר;
        הפרסום לרשתות נעשה ידנית מכאן (צפייה ← הורדה ← העלאה).
      </p>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center text-muted-foreground">
          עדיין אין רילס. פרסמי פרק מלא ליוטיוב (או לחצי &quot;צור רילס&quot; בעמוד פרק שכבר
          פורסם) — והם יופיעו כאן ✨
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <li key={c.id} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-sm">{c.title ?? "קליפ"}</span>
                {c.virality_total != null && (
                  <span
                    className="shrink-0 text-xs font-bold rounded-full px-2 py-1 bg-accent/20"
                    title="ציון ויראליות"
                  >
                    🔥 {Math.round(c.virality_total)}
                  </span>
                )}
              </div>
              <Link
                href={`/episodes/${c.episode_id}`}
                className="text-xs text-muted-foreground underline truncate"
              >
                מתוך: {episodeTitle.get(c.episode_id) ?? "פרק"}
              </Link>
              <span className="text-xs text-muted-foreground">{fmtDuration(c.duration_sec)}</span>
              <div className="flex gap-3 text-sm mt-auto pt-2">
                {(c.preview_url || c.direct_url) && (
                  <a
                    href={c.preview_url ?? c.direct_url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    צפייה
                  </a>
                )}
                {c.download_url && (
                  <a href={c.download_url} target="_blank" rel="noreferrer" className="underline">
                    ⬇️ הורדה
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
