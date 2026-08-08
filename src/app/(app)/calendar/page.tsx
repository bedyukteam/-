// Weekly content calendar: everything published/scheduled across networks —
// YouTube episodes, Spotify (podcast feed), YouTube Shorts (reels), and
// Instagram/Facebook/TikTok (social_publishes). Days are bucketed in
// Asia/Jerusalem explicitly (the server runs UTC).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TZ = "Asia/Jerusalem";
const DAY_MS = 86_400_000;

type Platform = "youtube" | "spotify" | "instagram" | "facebook" | "tiktok";

interface CalEvent {
  at: string; // ISO instant
  platform: Platform;
  label: string;
  href: string;
  published: boolean;
}

const PLATFORM_STYLE: Record<Platform, { name: string; solid: string; outline: string }> = {
  youtube: {
    name: "יוטיוב",
    solid: "bg-red-600 text-white",
    outline: "border border-red-600 text-red-700",
  },
  spotify: {
    name: "ספוטיפיי",
    solid: "bg-green-600 text-white",
    outline: "border border-green-600 text-green-700",
  },
  instagram: {
    name: "אינסטגרם",
    solid: "bg-pink-600 text-white",
    outline: "border border-pink-600 text-pink-700",
  },
  facebook: {
    name: "פייסבוק",
    solid: "bg-blue-600 text-white",
    outline: "border border-blue-600 text-blue-700",
  },
  tiktok: {
    name: "טיקטוק",
    solid: "bg-slate-700 text-white",
    outline: "border border-slate-600 text-slate-700",
  },
};

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Calendar date (YYYY-MM-DD) of an instant, in Asia/Jerusalem. */
function ymdInTz(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

function timeInTz(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Day arithmetic on plain YYYY-MM-DD strings (noon UTC dodges DST edges). */
function addDays(ymd: string, n: number): string {
  return new Date(new Date(`${ymd}T12:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Sunday of the week containing the given calendar date. */
function weekStart(ymd: string): string {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return addDays(ymd, -dow);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const nowIso = new Date().toISOString();
  const todayYmd = ymdInTz(nowIso);
  const start = weekStart(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayYmd);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  // Query a padded UTC window and bucket precisely by Jerusalem date below.
  const fromIso = new Date(`${addDays(start, -1)}T00:00:00Z`).toISOString();
  const toIso = new Date(`${addDays(start, 8)}T00:00:00Z`).toISOString();

  const supabase = await createClient();
  const [epsYt, epsSp, clips, socials] = await Promise.all([
    supabase
      .from("episodes")
      .select("id, title, title_chosen, publish_at, youtube_status")
      .not("publish_at", "is", null)
      .gte("publish_at", fromIso)
      .lt("publish_at", toIso),
    supabase
      .from("episodes")
      .select("id, title, title_chosen, spotify_published_at")
      .not("spotify_published_at", "is", null)
      .gte("spotify_published_at", fromIso)
      .lt("spotify_published_at", toIso),
    supabase
      .from("submagic_clips")
      .select("id, episode_id, title, yt_publish_at, yt_status")
      .not("yt_publish_at", "is", null)
      .gte("yt_publish_at", fromIso)
      .lt("yt_publish_at", toIso),
    supabase
      .from("social_publishes")
      .select("id, source_type, source_id, platform, caption, status, scheduled_at, published_at")
      .or(
        `and(scheduled_at.gte.${fromIso},scheduled_at.lt.${toIso}),and(published_at.gte.${fromIso},published_at.lt.${toIso})`,
      ),
  ]);

  const nowMs = Date.parse(nowIso);
  const events: CalEvent[] = [];

  for (const e of epsYt.data ?? []) {
    events.push({
      at: e.publish_at as string,
      platform: "youtube",
      label: (e.title_chosen as string | null) || (e.title as string | null) || "פרק",
      href: `/episodes/${e.id}`,
      published: e.youtube_status === "published",
    });
  }
  for (const e of epsSp.data ?? []) {
    events.push({
      at: e.spotify_published_at as string,
      platform: "spotify",
      label: (e.title_chosen as string | null) || (e.title as string | null) || "פרק",
      href: `/episodes/${e.id}`,
      published: Date.parse(e.spotify_published_at as string) <= nowMs,
    });
  }
  for (const c of clips.data ?? []) {
    events.push({
      at: c.yt_publish_at as string,
      platform: "youtube",
      label: `🎬 ${(c.title as string | null) ?? "רילס"}`,
      href: `/reels?episode=${c.episode_id}`,
      published: c.yt_status === "published",
    });
  }
  for (const s of socials.data ?? []) {
    const at = (s.published_at ?? s.scheduled_at) as string | null;
    if (!at) continue;
    events.push({
      at,
      platform: s.platform as Platform,
      label: ((s.caption as string | null) ?? "").slice(0, 40) || "פרסום",
      href: s.source_type === "reel" ? "/reels" : "/reels",
      published: s.status === "published",
    });
  }

  const byDay = new Map<string, CalEvent[]>();
  for (const ev of events) {
    const d = ymdInTz(ev.at);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(ev);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.at.localeCompare(b.at));

  const fmtRange = `${new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(
    new Date(`${start}T12:00:00Z`),
  )} – ${new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric" }).format(
    new Date(`${addDays(start, 6)}T12:00:00Z`),
  )}`;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-muted-foreground text-sm">
          כל מה שמפורסם ומתוזמן השבוע, מכל הרשתות — מתוזמן במסגרת, פורסם במילוי.
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/calendar?week=${addDays(start, -7)}`}
            className="border border-border rounded-lg px-3 py-1.5 hover:border-primary"
          >
            → שבוע קודם
          </Link>
          <Link href="/calendar" className="border border-border rounded-lg px-3 py-1.5 hover:border-primary">
            היום
          </Link>
          <Link
            href={`/calendar?week=${addDays(start, 7)}`}
            className="border border-border rounded-lg px-3 py-1.5 hover:border-primary"
          >
            שבוע הבא ←
          </Link>
          <span className="text-xs text-muted-foreground mr-2">{fmtRange}</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 items-start">
        {days.map((d, i) => {
          const isToday = d === todayYmd;
          const list = byDay.get(d) ?? [];
          return (
            <div
              key={d}
              className={`rounded-xl border p-2 min-h-40 flex flex-col gap-1.5 ${
                isToday ? "border-primary bg-brand-soft/40" : "border-border bg-card"
              }`}
            >
              <div className="text-xs font-semibold flex items-center justify-between">
                <span>{WEEKDAYS[i]}</span>
                <span className={isToday ? "text-primary" : "text-muted-foreground"}>
                  {new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(
                    new Date(`${d}T12:00:00Z`),
                  )}
                </span>
              </div>
              {list.map((ev, j) => {
                const st = PLATFORM_STYLE[ev.platform];
                return (
                  <Link
                    key={j}
                    href={ev.href}
                    title={`${st.name} · ${timeInTz(ev.at)} · ${ev.label}`}
                    className={`rounded-lg px-2 py-1 text-[11px] leading-tight hover:opacity-80 transition ${
                      ev.published ? st.solid : `${st.outline} bg-transparent`
                    }`}
                  >
                    <span className="font-semibold">{timeInTz(ev.at)}</span>{" "}
                    <span className="line-clamp-2">{ev.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-4 flex-wrap text-xs text-muted-foreground">
        <span>מקרא:</span>
        {(Object.keys(PLATFORM_STYLE) as Platform[]).map((p) => (
          <span key={p} className={`rounded-full px-2 py-0.5 ${PLATFORM_STYLE[p].solid}`}>
            {PLATFORM_STYLE[p].name}
          </span>
        ))}
      </div>
    </div>
  );
}
