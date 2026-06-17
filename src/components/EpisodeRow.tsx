"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS } from "@/lib/constants";
import type { Episode } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-green-100 text-success",
  processing: "bg-amber-100 text-warning",
  error: "bg-red-100 text-danger",
  uploaded: "bg-slate-100 text-muted",
};

export default function EpisodeRow({ ep }: { ep: Episode }) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ep.title ?? "");
  const [busy, setBusy] = useState(false);

  async function saveTitle() {
    setBusy(true);
    try {
      await supabase
        .from("episodes")
        .update({ title: title.trim() || null })
        .eq("id", ep.id);
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("למחוק את הפרק לצמיתות? כל התוכן שנוצר עבורו יימחק.")) return;
    setBusy(true);
    try {
      await supabase.from("generations").delete().eq("episode_id", ep.id);
      await supabase.from("transcripts").delete().eq("episode_id", ep.id);
      await supabase.from("jobs").delete().eq("episode_id", ep.id);
      await supabase.from("episodes").delete().eq("id", ep.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 bg-surface border border-border rounded-xl p-4">
      {editing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            dir="rtl"
            autoFocus
            placeholder="כותרת עבודה"
            className="flex-1 min-w-0 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={saveTitle}
            disabled={busy}
            className="text-sm bg-accent text-accent-foreground rounded-lg px-3 py-1.5 disabled:opacity-50"
          >
            שמור
          </button>
          <button
            onClick={() => {
              setTitle(ep.title ?? "");
              setEditing(false);
            }}
            className="text-xs text-muted hover:text-foreground"
          >
            ביטול
          </button>
        </div>
      ) : (
        <Link href={`/episodes/${ep.id}`} className="flex flex-col flex-1 min-w-0 hover:text-accent">
          <span className="font-medium truncate">
            {ep.title || ep.source_filename || "פרק ללא שם"}
          </span>
          <span className="text-xs text-muted">
            {ep.type === "short" ? "שורט" : "פרק"} ·{" "}
            {new Date(ep.created_at).toLocaleDateString("he-IL")}
          </span>
        </Link>
      )}

      {!editing && (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[ep.status] ?? STATUS_STYLE.uploaded}`}
          >
            {STATUS_LABELS[ep.status] ?? ep.status}
          </span>
          <button
            onClick={() => setEditing(true)}
            title="ערוך כותרת עבודה"
            aria-label="ערוך כותרת עבודה"
            className="text-muted hover:text-accent text-sm"
          >
            ✏️
          </button>
          <button
            onClick={remove}
            disabled={busy}
            title="מחק פרק"
            aria-label="מחק פרק"
            className="text-muted hover:text-danger text-sm disabled:opacity-50"
          >
            🗑
          </button>
        </div>
      )}
    </div>
  );
}
