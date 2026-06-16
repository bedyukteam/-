"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import type { EpisodeType } from "@/lib/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

export default function UploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<EpisodeType>("episode");
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
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
        headers: {
          authorization: `Bearer ${token}`,
          "x-upsert": "true",
        },
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const source_path = await upload(file);
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          source_path,
          source_filename: file.name,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה ביצירת הפרק");
      router.push(`/episodes/${json.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4"
    >
      <h2 className="font-bold text-lg">העלאת פרק חדש</h2>

      <div className="flex gap-2">
        {(["episode", "short"] as EpisodeType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium border transition ${
              type === t
                ? "bg-accent-soft border-accent text-accent"
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

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">קובץ אודיו/וידאו</span>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*"
          required
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:text-accent file:px-3 file:py-2 file:font-medium"
        />
        <span className="text-xs text-muted">
          ל-MVP: קובץ אודיו עד 24MB מתומלל ישירות. פרק וידאו כבד — בהמשך (חילוץ אודיו אוטומטי).
        </span>
      </label>

      {progress !== null && (
        <div className="flex flex-col gap-1">
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted">
            {progress < 100 ? `מעלה… ${progress}%` : "מעבד את הפרק…"}
          </span>
        </div>
      )}

      {error && <p className="text-danger text-sm">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="bg-accent text-accent-foreground rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {busy ? "מעלה…" : "העלאה והפקה"}
      </button>
    </form>
  );
}
