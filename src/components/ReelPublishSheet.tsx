"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ClipCardData } from "@/components/ClipCard";

/**
 * Per-reel publish drawer: edit the generated YouTube title/description and
 * publish or schedule the reel as a Short — all without leaving the app.
 */
export default function ReelPublishSheet({
  clip,
  episodeId,
  open,
  onOpenChange,
  onChanged,
}: {
  clip: ClipCardData;
  episodeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(clip.yt_title ?? "");
  const [description, setDescription] = useState(clip.yt_description ?? "");
  const [publishAt, setPublishAt] = useState("");
  const [busy, setBusy] = useState<"" | "generate" | "save" | "publish">("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Re-sync form when a different clip opens the sheet or fresh metadata lands.
  useEffect(() => {
    setTitle(clip.yt_title ?? "");
    setDescription(clip.yt_description ?? "");
    setMsg(null);
  }, [clip.id, clip.yt_title, clip.yt_description]);

  function done() {
    router.refresh();
    onChanged?.();
  }

  async function generate() {
    if (!episodeId) return;
    setBusy("generate");
    setMsg(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/reels/metadata`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clipId: clip.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `שגיאה (${res.status})`);
      const sb = createClient();
      const { data } = await sb
        .from("submagic_clips")
        .select("yt_title, yt_description")
        .eq("id", clip.id)
        .single();
      setTitle((data?.yt_title as string) ?? "");
      setDescription((data?.yt_description as string) ?? "");
      setMsg({ kind: "ok", text: "נוצרו כותרת ותיאור חדשים ✓" });
      done();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    const sb = createClient();
    const { error } = await sb
      .from("submagic_clips")
      .update({ yt_title: title.trim() || null, yt_description: description })
      .eq("id", clip.id);
    setBusy("");
    if (error) setMsg({ kind: "err", text: "השמירה נכשלה: " + error.message });
    else {
      setMsg({ kind: "ok", text: "נשמר ✓" });
      done();
    }
  }

  async function publish(publishAtIso: string | null) {
    setBusy("publish");
    setMsg(null);
    try {
      // Persist any unsaved edits first so the route publishes what's on screen.
      const sb = createClient();
      await sb
        .from("submagic_clips")
        .update({ yt_title: title.trim() || null, yt_description: description })
        .eq("id", clip.id);
      const res = await fetch(`/api/reels/${clip.id}/youtube`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publishAt: publishAtIso }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; videoId?: string };
      if (!res.ok) throw new Error(body.error ?? `שגיאה (${res.status})`);
      setMsg({
        kind: "ok",
        text: publishAtIso ? "הריל תוזמן ליוטיוב 🕒" : "הריל פורסם כשורט ביוטיוב 🎉",
      });
      done();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  const isLive = !!clip.yt_video_id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-6 overflow-y-auto bg-surface" dir="rtl">
        <SheetHeader className="p-0">
          <SheetTitle>🚀 פרסום ריל ליוטיוב</SheetTitle>
        </SheetHeader>

        <p className="text-sm text-muted-foreground -mt-2">{clip.title ?? "קליפ"}</p>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium flex justify-between">
            <span>כותרת</span>
            <span className="text-muted-foreground">{title.length}/100</span>
          </span>
          <input
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLive}
            className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-background"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">תיאור</span>
          <textarea
            value={description}
            rows={6}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLive}
            className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-background"
          />
        </label>

        {!isLive && (
          <div className="flex gap-2 flex-wrap">
            {episodeId && (
              <button
                onClick={generate}
                disabled={!!busy}
                className="border border-border rounded-lg px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
              >
                {busy === "generate" ? "יוצרת…" : "✨ צור כותרת ותיאור"}
              </button>
            )}
            <button
              onClick={save}
              disabled={!!busy}
              className="border border-border rounded-lg px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            >
              {busy === "save" ? "שומרת…" : "💾 שמירה"}
            </button>
          </div>
        )}

        {!isLive && (
          <div className="border-t border-border pt-4 flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">תזמון (לא חובה)</span>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-background"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => publish(null)}
                disabled={!!busy || !title.trim()}
                className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {busy === "publish" ? "מעלה…" : "פרסום עכשיו"}
              </button>
              <button
                onClick={() => publish(new Date(publishAt).toISOString())}
                disabled={!!busy || !title.trim() || !publishAt}
                className="border border-border rounded-lg px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
              >
                תזמון
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              הריל יעלה כ-Short (וידאו אנכי קצר מזוהה אוטומטית ביוטיוב).
            </p>
          </div>
        )}

        {isLive && clip.yt_video_id && (
          <a
            href={`https://youtube.com/shorts/${clip.yt_video_id}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-sm"
          >
            ▶️ צפייה בשורט ביוטיוב
          </a>
        )}

        {msg && (
          <p className={`text-sm ${msg.kind === "err" ? "text-danger" : "text-muted-foreground"}`}>
            {msg.text}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
