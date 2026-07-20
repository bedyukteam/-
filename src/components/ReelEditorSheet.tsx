"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClipCardData } from "@/components/ClipCard";

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

/**
 * In-app reel editor: caption words, hook title, pacing toggles and AI b-roll.
 * Saving with re-render consumes a Submagic credit — the button says so and
 * nothing exports automatically.
 */
export default function ReelEditorSheet({
  clip,
  open,
  onOpenChange,
  onChanged,
}: {
  clip: ClipCardData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [words, setWords] = useState<Word[]>([]);
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [hookText, setHookText] = useState("");
  const [hookEnabled, setHookEnabled] = useState(false);
  const [removeBadTakes, setRemoveBadTakes] = useState(false);
  const [silencePace, setSilencePace] = useState<"" | "natural" | "fast" | "extra-fast">("");
  const [brolls, setBrolls] = useState<AiBroll[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/reels/${clip.id}/edit`);
      const body = (await res.json()) as {
        error?: string;
        words?: Word[];
        hookTitle?: { text?: string } | boolean | null;
        removeBadTakes?: boolean;
      };
      if (!res.ok) throw new Error(body.error ?? `שגיאה (${res.status})`);
      setWords(body.words ?? []);
      setEdits(new Map());
      const hook = body.hookTitle;
      setHookEnabled(!!hook);
      setHookText(typeof hook === "object" && hook?.text ? hook.text : "");
      setRemoveBadTakes(!!body.removeBadTakes);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [clip.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const dirty = useMemo(
    () => edits.size > 0 || hookText.trim() !== "" || removeBadTakes || silencePace || brolls.length,
    [edits, hookText, removeBadTakes, silencePace, brolls],
  );

  function wordText(i: number): string {
    return edits.has(i) ? edits.get(i)! : words[i]?.text ?? "";
  }

  function setWordText(i: number, text: string) {
    const next = new Map(edits);
    if (text === words[i]?.text) next.delete(i);
    else next.set(i, text);
    setEdits(next);
  }

  async function saveAndExport() {
    setBusy(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = { export: true };
      if (edits.size > 0) {
        payload.words = words.map((w, i) => (edits.has(i) ? { ...w, text: edits.get(i)! } : w));
      }
      if (hookEnabled && hookText.trim()) payload.hookTitle = { text: hookText.trim().slice(0, 100) };
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
        text: "השינויים נשלחו ו-Submagic מרנדר מחדש — הקליפ יתעדכן כאן אוטומטית בעוד כמה דקות.",
      });
      router.refresh();
      onChanged?.();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function refreshExport() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reels/${clip.id}/edit/refresh`, { method: "POST" });
      const body = (await res.json()) as { exported?: boolean; status?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "");
      setMsg({
        kind: "ok",
        text: body.exported ? "הרינדור הסתיים — הקליפ עודכן ✓" : `עדיין מרנדר… (${body.status})`,
      });
      router.refresh();
      onChanged?.();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-6 overflow-y-auto bg-surface w-full sm:max-w-lg" dir="rtl">
        <SheetHeader className="p-0">
          <SheetTitle>✏️ עריכת ריל</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground -mt-2">{clip.title ?? "קליפ"}</p>

        {loading ? (
          <p className="text-sm text-muted-foreground">טוענת את פרטי הקליפ מ-Submagic…</p>
        ) : (
          <Tabs defaultValue="captions" dir="rtl">
            <TabsList>
              <TabsTrigger value="captions">כתוביות</TabsTrigger>
              <TabsTrigger value="hook">כותרת פתיחה</TabsTrigger>
              <TabsTrigger value="pace">קצב</TabsTrigger>
              <TabsTrigger value="broll">B-roll AI</TabsTrigger>
            </TabsList>

            <TabsContent value="captions" className="flex flex-col gap-1 max-h-[50vh] overflow-y-auto pt-2">
              {words.length === 0 && (
                <p className="text-sm text-muted-foreground">אין כתוביות לקליפ הזה.</p>
              )}
              {words.map((w, i) =>
                w.type === "word" ? (
                  <div key={w.id ?? i} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-12 shrink-0 text-left" dir="ltr">
                      {w.startTime.toFixed(1)}s
                    </span>
                    <input
                      value={wordText(i)}
                      onChange={(e) => setWordText(i, e.target.value)}
                      className={`flex-1 border rounded-md px-2 py-1 text-sm outline-none focus:border-accent bg-background ${
                        edits.has(i) ? "border-accent" : "border-border"
                      }`}
                    />
                  </div>
                ) : null,
              )}
              {edits.size > 0 && (
                <p className="text-xs text-muted-foreground pt-1">{edits.size} מילים שונו</p>
              )}
            </TabsContent>

            <TabsContent value="hook" className="flex flex-col gap-2 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hookEnabled}
                  onChange={(e) => setHookEnabled(e.target.checked)}
                />
                הוספת כותרת פתיחה מונפשת
              </label>
              {hookEnabled && (
                <input
                  value={hookText}
                  maxLength={100}
                  onChange={(e) => setHookText(e.target.value)}
                  placeholder="טקסט כותרת הפתיחה"
                  className="border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent bg-background"
                />
              )}
            </TabsContent>

            <TabsContent value="pace" className="flex flex-col gap-3 pt-2 text-sm">
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
                  className="border border-border rounded-lg px-3 py-2 bg-background"
                >
                  <option value="">ללא שינוי</option>
                  <option value="natural">טבעי</option>
                  <option value="fast">מהיר</option>
                  <option value="extra-fast">מהיר במיוחד</option>
                </select>
              </label>
            </TabsContent>

            <TabsContent value="broll" className="flex flex-col gap-3 pt-2 text-sm">
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
                    placeholder="מה יופיע בקטע? (פרומפט ל-AI, למשל: אישה מרימה ידיים מול שקיעה)"
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
                  setBrolls([...brolls, { type: "ai-broll", startTime: 0, endTime: 3, prompt: "" }])
                }
                className="border border-border rounded-lg px-3 py-2 hover:bg-black/5 self-start"
              >
                ➕ הוספת קטע B-roll
              </button>
              <p className="text-xs text-muted-foreground">
                כל קטע B-roll מיוצר ומחויב בנפרד ע&quot;י Submagic.
              </p>
            </TabsContent>
          </Tabs>
        )}

        <div className="border-t border-border pt-4 flex flex-col gap-2">
          <button
            onClick={saveAndExport}
            disabled={busy || loading || !dirty}
            className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "שולחת…" : "💾 שמירה ורינדור מחדש — צורך קרדיט Submagic ⚠️"}
          </button>
          {clip.download_url && (
            <button
              onClick={refreshExport}
              disabled={busy}
              className="border border-border rounded-lg px-4 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
            >
              🔄 בדיקת סטטוס רינדור
            </button>
          )}
          {msg && (
            <p className={`text-sm ${msg.kind === "err" ? "text-danger" : "text-muted-foreground"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
