"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CoverStudio from "@/components/CoverStudio";
import { KIND_LABELS, KIND_ORDER, STAGE_LABELS, isPublishReady, requiredKindsFor } from "@/lib/constants";
import PublishPanel from "@/components/PublishPanel";
import type { Generation, GenerationKind, Job, JobStage, Transcript } from "@/lib/types";

const TERMINAL = new Set(["ready"]);

// Next stage to auto-run (skips stages already running or errored).
function nextAuto(jobs: Job[], needsExtract: boolean): JobStage | null {
  const s = (st: JobStage) => jobs.find((j) => j.stage === st)?.status;
  if (needsExtract) {
    const e = s("extract");
    if (!e) return "extract";
    if (e !== "done") return null;
  }
  const t = s("transcribe");
  if (!t) return "transcribe";
  if (t !== "done") return null;
  const g = s("generate");
  if (!g) return "generate";
  return null;
}

// First stage that is not done yet (used by the manual "continue/retry" button).
function nextForce(jobs: Job[], needsExtract: boolean): JobStage | null {
  const s = (st: JobStage) => jobs.find((j) => j.stage === st)?.status;
  if (needsExtract && s("extract") !== "done") return "extract";
  if (s("transcribe") !== "done") return "transcribe";
  if (s("generate") !== "done") return "generate";
  return null;
}

