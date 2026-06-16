"use client";

import { useState } from "react";
import type { StyleProfile } from "@/lib/types";

export default function SettingsForm({ initial }: { initial: StyleProfile | null }) {
  const [language, setLanguage] = useState(initial?.language_guidelines ?? "");
  const [visual, setVisual] = useState(initial?.visual_guidelines ?? "");
  const [canva, setCanva] = useState(initial?.canva_covers_url ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        language_guidelines: language,
        visual_guidelines: visual,
        canva_covers_url: canva,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">הנחיות שפה</span>
        <span className="text-xs text-muted">
          טון, אוצר מילים, אורך, פנייה (את/אתה), מה כן ומה אסור. למשל: &quot;שפה חמה
          ואנושית, גוף שני נקבה, בלי קלישאות שיווקיות, משפטים קצרים.&quot;
        </span>
        <textarea
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          rows={7}
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-sm leading-relaxed"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">הנחיות וויזואל (לתמונות ממוזערות)</span>
        <span className="text-xs text-muted">
          פלטת צבעים, סגנון, אווירה, מה שחוזר במותג. למשל: &quot;צבעים חמים, פנים
          גדולות עם הבעה, ניגודיות גבוהה, מינימום טקסט.&quot;
        </span>
        <textarea
          value={visual}
          onChange={(e) => setVisual(e.target.value)}
          rows={5}
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-sm leading-relaxed"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">קישור לקאברים ב-Canva</span>
        <span className="text-xs text-muted">
          הקישור לעיצוב/תיקיית הקאברים שלך ב-Canva. מופיע ככפתור &quot;פתח את הקאברים&quot; בכל פרק.
        </span>
        <input
          value={canva}
          onChange={(e) => setCanva(e.target.value)}
          dir="ltr"
          placeholder="https://www.canva.com/design/…"
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-accent text-sm"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-accent text-accent-foreground rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? "שומר…" : "שמירה"}
        </button>
        {saved && <span className="text-success text-sm">נשמר ✓</span>}
      </div>
    </div>
  );
}
