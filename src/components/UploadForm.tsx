"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import type { EpisodeType, InputMode } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const COMPRESS_OVER_BYTES = 45 * 1024 * 1024;

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

const PART_SIZE = 32 * 1024 * 1024;

const MODES: { key: InputMode; label: string }[] = [
  { key: "video", label: "פרק וידאו מלא" },
  { key: "transcript", label: "הדבקת תמלול" },
  { key: "audio", label: "קובץ אודיו" },
];

export default function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<InputMode>("video");
  const [type, setType] = useState<EpisodeType>("episode");
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<"compress" | "upload" | "process" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string> {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    const path = `uploads/${crypto.randomUUID()}/${safeName(file.name)}`;
    await new Promise<void>((resolve, reject) => {
      const up = new tus.Upload(file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: "media",
          objectName: path,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        onError: reject,
        onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
        onSuccess: () => resolve(),
      });
      up.findPreviousUploads().then((prev) => {
        if (prev.length) up.resumeFromPreviousUpload(prev[0]);
        up.start();
      });
    });
    return path;
  }

  async function uploadVideoToR2(file: File): Promise<string> {
    const post = async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/upload/r2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאת העלאה");
      return json;
    };
    const { key, uploadId } = await post({
      action: "create",
      filename: file.name,
      contentType: file.type || "video/mp4",
    });
    const parts: { ETag: string; PartNumber: number }[] = [];
    const total = Math.ceil(file.size / PART_SIZE);
    try {
      for (let i = 0; i < total; i++) {
        const blob = file.slice(i * PART_SIZE, Math.min((i + 1) * PART_SIZE, file.size));
        const { url } = await post({ action: "sign-part", key, uploadId, partNumber: i + 1 });
        let etag = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetch(url, { method: "PUT", body: blob });
          if (r.ok) {
            etag = r.headers.get("ETag") ?? "";
            break;
          }
          if (attempt === 2) throw new Error(`העלאת חלק ${i + 1}/${total} נכשלה (${r.status})`);
        }
        if (!etag) throw new Error("חסר ETag מ-R2 — בדקי שהוגדר CORS עם ExposeHeaders: ETag");
        parts.push({ ETag: etag, PartNumber: i + 1 });
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      await post({ action: "complete", key, uploadId, parts });
      return key;
    } catch (e) {
      await post({ action: "abort", key, uploadId }).catch(() => {});
      throw e;
    }
  }

  async function createEpisode(payload: Record<string, unknown>) {
    const res = await fetch("/api/episodes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, title, ...payload }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "שגיאה ביצירת הפרק");
    router.push(`/episodes/${json.id}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "transcript") {
        if (transcript.trim().length < 40) {
          throw new Error("הדביקי תמלול ארוך יותר (לפחות כמה משפטים).");
        }
        setStage("process");
        await createEpisode({ transcript_text: transcript, input_mode: "transcript" });
        return;
      }

      if (mode === "video") {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("בחרי קובץ וידאו.");
        setStage("upload");
        setProgress(0);
        const video_key = await uploadVideoToR2(file);
        setStage("process");
        await createEpisode({
          video_key,
          video_size: file.size,
          source_filename: file.name,
          input_mode: "video",
        });
        return;
      }

      // audio
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error("בחרי קובץ אודיו.");
      let toUpload = file;
      if (file.size > COMPRESS_OVER_BYTES) {
        setStage("compress");
        setProgress(0);
        const { compressToAudio } = await import("@/lib/compress");
        toUpload = await compressToAudio(file, (r) => setProgress(Math.round(r * 100)));
        if (toUpload.size > 49 * 1024 * 1024) {
          throw new Error("גם אחרי דחיסה הקובץ מעל 50MB. נסי קובץ קצר יותר או הדביקי תמלול.");
        }
      }
      setStage("upload");
      setProgress(0);
      const source_path = await upload(toUpload);
      setStage("process");
      await createEpisode({ source_path, source_filename: toUpload.name });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setStage(null);
      setProgress(null);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4"
    >
      <h2 className="font-bold text-lg">פרק חדש</h2>

      {/* input mode */}
      <div className="flex gap-1 bg-surface-2 rounded-lg p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
              mode === m.key ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* episode / short */}
      <div className="flex gap-2">
        {(["episode", "short"] as EpisodeType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium border transition ${
              type === t
                ? "bg-accent-soft border-accent text-foreground font-semibold"
                : "border-border text-muted hover:border-accent"
            }`}
          >
            {t === "episode" ? "פרק (פודקאסט)" : "שורט"}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">כותרת עבודה (לא חובה)</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="למשל: פרק 12 — ראיון עם…"
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {mode === "video" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">קובץ הפרק המלא (וידאו)</span>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-2 file:font-medium"
          />
          <span className="text-xs text-muted">
            הקובץ עולה לאחסון ענן, המערכת מחלצת ממנו אודיו ותמלול — ובסוף מפרסמת אותו ליוטיוב.
          </span>
        </label>
      )}

      {mode === "transcript" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">תמלול הפרק</span>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={8}
            placeholder="הדביקי כאן את התמלול מ-Veed…"
            className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-sm leading-relaxed"
          />
          <span className="text-xs text-muted">
            הדרך המהירה: ב-Veed מסמנים את התמלול, מעתיקים (Cmd+C) ומדביקים כאן.
          </span>
        </label>
      )}

      {mode === "audio" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">קובץ אודיו/וידאו</span>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,video/*"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-2 file:font-medium"
          />
          <span className="text-xs text-muted">
            קבצים מעל ~45MB נדחסים אוטומטית בדפדפן לפני ההעלאה.
          </span>
        </label>
      )}

      {progress !== null && (
        <div className="flex flex-col gap-1">
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted">
            {stage === "compress"
              ? progress === 0
                ? "טוען מנוע דחיסה…"
                : `מכווץ אודיו בדפדפן… ${progress}%`
              : `מעלה… ${progress}%`}
          </span>
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="bg-accent text-accent-foreground rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {busy ? "מעבד…" : "צור חבילת תוכן"}
      </button>
    </form>
  );
}