export default function EpisodeView({
  episodeId,
  initialStatus,
}: {
  episodeId: string;
  initialStatus: string;
}) {
  const supabase = useRef(createClient()).current;
  const [status, setStatus] = useState(initialStatus);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [gens, setGens] = useState<Generation[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [busyKind, setBusyKind] = useState<GenerationKind | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  const [episodeType, setEpisodeType] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState<number | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<string | null>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeUploadedBytes, setYoutubeUploadedBytes] = useState(0);
  const [canvaUrl, setCanvaUrl] = useState("");
  const drivingRef = useRef(false);

  // A video episode needs extract while its video is in R2 and no extract job succeeded.
  const needsExtract = !!videoKey && jobs.find((j) => j.stage === "extract")?.status !== "done";

  const load = useCallback(async () => {
    const [{ data: ep }, { data: j }, { data: tr }, { data: g }] = await Promise.all([
      supabase
        .from("episodes")
        .select(
          "status, type, thumbnail_path, video_key, video_size, youtube_status, youtube_video_id, youtube_error, youtube_uploaded_bytes",
        )
        .eq("id", episodeId)
        .single(),
      supabase.from("jobs").select("*").eq("episode_id", episodeId).order("created_at"),
      supabase.from("transcripts").select("*").eq("episode_id", episodeId).maybeSingle(),
      supabase.from("generations").select("*").eq("episode_id", episodeId).order("created_at"),
    ]);
    if (ep) {
      setStatus(ep.status);
      setThumbnailPath((ep as { thumbnail_path: string | null }).thumbnail_path ?? null);
      setVideoKey((ep as { video_key: string | null }).video_key ?? null);
      setEpisodeType((ep as { type: string | null }).type ?? null);
      setVideoSize((ep as { video_size: number | null }).video_size ?? null);
      setYoutubeStatus((ep as { youtube_status: string | null }).youtube_status ?? null);
      setYoutubeVideoId((ep as { youtube_video_id: string | null }).youtube_video_id ?? null);
      setYoutubeError((ep as { youtube_error: string | null }).youtube_error ?? null);
      setYoutubeUploadedBytes((ep as { youtube_uploaded_bytes: number }).youtube_uploaded_bytes ?? 0);
    }
    setJobs((j ?? []) as Job[]);
    setTranscript((tr as Transcript) ?? null);
    const gg = (g ?? []) as Generation[];
    setGens(gg);
    setLoaded(true);

    const thumbs = gg.filter((x) => x.kind === "thumbnail" && x.image_path);
    if (thumbs.length) {
      const entries = await Promise.all(
        thumbs.map(async (x) => {
          const { data } = await supabase.storage
            .from("media")
            .createSignedUrl(x.image_path as string, 3600);
          return [x.id, data?.signedUrl ?? ""] as const;
        }),
      );
      setThumbUrls(Object.fromEntries(entries.filter(([, u]) => u)));
    }
  }, [episodeId, supabase]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      setStatus((s) => {
        if (!TERMINAL.has(s)) load();
        return s;
      });
    }, 3000);
    return () => clearInterval(t);
  }, [load]);

  // Fetch the channel's Canva covers link once.
  useEffect(() => {
    supabase
      .from("style_profiles")
      .select("canva_covers_url")
      .eq("channel_id", process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.canva_covers_url) setCanvaUrl(data.canva_covers_url);
      });
  }, [supabase]);

  // Drive the pipeline one bounded request per stage, following `next` until done.
  const driveChain = useCallback(
    async (startStage: JobStage | null) => {
      if (!startStage || drivingRef.current) return;
      drivingRef.current = true;
      try {
        let stage: JobStage | null = startStage;
        while (stage) {
          const res = await fetch(`/api/episodes/${episodeId}/process-stage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stage }),
          });
          const json: { ok?: boolean; next?: JobStage | null } = await res
            .json()
            .catch(() => ({ ok: false }));
          await load();
          if (!json.ok) break;
          stage = json.next ?? null;
        }
      } finally {
        drivingRef.current = false;
      }
    },
    [episodeId, load],
  );

  // Auto-start / auto-resume processing (but pause on errors for manual retry).
  // Gated on `loaded` so it never fires with the empty initial jobs state.
  useEffect(() => {
    if (!loaded) return;
    if (status === "ready") return;
    if (jobs.some((j) => j.status === "error")) return;
    const start = nextAuto(jobs, needsExtract);
    if (start) driveChain(start);
  }, [loaded, jobs, status, driveChain, needsExtract]);

  async function regenerate(kind: GenerationKind, feedback?: string) {
    setBusyKind(kind);
    try {
      await fetch(`/api/episodes/${episodeId}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, feedback }),
      });
      await load();
    } finally {
      setBusyKind(null);
    }
  }

  async function toggleSelect(gen: Generation) {
    const next = !gen.selected;
    setGens((gs) => gs.map((g) => (g.id === gen.id ? { ...g, selected: next } : g)));
    await fetch(`/api/generations/${gen.id}/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selected: next }),
    });
  }

  async function saveEdit(gen: Generation, content: Record<string, unknown>) {
    setGens((gs) => gs.map((g) => (g.id === gen.id ? { ...g, content } : g)));
    const res = await fetch(`/api/generations/${gen.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    }).catch(() => null);
    if (!res?.ok) {
      alert("שמירת העריכה נכשלה — הטקסט חזר לגרסה הקודמת. נסי שוב.");
      await load();
    }
  }

  const byKind = (k: GenerationKind) => gens.filter((g) => g.kind === k);
  const errored = jobs.find((j) => j.status === "error");
  const processing = status !== "ready" && !errored;
  const approvedThumbTitle =
    (gens.find((g) => g.kind === "thumbnail_title" && g.selected)?.content as
      | { text?: string }
      | undefined)?.text ?? "";
  const thumbTitleOptions = gens
    .filter((g) => g.kind === "thumbnail_title")
    .map((g) => (g.content as { text?: string } | undefined)?.text ?? "")
    .filter(Boolean);
  const chosenTitle =
    (gens.find((g) => g.kind === "title" && g.selected)?.content as { text?: string } | undefined)
      ?.text ?? "";
  // "Most suitable" cover title: approved thumbnail-title → first proposed → chosen episode title.
  const proposedCoverTitle = approvedThumbTitle || thumbTitleOptions[0] || chosenTitle;

  return (
    <div className="flex flex-col gap-6">
      <StatusTimeline
        jobs={jobs}
        processing={processing}
        withExtract={needsExtract || jobs.some((j) => j.stage === "extract")}
      />

      {gens.length > 0 && (
        <ApprovalBar gens={gens} thumbnailReady={!!thumbnailPath} episodeType={episodeType} />
      )}

      {gens.length > 0 && (
        <PublishPanel
          episodeId={episodeId}
          locked={!isPublishReady(gens, !!thumbnailPath, episodeType)}
          hasVideo={!!videoKey || youtubeStatus === "published" || youtubeStatus === "scheduled"}
          youtubeStatus={youtubeStatus}
          youtubeVideoId={youtubeVideoId}
          youtubeError={youtubeError}
          uploadedBytes={youtubeUploadedBytes}
          totalBytes={videoSize ?? 0}
          onChange={load}
        />
      )}

      {/* Shorts don't use a custom thumbnail — the cover/Canva panels are podcast-only. */}
      {gens.length > 0 && episodeType !== "short" && (
        <CoverStudio
          episodeId={episodeId}
          proposedTitle={proposedCoverTitle}
          titleOptions={thumbTitleOptions}
          thumbnailPath={thumbnailPath}
          supabase={supabase}
          onChange={load}
        />
      )}

      {gens.length > 0 && episodeType !== "short" && (
        <FinalThumbnailPanel
          episodeId={episodeId}
          canvaUrl={canvaUrl}
          approvedTitle={approvedThumbTitle}
          thumbnailPath={thumbnailPath}
          supabase={supabase}
          onChange={load}
        />
      )}

      {errored && (
        <div className="bg-red-50 border border-red-200 text-destructive rounded-xl p-4 text-sm flex items-center justify-between gap-3">
          <span>
            <strong>שגיאה בשלב {STAGE_LABELS[errored.stage]}:</strong> {errored.error}
          </span>
          <button
            onClick={() => driveChain(nextForce(jobs, needsExtract))}
            className="shrink-0 bg-destructive text-destructive-foreground rounded-lg px-3 py-1.5 text-sm hover:opacity-90"
          >
            נסה שוב
          </button>
        </div>
      )}

      {status !== "ready" && !errored && jobs.length > 0 && (
        <button
          onClick={() => driveChain(nextForce(jobs, needsExtract))}
          className="self-start text-sm text-muted-foreground hover:text-primary"
        >
          ▶︎ המשך עיבוד ידנית (אם נתקע)
        </button>
      )}

      {gens.length === 0 && processing && (
        <p className="text-muted-foreground text-sm">⏳ מעבד את הפרק… התוצרים יופיעו כאן אוטומטית.</p>
      )}

      {KIND_ORDER.map((kind) => {
        // AI thumbnail images are superseded by the cover studio — hide that section.
        if (kind === "thumbnail") return null;
        // Quotes/carousels/ideas live on the dedicated "רעיונות לתוכן" page — not part of publishing.
        if (kind === "carousel" || kind === "quote" || kind === "idea") return null;
        // Shorts have no custom thumbnail — cover-title options are podcast-only.
        if (kind === "thumbnail_title" && episodeType === "short") return null;
        const items = byKind(kind);
        if (items.length === 0) return null;
        return (
          <Section
            key={kind}
            kind={kind}
            items={items}
            thumbUrls={thumbUrls}
            busy={busyKind === kind}
            onRegenerate={regenerate}
            onToggleSelect={toggleSelect}
            onSaveEdit={saveEdit}
          />
        );
      })}

      {gens.some((g) => g.kind === "carousel" || g.kind === "quote" || g.kind === "idea") && (
        <a
          href={`/ideas?episode=${episodeId}`}
          className="bg-card border border-border rounded-2xl p-4 text-sm font-medium hover:border-primary transition flex items-center justify-between"
        >
          <span>💡 רעיונות לתוכן מהפרק הזה — ציטוטים, קרוסלות ורעיונות</span>
          <span className="text-primary">פתיחה ←</span>
        </a>
      )}

      {transcript && <TranscriptBlock transcript={transcript} />}
    </div>
  );
}

