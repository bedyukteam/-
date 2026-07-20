"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

interface ClipRow {
  id: string;
  title: string | null;
  duration_sec: number | null;
  virality_total: number | null;
  preview_url: string | null;
  download_url: string | null;
  direct_url: string | null;
  status: string | null;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * "שורטס/רילס (Submagic)" — per-episode clips card. Shown for full episodes
 * that have a published YouTube video; clips arrive via webhook (production)
 * or the refresh button (local dev / impatience).
 */
export default function SubmagicPanel({
  episodeId,
  youtubeVideoId,
  supabase,
}: {
  episodeId: string;
  youtubeVideoId: string | null;
  supabase: SupabaseClient;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: ep }, { data: rows }] = await Promise.all([
      supabase
        .from("episodes")
        .select("submagic_project_id, submagic_status")
        .eq("id", episodeId)
        .single(),
      supabase
        .from("submagic_clips")
        .select("*")
        .eq("episode_id", episodeId)
        .order("virality_total", { ascending: false }),
    ]);
    setProjectId((ep?.submagic_project_id as string | null) ?? null);
    setStatus((ep?.submagic_status as string | null) ?? null);
    setClips((rows as ClipRow[]) ?? []);
  }, [supabase, episodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function callApi(path: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setMsg(body.error ?? `שגיאה (${res.status})`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!youtubeVideoId) return null; // reels need a published YouTube video first

  return (
    <section className="bg-surface border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold text-lg">🎬 שורטס/רילס (Submagic)</h2>
        <div className="flex gap-2">
          {(!projectId || status === "error") && (
            <button
              onClick={() => callApi(`/api/episodes/${episodeId}/submagic`)}
              disabled={busy}
              className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "שולחת…" : status === "error" ? "נסה שוב" : "צור רילס"}
            </button>
          )}
          {projectId && (
            <button
              onClick={() => callApi(`/api/episodes/${episodeId}/submagic/refresh`)}
              disabled={busy}
              className="border border-border rounded-lg px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            >
              🔄 רענן סטטוס
            </button>
          )}
        </div>
      </div>

      {status === "processing" && (
        <p className="text-sm text-muted mt-3">
          Submagic מעבד את הפרק… זה לוקח בדרך-כלל כמה דקות. אפשר לרענן סטטוס או פשוט לחזור מאוחר
          יותר.
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-danger mt-3">יצירת הרילס נכשלה — אפשר לנסות שוב.</p>
      )}
      {msg && <p className="text-sm text-danger mt-3">{msg}</p>}

      {clips.length > 0 && (
        <ul className="grid gap-3 mt-4 sm:grid-cols-2">
          {clips.map((c) => (
            <li key={c.id} className="border border-border rounded-xl p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-sm">{c.title ?? "קליפ"}</span>
                {c.virality_total != null && (
                  <span
                    className="shrink-0 text-xs font-bold rounded-full px-2 py-1 bg-accent/20"
                    title="ציון ויראליות"
                  >
                    🔥 {Math.round(c.virality_total)}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted">{fmtDuration(c.duration_sec)}</span>
              <div className="flex gap-3 text-sm mt-1">
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

      {!projectId && (
        <p className="text-sm text-muted mt-3">
          עוד לא נוצרו רילס לפרק הזה. לחיצה על &quot;צור רילס&quot; תשלח את הפרק ל-Submagic (קרדיט
          Magic Clips אחד).
        </p>
      )}
    </section>
  );
}
