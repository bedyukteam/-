// studio/src/components/YouTubeConnectPanel.tsx
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
  const message = statusParam ? MESSAGES[statusParam] : undefined;
  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-sm mb-1">חיבור ערוץ יוטיוב</h3>
          <p className="text-xs text-muted">
            {connected
              ? "הערוץ מחובר — ניתן לפרסם ולתזמן פרקים ישירות מהמערכת."
              : "חברי את ערוץ היוטיוב שלך כדי לאפשר פרסום אוטומטי מהמערכת."}
          </p>
        </div>
        {connected ? (
          <span className="text-success text-sm font-medium shrink-0">✓ מחובר</span>
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
