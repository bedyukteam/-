// studio/src/components/analytics/Charts.tsx
// Shared SVG chart primitives for the analytics dashboard (Studio-style,
// brand palette, no external libraries). All charts render LTR internally.
"use client";

import { CHART, DONUT_COLORS, fmtNum } from "./format";

export interface Series {
  points: number[];
  color?: string;
  fill?: boolean;
  dashed?: boolean;
}

/** Line/area chart. All series share the x axis (equal spacing) and y scale. */
export function AreaChart({
  series,
  xFirst,
  xLast,
  height = 150,
  yMax,
}: {
  series: Series[];
  xFirst?: string;
  xLast?: string;
  height?: number;
  yMax?: number;
}) {
  const W = 600;
  const H = height;
  const longest = Math.max(...series.map((s) => s.points.length), 2);
  const max = yMax ?? Math.max(...series.flatMap((s) => s.points), 1);
  const x = (i: number, len: number) => (len <= 1 ? 0 : (i / (len - 1)) * W);
  const y = (v: number) => H - 8 - (v / max) * (H - 24);
  const grid = [0.25, 0.5, 0.75].map((f) => H - 8 - f * (H - 24));

  return (
    <div dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {grid.map((gy) => (
          <line key={gy} x1="0" x2={W} y1={gy} y2={gy} stroke={CHART.soft} strokeWidth="1" />
        ))}
        {series.map((s, si) => {
          const len = s.points.length;
          if (len === 0) return null;
          const pts = s.points.map((v, i) => `${x(i, Math.max(len, longest === len ? len : longest)).toFixed(1)},${y(v).toFixed(1)}`);
          const color = s.color ?? CHART.primary;
          return (
            <g key={si}>
              {s.fill && (
                <polygon points={`0,${H - 8} ${pts.join(" ")} ${x(len - 1, Math.max(len, longest)).toFixed(1)},${H - 8}`} fill={color} opacity="0.12" />
              )}
              <polyline
                points={pts.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray={s.dashed ? "5,4" : undefined}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-muted mt-1">
        <span>{xFirst ?? ""}</span>
        <span>מקס׳: {fmtNum(Math.round(max))}</span>
        <span>{xLast ?? ""}</span>
      </div>
    </div>
  );
}

/** Horizontal percentage bars — Studio's traffic-source / breakdown style. */
export function BarList({
  items,
  valueFmt = fmtNum,
}: {
  items: { label: string; value: number; sub?: string }[];
  valueFmt?: (v: number) => string;
}) {
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => {
        const pct = (it.value / total) * 100;
        return (
          <div key={it.label} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate">{it.label}</span>
                {it.sub && <span className="text-xs text-muted shrink-0">{it.sub}</span>}
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden" dir="ltr">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(it.value / max) * 100}%`, background: CHART.primary }}
                />
              </div>
            </div>
            <span className="text-xs text-muted w-14 text-left" dir="ltr">
              {pct.toFixed(1)}% · {valueFmt(it.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Donut with center label — Studio's "how viewers found this Short". */
export function Donut({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const R = 42;
  const C = 2 * Math.PI * R;
  // Precompute each segment's start offset (fraction of the circle).
  const segments = items.map((it, i) => {
    const frac = it.value / total;
    const before = items.slice(0, i).reduce((s, p) => s + p.value / total, 0);
    return { ...it, frac, before, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });
  return (
    <svg viewBox="0 0 110 110" className="w-32 h-32 shrink-0">
      <g transform="rotate(-90 55 55)">
        {segments.map((seg) => (
          <circle
            key={seg.label}
            cx="55"
            cy="55"
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth="12"
            strokeDasharray={`${seg.frac * C} ${C}`}
            strokeDashoffset={-seg.before * C}
          />
        ))}
      </g>
      <text x="55" y="59" textAnchor="middle" className="fill-current" fontSize="10">
        מקורות תנועה
      </text>
    </svg>
  );
}

/** Audience-retention curve (Studio: % of viewers still watching over video time). */
export function RetentionChart({
  points,
  durationSec,
}: {
  points: { x: number; y: number }[]; // x: 0..1 elapsed ratio, y: watch ratio (can exceed 1)
  durationSec?: number;
}) {
  if (points.length < 2) return <p className="text-xs text-muted">אין עדיין נתוני שימור לסרטון הזה.</p>;
  const W = 600;
  const H = 150;
  const maxY = Math.max(1.2, ...points.map((p) => p.y));
  const px = (x: number) => x * W;
  const py = (y: number) => H - 8 - (y / maxY) * (H - 24);
  const line = points.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  const fmtT = (ratio: number) => {
    if (!durationSec) return `${Math.round(ratio * 100)}%`;
    const s = Math.round(ratio * durationSec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <div dir="ltr" className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: H }}>
        {[0.4, 0.8, 1.2].map((v) => (
          <g key={v}>
            <line x1="0" x2={W} y1={py(v)} y2={py(v)} stroke={CHART.soft} strokeWidth="1" />
            <text x={W - 4} y={py(v) - 3} textAnchor="end" fontSize="9" fill="#94a3b8">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        <polygon points={`0,${H - 8} ${line} ${W},${H - 8}`} fill={CHART.primary} opacity="0.1" />
        <polyline points={line} fill="none" stroke={CHART.primary} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-muted mt-1">
        <span>{fmtT(0)}</span>
        <span>{fmtT(0.5)}</span>
        <span>{fmtT(1)}</span>
      </div>
    </div>
  );
}