/* ---------- status timeline ---------- */
function StatusTimeline({
  jobs,
  processing,
  withExtract,
}: {
  jobs: Job[];
  processing: boolean;
  withExtract: boolean;
}) {
  const stages: { key: string; label: string }[] = [
    ...(withExtract ? [{ key: "extract", label: STAGE_LABELS.extract }] : []),
    { key: "transcribe", label: STAGE_LABELS.transcribe },
    { key: "generate", label: STAGE_LABELS.generate },
  ];
  const statusOf = (k: string) => jobs.find((j) => j.stage === k)?.status;
  const icon = (s?: string) =>
    s === "done" ? "✅" : s === "running" ? "⏳" : s === "error" ? "❌" : "○";
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-wrap gap-4 items-center">
      {stages.map((st) => (
        <div key={st.key} className="flex items-center gap-2 text-sm">
          <span>{icon(statusOf(st.key))}</span>
          <span className={statusOf(st.key) === "running" ? "text-primary font-medium" : ""}>
            {st.label}
          </span>
        </div>
      ))}
      {processing && <span className="text-xs text-muted-foreground">מתעדכן אוטומטית…</span>}
    </div>
  );
}

/* ---------- section ---------- */
function Section({
  kind,
  items,
  thumbUrls,
  busy,
  onRegenerate,
  onToggleSelect,
  onSaveEdit,
}: {
  kind: GenerationKind;
  items: Generation[];
  thumbUrls: Record<string, string>;
  busy: boolean;
  onRegenerate: (k: GenerationKind, fb?: string) => void;
  onToggleSelect: (g: Generation) => void;
  onSaveEdit: (g: Generation, c: Record<string, unknown>) => void;
}) {
  const [fbOpen, setFbOpen] = useState(false);
  const [fb, setFb] = useState("");

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">{KIND_LABELS[kind]}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFbOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            רענון עם הערה
          </button>
          <button
            onClick={() => onRegenerate(kind)}
            disabled={busy}
            className="text-sm border border-border rounded-lg px-3 py-1.5 hover:border-primary disabled:opacity-50 transition"
          >
            {busy ? "מרענן…" : "🔄 רענן"}
          </button>
        </div>
      </div>

      {fbOpen && (
        <div className="mb-3 flex gap-2">
          <input
            value={fb}
            onChange={(e) => setFb(e.target.value)}
            placeholder="מה לשפר? (למשל: קצר יותר, פחות שיווקי, יותר הומור)"
            className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-ring"
          />
          <button
            onClick={() => {
              onRegenerate(kind, fb);
              setFbOpen(false);
              setFb("");
            }}
            disabled={busy}
            className="bg-brand text-brand-foreground rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
          >
            שלח
          </button>
        </div>
      )}

      <div className={kind === "thumbnail" ? "grid sm:grid-cols-2 gap-3" : "flex flex-col gap-2"}>
        {items.map((g) =>
          kind === "thumbnail" ? (
            <ThumbnailCard key={g.id} gen={g} url={thumbUrls[g.id]} onToggleSelect={onToggleSelect} />
          ) : kind === "carousel" ? (
            <CarouselCard key={g.id} gen={g} onToggleSelect={onToggleSelect} />
          ) : (
            <TextItem key={g.id} gen={g} editable={kind !== "idea"} onToggleSelect={onToggleSelect} onSaveEdit={onSaveEdit} />
          ),
        )}
      </div>
    </section>
  );
}

