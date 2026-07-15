// studio/src/components/analytics/DisabledCard.tsx
// Honest placeholder for metrics YouTube exposes only inside Studio (no API):
// realtime, impressions/CTR, unique viewers, new/returning, notifications.
export default function DisabledCard({
  title,
  studioUrl,
}: {
  title: string;
  studioUrl: string;
}) {
  return (
    <div className="border border-dashed border-border rounded-2xl p-5 flex flex-col gap-1.5 bg-slate-50/50">
      <h3 className="font-semibold text-sm text-muted">🔒 {title}</h3>
      <p className="text-xs text-muted">
        הנתון הזה לא נחשף ב-API של יוטיוב — זמין רק בתוך YouTube Studio.
      </p>
      <a
        href={studioUrl}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-accent hover:underline self-start"
      >
        פתיחה ב-Studio ←
      </a>
    </div>
  );
}
