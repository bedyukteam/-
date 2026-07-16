// studio/src/components/analytics/PeriodPicker.tsx
// Studio-style period dropdown: presets + custom date range. Emits ISO dates.
"use client";

import { useEffect, useRef, useState } from "react";
import { isoDaysAgo, todayIso } from "./format";

export interface Period {
  start: string;
  end: string;
  label: string;
}

export function defaultChannelPeriod(): Period {
  return { start: isoDaysAgo(28), end: todayIso(), label: "28 הימים האחרונים" };
}

export function sincePublishPeriod(publishedAt?: string): Period {
  const start = publishedAt ? publishedAt.slice(0, 10) : isoDaysAgo(28);
  return { start, end: todayIso(), label: "מאז הפרסום" };
}

export default function PeriodPicker({
  value,
  onChange,
  publishedAt,
}: {
  value: Period;
  onChange: (p: Period) => void;
  /** When given (video mode) adds "מאז הפרסום" + "24 השעות הראשונות". */
  publishedAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(value.start);
  const [to, setTo] = useState(value.end);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const presets: Period[] = [
    ...(publishedAt
      ? [
          sincePublishPeriod(publishedAt),
          {
            start: publishedAt.slice(0, 10),
            end: new Date(new Date(publishedAt).getTime() + 86400_000).toISOString().slice(0, 10),
            label: "24 השעות הראשונות",
          },
        ]
      : []),
    { start: isoDaysAgo(7), end: todayIso(), label: "7 הימים האחרונים" },
    { start: isoDaysAgo(28), end: todayIso(), label: "28 הימים האחרונים" },
    { start: isoDaysAgo(90), end: todayIso(), label: "90 הימים האחרונים" },
    { start: isoDaysAgo(365), end: todayIso(), label: "365 הימים האחרונים" },
    { start: `${new Date().getFullYear()}-01-01`, end: todayIso(), label: String(new Date().getFullYear()) },
    { start: "2005-01-01", end: todayIso(), label: "מאז ומעולם" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs border border-border rounded-lg px-3 py-2 hover:border-primary transition flex items-center gap-2"
      >
        <span className="font-medium">{value.label}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-border rounded-xl shadow-lg p-1.5 w-56">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onChange(p);
                setOpen(false);
                setCustom(false);
              }}
              className={`w-full text-right text-sm rounded-lg px-3 py-1.5 hover:bg-slate-50 ${
                value.label === p.label ? "font-bold" : ""
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              type="button"
              onClick={() => setCustom((v) => !v)}
              className="w-full text-right text-sm rounded-lg px-3 py-1.5 hover:bg-slate-50"
            >
              מותאם אישית…
            </button>
            {custom && (
              <div className="p-2 flex flex-col gap-2">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-xs" dir="ltr" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-border rounded-lg px-2 py-1 text-xs" dir="ltr" />
                <button
                  type="button"
                  onClick={() => {
                    if (from && to && from <= to) {
                      onChange({ start: from, end: to, label: `${from} → ${to}` });
                      setOpen(false);
                    }
                  }}
                  className="bg-brand text-brand-foreground rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  החל
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
