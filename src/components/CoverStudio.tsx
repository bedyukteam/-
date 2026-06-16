"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createClient } from "@/lib/supabase/client";

// Master cover background (logo + tagline + host photo, NO title) lives in /public.
// We render the episode title over it in the brand font, on the navy zone.
const COVER_W = 1920;
const COVER_H = 1080;
// Title zone in master-image coordinates: the navy area, left of the host photo.
const ZONE = { cx: 1010, top: 300, bottom: 615, maxW: 600 };
const MASTER_SRC = "/cover-master.png";
const FONT_FAMILY = "HeeboCover";

// Greedy word-wrap that fits each line within maxW at the current ctx.font.
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tentative = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(tentative).width <= maxW || !cur) {
      cur = tentative;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export default function CoverStudio({
  episodeId,
  proposedTitle,
  titleOptions,
  thumbnailPath,
  supabase,
  onChange,
}: {
  episodeId: string;
  proposedTitle: string;
  titleOptions: string[];
  thumbnailPath: string | null;
  supabase: ReturnType<typeof createClient>;
  onChange: () => Promise<void> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [title, setTitle] = useState(proposedTitle);
  const [fontReady, setFontReady] = useState(false);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "approved" | "downloaded">("");

  // The cover title follows the approved/proposed title: whenever the approved
  // thumbnail-title changes (e.g. the user approves a different one), the cover
  // regenerates to match. Manual edits persist between approvals because the
  // 3s polling re-renders don't change this value (effect only fires on change).
  useEffect(() => {
    if (proposedTitle) setTitle(proposedTitle);
  }, [proposedTitle]);

  // Load the brand font + master background once.
  useEffect(() => {
    let cancelled = false;
    const font = new FontFace(FONT_FAMILY, "url(/fonts/heebo-800.woff2)", { weight: "800" });
    font
      .load()
      .then((f) => {
        if (cancelled) return;
        document.fonts.add(f);
        setFontReady(true);
      })
      .catch(() => !cancelled && setFontReady(true));

    const img = new Image();
    img.onload = () => !cancelled && setBg(img);
    img.src = MASTER_SRC;
    return () => {
      cancelled = true;
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, COVER_W, COVER_H);
    ctx.drawImage(bg, 0, 0, COVER_W, COVER_H);

    const text = title.trim();
    if (!text) return;

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";

    const zoneH = ZONE.bottom - ZONE.top;
    let size = 132;
    let lines: string[] = [];
    for (; size >= 38; size -= 2) {
      ctx.font = `800 ${size}px ${FONT_FAMILY}, Heebo, sans-serif`;
      lines = wrapLines(ctx, text, ZONE.maxW);
      const lineH = size * 1.16;
      const totalH = lines.length * lineH;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (totalH <= zoneH && widest <= ZONE.maxW) break;
    }

    const lineH = size * 1.16;
    const totalH = lines.length * lineH;
    const cy = (ZONE.top + ZONE.bottom) / 2;
    let y = cy - totalH / 2 + lineH / 2;
    for (const line of lines) {
      ctx.fillText(line, ZONE.cx, y);
      y += lineH;
    }
  }, [bg, title]);

  useEffect(() => {
    if (fontReady) draw();
  }, [draw, fontReady]);

  function toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) return reject(new Error("no canvas"));
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
  }

  async function onDownload() {
    const blob = await toBlob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cover-${title.trim().slice(0, 30) || episodeId}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDone("downloaded");
    setTimeout(() => setDone(""), 1500);
  }

  async function onApprove() {
    setBusy(true);
    try {
      const blob = await toBlob();
      const path = `thumbnails/${episodeId}/cover-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("media")
        .upload(path, blob, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      await supabase.from("episodes").update({ thumbnail_path: path }).eq("id", episodeId);
      await onChange();
      setDone("approved");
      setTimeout(() => setDone(""), 2500);
    } finally {
      setBusy(false);
    }
  }

  const isApproved = !!thumbnailPath;

  return (
    <section className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-bold">תמונה ממוזערת — קאבר אוטומטי</h3>
        {isApproved && (
          <span className="text-xs text-success font-semibold">✓ קאבר מאושר לפרק</span>
        )}
      </div>
      <p className="text-sm text-muted mb-4">
        הקאבר נוצר אוטומטית עם הכותרת שהכי מתאימה לפרק. אפשר לערוך את הטקסט, להוריד, או לאשר —
        הקאבר המאושר הוא זה שיעלה אוטומטית עם הפרק ליוטיוב.
      </p>

      {/* Live preview (full-res 1920×1080 canvas, displayed scaled) */}
      <div className="rounded-xl overflow-hidden border border-border max-w-xl mb-4">
        <canvas
          ref={canvasRef}
          width={COVER_W}
          height={COVER_H}
          className="w-full block"
          aria-label="תצוגה מקדימה של הקאבר"
        />
      </div>

      {/* Edit: free text */}
      <label className="block text-sm font-semibold mb-1">כותרת הקאבר (עריכה חופשית)</label>
      <textarea
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        rows={2}
        dir="rtl"
        placeholder="כתבי כאן כל טקסט — הקאבר יתעדכן מיד בפונט של המותג"
        className="w-full bg-surface-2 border border-border rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-accent mb-2"
      />

      {/* Quick-pick from the proposed thumbnail titles */}
      {titleOptions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {titleOptions.map((opt, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setTitle(opt)}
              className={`text-xs rounded-full px-3 py-1 border transition ${
                title.trim() === opt.trim()
                  ? "bg-accent-soft border-accent text-foreground"
                  : "border-border text-muted hover:border-accent"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={onApprove}
          disabled={busy || !title.trim()}
          className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "מאשרת…" : "✓ אשרי קאבר זה"}
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!title.trim()}
          className="border border-border rounded-lg px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          ⬇ הורדה
        </button>
        {done === "approved" && (
          <span className="text-sm text-success font-semibold">
            הקאבר אושר ויעלה אוטומטית עם הפרק ✓
          </span>
        )}
        {done === "downloaded" && <span className="text-sm text-muted">הקובץ הורד ✓</span>}
      </div>
    </section>
  );
}
