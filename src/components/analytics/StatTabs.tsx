// studio/src/components/analytics/StatTabs.tsx
// Studio-style metric header: big numbers as clickable tabs that switch the
// chart below them.
"use client";

export interface Stat {
  key: string;
  label: string;
  value: string;
  sub?: string;
}

export default function StatTabs({
  stats,
  active,
  onChange,
}: {
  stats: Stat[];
  active?: string;
  onChange?: (key: string) => void;
}) {
  return (
    <div className="grid border border-border rounded-xl overflow-hidden" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
      {stats.map((s) => {
        const isActive = active === s.key;
        const clickable = !!onChange;
        return (
          <button
            key={s.key}
            type="button"
            disabled={!clickable}
            onClick={() => onChange?.(s.key)}
            className={`flex flex-col items-center gap-0.5 px-3 py-4 border-l border-border last:border-l-0 transition ${
              isActive ? "bg-white" : "bg-slate-50"
            } ${clickable ? "hover:bg-white cursor-pointer" : "cursor-default"}`}
          >
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-2xl font-extrabold">{s.value}</span>
            {s.sub && <span className="text-[11px] text-muted-foreground">{s.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
