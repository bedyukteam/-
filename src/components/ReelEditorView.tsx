"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Word {
  id?: string;
  text: string;
  type: "word" | "silence" | "punctuation";
  startTime: number;
  endTime: number;
}

interface AiBroll {
  type: "ai-broll";
  startTime: number;
  endTime: number;
  prompt: string;
}

export interface ReelEditorClip {
  id: string;
  title: string | null;
  download_url: string | null;
  direct_url: string | null;
  edit_status: string | null;
  episode_id: string;
}

/**
 * Full-page reel editor, modeled on Submagic's own editor: the reel plays on
 * one side while the transcript sits beside it — the word being spoken is
 * highlighted live, clicking a word seeks the video and opens it for editing.
 */
export default function ReelEditorView({
  clip,
  initialWords,
  initialHook,
  initialRemoveBadTakes,
  hookTemplates = [],
  loadError,
}: {
  clip: ReelEditorClip;
  initialWords: Word[];
  initialHook: { text?: string; template?: string; top?: number; size?: number } | boolean | null;
  initialRemoveBadTakes: boolean;
  hookTemplates?: string[];
  loadError: string | null;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wordRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [words] = useState<Word[]>(initialWords);
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [editing, setEditing] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const hookObj = typeof initialHook === "object" && initialHook ? initialHook : null;
  const [hookText, setHookText] = useState(hookObj?.text ?? "");
  const [hookEnabled, setHookEnabled] = useState(!!initialHook);
  const [hookTemplate, setHookTemplate] = useState(hookObj?.template ?? "tiktok");
  const [hookTop, setHookTop] = useState(hookObj?.top ?? 50);
  const [hookSize, setHookSize] = useState(hookObj?.size ?? 30);
  const [removeBadTakes, setRemoveBadTakes] = useState(initialRemoveBadTakes);
  const [silencePace, setSilencePace] = useState<"" | "natural" | "fast" | "extra-fast">("");
  const [brolls, setBrolls] = useState<AiBroll[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const videoSrc = clip.download_url ?? clip.direct_url;

  // The word currently being spoken; in gaps, the last word spoken stays lit.
  const activeIndex = useMemo(() => {
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i];
      if (w.type !== "word") continue;
      if (currentTime >= w.startTime) return i;
    }
    return -1;
  }, [words, currentTime]);

  // Follow the playhead: keep the active word in view while playing.
  useEffect(() => {
    if (!playing || activeIndex < 0) return;
    wordRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, playing]);

  // Group words into caption-like lines (new line on a long gap or every ~12 words).
  const segments = useMemo(() => {
    const segs: { start: number; indices: number[] }[] = [];
    let cur: { start: number; indices: number[] } | null = null;
    let wordCount = 0;
    let prevEnd = 0;
    words.forEach((w, i) => {
      if (w.type === "silence") return;
      const gap = w.startTime - prevEnd;
      if (!cur || gap > 0.8 || wordCount >= 12) {
        cur = { start: w.startTime, indices: [] };
        segs.push(cur);
        wordCount = 0;
      }
      cur.indices.push(i);
      if (w.type === "word") wordCount++;
      prevEnd = w.endTime;
    });
    return segs;
  }, [words]);

  const wordText = useCallback(
    (i: number) => (edits.has(i) ? edits.get(i)! : words[i]?.text ?? ""),
    [edits, words],
  );

  function commitEdit(i: number, text: string) {
    const next = new Map(edits);
    const trimmed = text.trim();
    if (!trimmed || trimmed === words[i]?.text) next.delete(i);
    else next.set(i, trimmed);
    setEdits(next);
    setEditing(null);
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, t);
  }

  const dirty =
    edits.size > 0 || (hookEnabled && hookText.trim()) || removeBadTakes || silencePace || brolls.length > 0;

  async function saveAndExport() {
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { export: true };
      if (edits.size > 0) {
        payload.words = words.map((w, i) => (edits.has(i) ? { ...w, text: edits.get(i)! } : w));
      }
      if (hookEnabled && hookText.trim()) {
        payload.hookTitle = {
          text: hookText.trim().slice(0, 100),
          template: hookTemplate,
          top: hookTop,
          size: hookSize,
        };
      }
      if (removeBadTakes) payload.removeBadTakes = true;
      if (silencePace) payload.removeSilencePace = silencePace;
      if (brolls.length) payload.items = brolls.filter((b) => b.prompt.trim());

      const res = await fetch(`/api/reels/${clip.id}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `שגיאה (${res.status})`);
      setMsg({
        kind: "ok",
        text: "נשלח! Submagic מרנדר מחדש — בדקי סטטוס בעוד כמה דקות והסרטון יתעדכן.",
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function refreshExport() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/reels/${clip.id}/edit/refresh`, { method: "POST" });
      const body = (await res.json()) as { exported?: boolean; status?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "");
      setMsg({
        kind: "ok",
        text: body.exported ? "הרינדור הסתיים — הסרטון עודכן ✓ (רעננו את הדף)" : `עדיין מרנדר… (${body.status})`,
      });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/reels" className="text-sm underline text-muted-foreground shrink-0">
            → חזרה לרילס
          </Link>
          <h1 className="font-bold truncate">✏️ {clip.title ?? "עריכת ריל"}</h1>
        </div>
        <div className="flex items-center gap-2">
          {clip.edit_status === "exporting" && (
            <button
              onClick={refreshExport}
              disabled={busy}
              className="border border-border rounded-lg px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            >
              🔄 בדיקת סטטוס רינדור
            </button>
          )}
          <button
            onClick={saveAndExport}
            disabled={busy || !dirty}
            title="השינויים נשלחים ל-Submagic והסרטון מרונדר מחדש"
            className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "שולחת…" : "💾 שמירה ורינדור מחדש — קרדיט ⚠️"}
          </button>
        </div>
      </div>
      {msg && (
        <p className={`text-sm ${msg.kind === "err" ? "text-danger" : "text-muted-foreground"}`}>
          {msg.text}
        </p>
      )}
      {loadError && (
        <p className="text-sm text-danger">טעינת הכתוביות מ-Submagic נכשלה: {loadError}</p>
      )}

      {/* Transcript (right in RTL) + video preview (left) — mirrors Submagic's editor */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <section className="bg-surface border border-border rounded-2xl p-5">
          <Tabs defaultValue="captions" dir="rtl">
            <TabsList>
              <TabsTrigger value="captions">כתוביות</TabsTrigger>
              <TabsTrigger value="hook">כותרת פתיחה</TabsTrigger>
              <TabsTrigger value="pace">קצב</TabsTrigger>
              <TabsTrigger value="broll">B-roll AI</TabsTrigger>
            </TabsList>

            <TabsContent value="captions" className="pt-3">
              <p className="text-xs text-muted-foreground mb-3">
                המילה המושמעת מודגשת בזמן הניגון. לחיצה על מילה קופצת אליה בסרטון ופותחת אותה
                לעריכה. {edits.size > 0 && <b>{edits.size} מילים שונו.</b>}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                💡 גודל/פונט/מיקום הכתוביות נקבעים ב&quot;סגנון כתוביות לרילס&quot; שבהגדרות
                ומוחלים ביצירה. כדי להחיל סגנון חדש על פרק זה — &quot;🎨 צור מחדש בסגנון
                החדש&quot; בעמוד הפרק.
              </p>
              <div className="flex flex-col gap-2 max-h-[62vh] overflow-y-auto pr-1">
                {segments.length === 0 && (
                  <p className="text-sm text-muted-foreground">אין כתוביות לקליפ הזה.</p>
                )}
                {segments.map((seg, si) => (
                  <div key={si} className="flex items-start gap-2">
                    <button
                      onClick={() => seekTo(seg.start)}
                      className="text-[10px] text-muted-foreground w-10 shrink-0 text-left pt-1.5 hover:underline"
                      dir="ltr"
                    >
                      {Math.floor(seg.start / 60)}:{String(Math.floor(seg.start % 60)).padStart(2, "0")}
                    </button>
                    <p className="flex flex-wrap gap-x-1 gap-y-1 leading-7">
                      {seg.indices.map((i) => {
                        const w = words[i];
                        if (w.type === "punctuation") {
                          return (
                            <span key={i} className="text-muted-foreground">
                              {wordText(i)}
                            </span>
                          );
                        }
                        if (editing === i) {
                          return (
                            <input
                              key={i}
                              autoFocus
                              defaultValue={wordText(i)}
                              size={Math.max(wordText(i).length, 3)}
                              onBlur={(e) => commitEdit(i, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(i, e.currentTarget.value);
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="border border-accent rounded px-1 text-sm bg-background outline-none"
                            />
                          );
                        }
                        return (
                          <button
                            key={i}
                            ref={(el) => {
                              if (el) wordRefs.current.set(i, el);
                              else wordRefs.current.delete(i);
                            }}
                            onClick={() => {
                              seekTo(w.startTime);
                              setEditing(i);
                            }}
                            className={`rounded px-0.5 transition-colors ${
                              i === activeIndex
                                ? "bg-accent text-accent-foreground font-semibold"
                                : edits.has(i)
                                  ? "bg-accent/25 underline decoration-accent"
                                  : "hover:bg-black/5"
                            }`}
                          >
                            {wordText(i)}
                          </button>
                        );
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="hook" className="flex flex-col gap-3 pt-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hookEnabled}
                  onChange={(e) => setHookEnabled(e.target.checked)}
                />
                הוספת כותרת פתיחה מונפשת
              </label>
              {hookEnabled && (
                <>
                  <input
                    value={hookText}
                    maxLength={100}
                    onChange={(e) => setHookText(e.target.value)}
                    placeholder="טקסט כותרת הפתיחה"
                    className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent bg-background"
                  />
                  {hookTemplates.length > 0 && (
                    <label className="flex flex-col gap-1">
                      <span>סגנון אנימציה</span>
                      <select
                        value={hookTemplate}
                        onChange={(e) => setHookTemplate(e.target.value)}
                        className="border border-border rounded-lg px-3 py-2 bg-background w-56"
                      >
                        {hookTemplates.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between w-64">
                      <span>מיקום אנכי</span>
                      <span className="text-muted-foreground">{hookTop}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={hookTop}
                      onChange={(e) => setHookTop(+e.target.value)}
                      className="w-64 accent-[var(--accent,#F2DA06)]"
                    />
                    <span className="text-xs text-muted-foreground">
                      0 = למעלה, 80 = למטה
                    </span>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between w-64">
                      <span>גודל טקסט</span>
                      <span className="text-muted-foreground">{hookSize}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      value={hookSize}
                      onChange={(e) => setHookSize(+e.target.value)}
                      className="w-64 accent-[var(--accent,#F2DA06)]"
                    />
                  </label>
                </>
              )}
            </TabsContent>

            <TabsContent value="pace" className="flex flex-col gap-3 pt-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={removeBadTakes}
                  onChange={(e) => setRemoveBadTakes(e.target.checked)}
                />
                הסרת טייקים חלשים (AI)
              </label>
              <label className="flex flex-col gap-1">
                <span>קיצור שתיקות</span>
                <select
                  value={silencePace}
                  onChange={(e) => setSilencePace(e.target.value as typeof silencePace)}
                  className="border border-border rounded-lg px-3 py-2 bg-background w-56"
                >
                  <option value="">ללא שינוי</option>
                  <option value="natural">טבעי</option>
                  <option value="fast">מהיר</option>
                  <option value="extra-fast">מהיר במיוחד</option>
                </select>
              </label>
            </TabsContent>

            <TabsContent value="broll" className="flex flex-col gap-3 pt-3 text-sm">
              {brolls.map((b, i) => (
                <div key={i} className="border border-border rounded-lg p-3 flex flex-col gap-2">
                  <div className="flex gap-2 items-center" dir="ltr">
                    <input
                      type="number"
                      min={0}
                      value={b.startTime}
                      onChange={(e) =>
                        setBrolls(brolls.map((x, j) => (j === i ? { ...x, startTime: +e.target.value } : x)))
                      }
                      className="w-20 border border-border rounded-md px-2 py-1 bg-background"
                    />
                    <span>→</span>
                    <input
                      type="number"
                      min={0}
                      value={b.endTime}
                      onChange={(e) =>
                        setBrolls(brolls.map((x, j) => (j === i ? { ...x, endTime: +e.target.value } : x)))
                      }
                      className="w-20 border border-border rounded-md px-2 py-1 bg-background"
                    />
                    <span className="text-muted-foreground text-xs">שניות</span>
                  </div>
                  <textarea
                    value={b.prompt}
                    rows={2}
                    placeholder="מה יופיע בקטע? (פרומפט ל-AI)"
                    onChange={(e) =>
                      setBrolls(brolls.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))
                    }
                    className="border border-border rounded-lg px-2 py-1 bg-background"
                  />
                  <button
                    onClick={() => setBrolls(brolls.filter((_, j) => j !== i))}
                    className="text-danger text-xs underline self-start"
                  >
                    הסרה
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setBrolls([...brolls, { type: "ai-broll", startTime: Math.round(currentTime), endTime: Math.round(currentTime) + 3, prompt: "" }])
                }
                className="border border-border rounded-lg px-3 py-2 hover:bg-black/5 self-start"
              >
                ➕ הוספת קטע B-roll בנקודה הנוכחית
              </button>
              <p className="text-xs text-muted-foreground">כל קטע B-roll מיוצר ומחויב בנפרד.</p>
            </TabsContent>
          </Tabs>
        </section>

        {/* Video preview — sticky so it stays visible while scrolling the transcript */}
        <aside className="lg:sticky lg:top-20">
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              playsInline
              preload="metadata"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              className="w-full rounded-2xl bg-black aspect-[9/16] object-contain border border-border"
            />
          ) : (
            <p className="text-sm text-muted-foreground">אין קובץ וידאו לקליפ.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