/* ---------- item renderers ---------- */
function SelectStar({ gen, onToggleSelect }: { gen: Generation; onToggleSelect: (g: Generation) => void }) {
  return (
    <button
      onClick={() => onToggleSelect(gen)}
      title={gen.selected ? "מאושר (נשמר ללמידה)" : "אשר פריט זה"}
      className={`shrink-0 text-xs rounded-md px-2.5 py-1 border font-medium transition ${
        gen.selected
          ? "bg-success text-white border-success"
          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
      }`}
    >
      {gen.selected ? "✓ מאושר" : "אשר"}
    </button>
  );
}

function ApprovalBar({
  gens,
  thumbnailReady,
  episodeType,
}: {
  gens: Generation[];
  thumbnailReady: boolean;
  episodeType: string | null;
}) {
  const required = requiredKindsFor(episodeType);
  const isApproved = (k: GenerationKind) =>
    k === "thumbnail" ? thumbnailReady : gens.some((g) => g.kind === k && g.selected);
  const done = required.filter(isApproved).length;
  const allDone = isPublishReady(gens, thumbnailReady, episodeType);
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-sm">{allDone ? "✓ מוכן לפרסום" : "מה צריך לאשר לפני פרסום"}</span>
        <span className="text-xs text-muted-foreground">
          {done}/{required.length} אושרו
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {required.map((k) => (
          <span
            key={k}
            className={`text-xs flex items-center gap-1 ${isApproved(k) ? "text-success font-medium" : "text-muted-foreground"}`}
          >
            {isApproved(k) ? "✓" : "○"} {KIND_LABELS[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

function FinalThumbnailPanel({
  episodeId,
  canvaUrl,
  approvedTitle,
  thumbnailPath,
  supabase,
  onChange,
}: {
  episodeId: string;
  canvaUrl: string;
  approvedTitle: string;
  thumbnailPath: string | null;
  supabase: ReturnType<typeof createClient>;
  onChange: () => Promise<void> | void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!thumbnailPath) {
      setUrl("");
      return;
    }
    supabase.storage
      .from("media")
      .createSignedUrl(thumbnailPath, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? ""));
  }, [thumbnailPath, supabase]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const ext = (f.name.split(".").pop() || "png").toLowerCase();
      const path = `thumbnails/${episodeId}/final-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("media")
        .upload(path, f, { upsert: true, contentType: f.type || "image/png" });
      if (error) throw error;
      await supabase.from("episodes").update({ thumbnail_path: path }).eq("id", episodeId);
      await onChange();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteThumb() {
    if (!thumbnailPath) return;
    if (!window.confirm("למחוק את התמונה הממוזערת? אפשר יהיה לאשר קאבר חדש או להעלות אחר.")) return;
    setBusy(true);
    try {
      await supabase.storage
        .from("media")
        .remove([thumbnailPath])
        .catch(() => {});
      await supabase.from("episodes").update({ thumbnail_path: null }).eq("id", episodeId);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <h3 className="font-bold mb-1">חלופה ידנית — Canva / העלאת קובץ</h3>
      <p className="text-xs text-muted-foreground mb-3">
        רק אם רוצים קאבר שונה מהאוטומטי: עורכים ב-Canva ומעלים PNG. גם זה ידרוס את הקאבר שיעלה ליוטיוב.
      </p>

      {approvedTitle ? (
        <div className="bg-muted rounded-lg p-3 mb-3 flex items-center justify-between gap-2">
          <span className="text-sm">
            כותרת מאושרת לתמונה: <b>{approvedTitle}</b>
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(approvedTitle);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="shrink-0 text-xs text-muted-foreground hover:text-primary"
          >
            {copied ? "הועתק ✓" : "העתק"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-3">
          אשרי קודם כותרת ב״כותרות לתמונה הממוזערת״, ואז העתיקי אותה לקאבר.
        </p>
      )}

      <div className="flex flex-wrap gap-2 items-center mb-3">
        {canvaUrl && (
          <a
            href={canvaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            🎨 פתח את הקאברים ב-Canva
          </a>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="border border-border rounded-lg px-4 py-2 text-sm hover:border-primary disabled:opacity-50"
        >
          {busy ? "מעלה…" : thumbnailPath ? "החלף תמונה" : "העלה תמונה ממוזערת סופית"}
        </button>
        {thumbnailPath && (
          <button
            type="button"
            onClick={deleteThumb}
            disabled={busy}
            className="border border-border rounded-lg px-4 py-2 text-sm text-destructive hover:border-danger disabled:opacity-50"
          >
            🗑 מחק תמונה
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      </div>

      {url && (
        <div className="rounded-xl overflow-hidden border border-border max-w-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="תמונה ממוזערת סופית" className="w-full" />
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2">
        פותחים את הקאברים → בוחרים קאבר → מדביקים את הכותרת בפונט הקיים → מייצאים PNG → מעלים כאן.
      </p>
    </section>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="shrink-0 text-xs text-muted-foreground hover:text-primary"
    >
      {done ? "הועתק ✓" : "העתק"}
    </button>
  );
}

export function TextItem({
  gen,
  editable,
  onToggleSelect,
  onSaveEdit,
}: {
  gen: Generation;
  editable: boolean;
  onToggleSelect: (g: Generation) => void;
  onSaveEdit: (g: Generation, c: Record<string, unknown>) => void;
}) {
  const text = (gen.content.text as string) ?? "";
  const format = gen.content.format as string | undefined;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(text);

  return (
    <div className={`rounded-xl border p-3 flex gap-3 ${gen.selected ? "border-primary bg-brand-soft" : "border-border"}`}>
      <SelectStar gen={gen} onToggleSelect={onToggleSelect} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            rows={Math.max(2, Math.ceil(val.length / 60))}
            className="w-full border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-ring"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{text}</p>
        )}
        {format && <span className="inline-block mt-1 text-[11px] bg-slate-100 text-muted-foreground rounded px-1.5 py-0.5">{format}</span>}
      </div>
      <div className="flex flex-col items-end gap-1">
        <CopyBtn text={text} />
        {editable &&
          (editing ? (
            <button
              onClick={() => {
                onSaveEdit(gen, { ...gen.content, text: val });
                setEditing(false);
              }}
              className="text-xs text-primary"
            >
              שמור
            </button>
          ) : (
            <button onClick={() => setEditing(true)} className="text-xs text-muted-foreground hover:text-primary">
              ערוך
            </button>
          ))}
      </div>
    </div>
  );
}

export function CarouselCard({ gen, onToggleSelect }: { gen: Generation; onToggleSelect: (g: Generation) => void }) {
  const title = (gen.content.title as string) ?? "";
  const slides = (gen.content.slides as string[]) ?? [];
  const copyText = [title, ...slides.map((s, i) => `${i + 1}. ${s}`)].join("\n");
  return (
    <div className={`rounded-xl border p-3 flex gap-3 ${gen.selected ? "border-primary bg-brand-soft" : "border-border"}`}>
      <SelectStar gen={gen} onToggleSelect={onToggleSelect} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm mb-1">{title}</p>
        <ol className="list-decimal pr-4 text-sm text-muted-foreground flex flex-col gap-0.5">
          {slides.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      <CopyBtn text={copyText} />
    </div>
  );
}

function ThumbnailCard({
  gen,
  url,
  onToggleSelect,
}: {
  gen: Generation;
  url?: string;
  onToggleSelect: (g: Generation) => void;
}) {
  const concept = (gen.content.concept as string) ?? "";
  const overlay = (gen.content.overlay_text as string) ?? "";
  return (
    <div className={`rounded-xl border overflow-hidden ${gen.selected ? "border-primary" : "border-border"}`}>
      <div className="aspect-video bg-slate-100 grid place-items-center text-muted-foreground text-xs relative">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={concept} className="w-full h-full object-cover" />
        ) : (
          <span>⏳ מייצר תמונה…</span>
        )}
        {overlay && (
          <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[11px] px-1.5 py-0.5 rounded">
            {overlay}
          </span>
        )}
      </div>
      <div className="p-3 flex items-start justify-between gap-2">
        <p className="text-sm flex-1">{concept}</p>
        <div className="flex flex-col items-end gap-1">
          <SelectStar gen={gen} onToggleSelect={onToggleSelect} />
          <CopyBtn text={`${concept}\n${overlay}`} />
        </div>
      </div>
    </div>
  );
}

function TranscriptBlock({ transcript }: { transcript: Transcript }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <button onClick={() => setOpen((v) => !v)} className="font-bold flex items-center gap-2">
        תמלול מלא {open ? "▲" : "▼"}
      </button>
      {open && (
        <p className="mt-3 text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground max-h-96 overflow-y-auto">
          {transcript.text}
        </p>
      )}
    </section>
  );
}
