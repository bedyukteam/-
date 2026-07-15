// studio/src/components/analytics/useReports.ts
// Client hook: fetches a set of report types for a period (and optional video)
// in parallel, with an in-memory cache so tab/period switches don't refetch.
"use client";

import { useEffect, useRef, useState } from "react";
import type { Period } from "./PeriodPicker";
import type { VideoMeta } from "@/lib/youtube-channel";

export interface ReportData {
  rows: (string | number)[][];
  meta?: Record<string, VideoMeta>;
  median?: number[];
}

export function useReports(
  types: string[],
  period: Period,
  videoId?: string,
): { data: Record<string, ReportData>; loading: boolean; error: string } {
  const [data, setData] = useState<Record<string, ReportData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, ReportData>());
  const typesKey = types.join(",");

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const wanted = typesKey.split(",").filter(Boolean);
        const results = await Promise.all(
          wanted.map(async (type) => {
            const key = `${type}:${period.start}:${period.end}:${videoId ?? ""}`;
            const hit = cache.current.get(key);
            if (hit) return [type, hit] as const;
            const qs = new URLSearchParams({ type, start: period.start, end: period.end });
            if (videoId) qs.set("videoId", videoId);
            const res = await fetch(`/api/analytics/report?${qs.toString()}`);
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            const rd: ReportData = { rows: json.rows ?? [], meta: json.meta, median: json.median };
            cache.current.set(key, rd);
            return [type, rd] as const;
          }),
        );
        if (!cancelled) setData(Object.fromEntries(results));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [typesKey, period.start, period.end, videoId]);

  return { data, loading, error };
}
