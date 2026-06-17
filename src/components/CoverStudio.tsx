"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createClient } from "@/lib/supabase/client";

// Each background is one of the brand's real covers with the old title removed.
// The app renders the episode title (brand font, white) into that cover's
// navy title-zone, then exports a 1920×1080 PNG.
const COVER_W = 1920;
const COVER_H = 1080;
const FONT_FAMILY = "HeeboCover";
// Brand navy — used to erase the template's built-in photo before dropping in
// an uploaded reference image, so the old photo never peeks out behind it.
const BRAND_NAVY = "#324158";

type Cover = { file: string; cx: number; cy: number; maxW: number; maxH: number; side: string };

// The photo zone of a cover, derived from which side the host cut-out sits on.
// Covers keep the title on one side and the photo on the other, so the photo
// zone is the outer ~33% on the cut-out's side (and never the title side).
function photoRect(side: string): { x: number; y: number; w: number; h: number } {
  const w = 640;
  if (side === "left") return { x: 0, y: 0, w, h: COVER_H };
  // "right" and "none" both carry the cut-out on the right in the brand set.
  return { x: COVER_W - w, y: 0, w, h: COVER_H };
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const tentative = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(tentative).width <= maxW || !cur) cur = tentative;
    else {
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
  const prevProposed = useRef(proposedTitle);
  const [fontReady, setFontReady] = useState(false);
  const [covers, setCovers] = useState<Cover[]>([]);
  const [bgIndex, setBgIndex] = useState(0);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "approved" | "downloaded">("");

  // Uploaded reference image — replaces the template's built-in photo.
  const [refImg, setRefImg] = useState<HTMLImageElement | null>(null);
  const [refScale, setRefScale] = useState(1); // zoom on top of object-fit cover
  const [refX, setRefX] = useState(0.5); // horizontal focal point (0..1)
  const [refY, setRefY] = useState(0.35); // vertical focal point (0..1) — favour the face
  const refInputRef = useRef<HTMLInputElement>(null);

  // Cover title follows the approved/proposed title (updates when it changes).
  // Done during render (not in an effect) per the React state-from-prop pattern.
  if (proposedTitle && proposedTitle !== prevProposed.current) {
    prevProposed.current = proposedTitle;
    setTitle(proposedTitle);
  }

  // Load the brand font once.
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the background catalog; start on a random cover so the same episode
  // isn't stuck on one image, then "החלף רקע" reshuffles to another random one.
  useEffect(() => {
    let cancelled = false;
    fetch("/covers.json")
      .then((r) => r.json())
      .then((list: Cover[]) => {
        if (cancelled || !Array.isArray(list) || list.length === 0) return;
        setCovers(list);
        setBgIndex(Math.floor(Math.random() * list.length));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [episodeId]);

  // Load the selected background image.
  useEffect(() => {
    const cover = covers[bgIndex];
    if (!cover) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setBg(img);
    img.src = `/${cover.file}`;
    return () => {
      cancelled = true;
    };
  }, [covers, bgIndex]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const cover = covers[bgIndex];
    if (!canvas || !bg || !cover) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, COVER_W, COVER_H);
    ctx.drawImage(bg, 0, 0, COVER_W, COVER_H);

    // Drop the uploaded reference image into the template's photo zone.
    if (refImg) {
      const r = photoRect(cover.side);
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      // Erase the built-in host photo first so it can't show behind the upload.
      ctx.fillStyle = BRAND_NAVY;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // object-fit: cover within the zone, with user zoom + focal offset.
      const base = Math.max(r.w / refImg.width, r.h / refImg.height);
      const s = base * refScale;
      const dw = refImg.width * s;
      const dh = refImg.height * s;
      const dx = r.x + (r.w - dw) * refX;
      const dy = r.y + (r.h - dh) * refY;
      ctx.drawImage(refImg, dx, dy, dw, dh);
      ctx.restore();
    }

    const text = title.trim();
    if (!text) return;

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.direction = "rtl";

    let size = 132;
    let lines: string[] = [];
    for (; size >= 34; size -= 2) {
      ctx.font = `800 ${size}px ${FONT_FAMILY}, Heebo, sans-serif`;
      lines = wrapLines(ctx, text, cover.maxW);
      const lineH = size * 1.16;
      const totalH = lines.length * lineH;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (totalH <= cover.maxH && widest <= cover.maxW) break;
    }

    const lineH = size * 1.16;
    const totalH = lines.length * lineH;
    let y = cover.cy - totalH / 2 + lineH / 2;
    for (const line of lines) {
      ctx.fillText(line, cover.cx, y);
      y += lineH;
    }
  }, [bg, title, covers, bgIndex, refImg, refScale, refX, refY]);

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

  // Random reshuffle — pick a different cover than the current one.
  function cycleBg() {
    if (covers.length < 2) return;
    setBgIndex((i) => {
      let n = i;
      while (n === i) n = Math.floor(Math.random() * covers.length);
      return n;
    });
  }

  function onRefFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      setRefImg(img);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  function clearRef() {
    setRefImg(null);
    setRefScale(1);
    setRefX(0.5);
    setRefY(0.35);
    if (refInputRef.current) refInputRef.current.value = "";
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
        הקאבר נוצר אוטומטית מתבנית מותג עם הכותרת שהכי מתאימה לפרק. אפשר לערוך טקסט, להחליף רקע,
        להעלות תמונה משלך, להוריד, או לאשר — הקאבר המאושר הוא זה שיעלה אוטומטית עם הפרק ליוטיוב.
      </p>

      {/* Live preview (full-res 1920×1080 canvas, displayed scaled) */}
      <div className="rounded-xl overflow-hidden border border-border max-w-xl mb-3">
        <canvas
          ref={canvasRef}
          width={COVER_W}
          height={COVER_H}
          className="w-full block"
          aria-label="תצוגה מקדימה של הקאבר"
        />
      </div>

      {/* Background switcher */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={cycleBg}
          disabled={covers.length < 2}
          className="border border-border rounded-lg px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
        >
          ↻ החלף רקע
        </button>
        <span className="text-xs text-muted">
          {covers.length ? `רקע ${bgIndex + 1} מתוך ${covers.length} (אקראי בכל לחיצה)` : "טוען רקעים…"}
        </span>
      </div>

      {/* Reference image upload — replaces the template's built-in photo */}
      <div className="mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => refInputRef.current?.click()}
            className="border border-border rounded-lg px-3 py-1.5 text-sm hover:border-accent"
          >
            🖼️ העלה תמונה לקאבר
          </button>
          {refImg && (
            <button
              type="button"
              onClick={clearRef}
              className="text-xs text-muted hover:text-danger"
            >
              הסר תמונה
            </button>
          )}
          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onRefFile}
          />
          <span className="text-xs text-muted">
            {refImg
              ? "התמונה שלך הוטמעה במקום התמונה שבתבנית"
              : "אופציונלי — התמונה תיכנס במקום התמונה הקיימת בתבנית"}
          </span>
        </div>

        {refImg && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl">
            <label className="text-xs text-muted flex flex-col gap-1">
              גודל
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.05"
                value={refScale}
                onChange={(e) => setRefScale(Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-muted flex flex-col gap-1">
              מיקום אופקי
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={refX}
                onChange={(e) => setRefX(Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-muted flex flex-col gap-1">
              מיקום אנכי
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={refY}
                onChange={(e) => setRefY(Number(e.target.value))}
              />
            </label>
          </div>
        )}
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
