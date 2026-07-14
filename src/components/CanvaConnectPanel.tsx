"use client";

import { useState } from "react";

const MESSAGES: Record<string, { text: string; tone: "success" | "danger" }> = {
  connected: { text: "Canva חוברה בהצלחה ✓", tone: "success" },
  error: { text: "החיבור נכשל — נסי שוב.", tone: "danger" },
};

export default function CanvaConnectPanel({
  connected,
  statusParam,
  templateCount,
}: {
  connected: boolean;
  statusParam?: string;
  templateCount: number;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const message = statusParam ? MESSAGES[statusParam] : undefined;

  async function sync() {
    setSyncing(true);
    setSyncResult("");
    try {
      const res = await fetch("/api/canva/sync", { method: "POST" });
      const json: { ok?: boolean; count?: number; error?: string } = await res.json();
      setSyncResult(json.error ? `שגיאה: ${json.error}` : `סונכרנו ${json.count} תבניות ✓`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm mb-1">חיבור וסנכרון תבניות Canva</h3>
          <p className="text-xs text-muted">
            {connected
              ? `מחובר — ${templateCount} תבניות קאבר במערכת כרגע.`
              : "חברי את Canva כדי לסנכרן תבניות קאבר אוטומטית."}
          </p>
        </div>
        {connected ? (
          <span className="text-success text-sm font-medium shrink-0">✓ מחובר</span>
        ) : (
          <a
            href="/api/auth/canva/start"
            className="shrink-0 bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90"
          >
            חבר Canva
          </a>
        )}
      </div>
      {connected && (
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="self-start border border-border rounded-lg px-4 py-2 text-sm hover:border-accent disabled:opacity-50"
        >
          {syncing ? "מסנכרנת…" : "🔄 סנכרן תבניות"}
        </button>
      )}
      {syncResult && <p className="text-xs text-muted">{syncResult}</p>}
      {message && (
        <p className={`text-xs ${message.tone === "success" ? "text-success" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
