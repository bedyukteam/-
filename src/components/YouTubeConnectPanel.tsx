// studio/src/components/YouTubeConnectPanel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MESSAGES: Record<string, { text: string; tone: "success" | "danger" }> = {
  connected: { text: "הערוץ חובר בהצלחה ✓", tone: "success" },
  error: { text: "החיבור נכשל — נסי שוב.", tone: "danger" },
  no_refresh_token: {
    text: "החיבור לא הושלם (Google לא החזירה הרשאה מלאה) — נסי לחבר שוב.",
    tone: "danger",
  },
};

export default function YouTubeConnectPanel({
  connected,
  statusParam,
}: {
  connected: boolean;
  statusParam?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const message = statusParam ? MESSAGES[statusParam] : undefined;

  async function disconnect() {
    if (!confirm("לנתק את חיבור היוטיוב? פרסום ואנליטיקס יפסיקו לעבוד עד חיבור מחדש.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "youtube" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm mb-1">חיבור ערוץ יוטיוב</h3>
          <p className="text-xs text-muted">
            {connected
              ? "הערוץ מחובר — ניתן לפרסם, לתזמן ולראות אנליטיקס."
              : "חברי את ערוץ היוטיוב שלך כדי לאפשר פרסום אוטומטי ואנליטיקס."}
          </p>
        </div>
        {connected ? (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-success text-sm font-medium">✓ מחובר</span>
            <a
              href="/api/auth/youtube/start"
              className="text-xs border border-border rounded-lg px-3 py-1.5 hover:border-accent transition"
              title="מריץ שוב את מסך ההרשאות של Google — נדרש אחרי הוספת הרשאות חדשות"
            >
              🔄 חבר מחדש
            </a>
            <button
              onClick={disconnect}
              disabled={busy}
              className="text-xs text-muted hover:text-danger disabled:opacity-50 transition"
            >
              נתק
            </button>
          </div>
        ) : (
          <a
            href="/api/auth/youtube/start"
            className="shrink-0 bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            חבר ערוץ יוטיוב
          </a>
        )}
      </div>
      {message && (
        <p className={`text-xs ${message.tone === "success" ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
