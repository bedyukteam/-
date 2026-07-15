// studio/src/components/analytics/format.ts
export function fmtNum(n: number): string {
  return n.toLocaleString("he-IL");
}

/** seconds → m:ss (Studio's average-view-duration format). */
export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** minutes → hours with one decimal (Studio's watch-time format). */
export function fmtHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

export function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Brand palette for charts ("בדיוק": navy + yellow), matching the app tokens.
export const CHART = {
  primary: "#324158", // navy — main line/series
  accent: "#F2DA06", // yellow — highlight series
  muted: "#94a3b8", // slate — comparison/typical series
  soft: "#e2e8f0",
} as const;

export const DONUT_COLORS = ["#324158", "#F2DA06", "#64748b", "#94a3b8", "#cbd5e1", "#475569"];
