"use client";

// Show-level podcast metadata for the self-hosted RSS feed (podcast_settings
// single-row table) + square artwork upload into the public R2 bucket.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface PodcastSettings {
  title: string;
  description: string;
  author: string;
  owner_email: string | null;
  category: string;
  explicit: boolean;
  artwork_key: string | null;
  site_url: string | null;
}

const APPLE_CATEGORIES = [
  "Society & Culture",
  "Education",
  "Business",
  "Health & Fitness",
  "Religion & Spirituality",
  "Arts",
];

export default function PodcastSettingsPanel({
  initial,
  artworkUrl,
  feedUrl,
}: {
  initial: PodcastSettings | null;
  artworkUrl: string | null;
  feedUrl: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<PodcastSettings>(
    initial ?? {
      title: "",
      description: "",
      author: "",
      owner_email: null,
      category: "Society & Culture",
      explicit: false,
      artwork_key: null,
      site_url: null,
    },
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/podcast/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(body.error ? `שגיאה: ${body.error}` : "נשמר ✓");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function uploadArtwork(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      // Client-side sanity: podcast artwork must be square and ≥1400px.
      const img = await createImageBitmap(file);
      if (img.width !== img.height) {
        setMsg("שגיאה: התמונה חייבת להיות ריבועית (1:1)");
        return;
      }
      if (img.width < 1400) {
        setMsg("שגיאה: מינימום 1400×1400 פיקסלים (מומלץ 3000×3000)");
        return;
      }
      const res = await fetch("/api/podcast/settings/artwork", {
        method: "POST",
        headers: { "content-type": file.type || "image/jpeg" },
        body: file,
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(body.error ? `שגיאה: ${body.error}` : "התמונה הועלתה ✓");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm bg-background";

  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-4">
      <h3 className="font-bold">🎙️ פודקאסט (פיד RSS לספוטיפיי)</h3>
      <p className="text-xs text-muted-foreground">
        הפרטים כאן מרכיבים את פיד ה-RSS של התוכנית. כתובת הפיד:{" "}
        <a href={feedUrl} target="_blank" rel="noreferrer" className="underline" dir="ltr">
          {feedUrl}
        </a>
      </p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">שם התוכנית</span>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">תיאור התוכנית</span>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className={input}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">מגישה/מחבר</span>
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">אימייל בעלים</span>
          <input
            value={form.owner_email ?? ""}
            onChange={(e) => setForm({ ...form, owner_email: e.target.value || null })}
            dir="ltr"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">קטגוריה</span>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={input}
          >
            {APPLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">אתר (אופציונלי)</span>
          <input
            value={form.site_url ?? ""}
            onChange={(e) => setForm({ ...form, site_url: e.target.value || null })}
            dir="ltr"
            className={input}
          />
        </label>
      </div>

      <div className="flex items-center gap-4">
        {artworkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl} alt="עטיפת הפודקאסט" className="w-20 h-20 rounded-lg object-cover border border-border" />
        ) : (
          <div className="w-20 h-20 rounded-lg border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
            אין עטיפה
          </div>
        )}
        <div className="flex flex-col gap-1">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="self-start border border-border rounded-lg px-4 py-2 text-sm font-medium hover:border-primary disabled:opacity-50"
          >
            🖼️ העלאת עטיפה (ריבועית, 3000×3000 מומלץ)
          </button>
          <span className="text-xs text-muted-foreground">JPEG/PNG · מינימום 1400×1400 · חובה לפיד</span>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadArtwork(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || !form.title}
          className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
        >
          {busy ? "שומר…" : "שמירה"}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith("שגיאה") ? "text-destructive" : "text-success"}`}>{msg}</span>}
      </div>
    </div>
  );
}
