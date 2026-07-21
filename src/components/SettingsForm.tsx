"use client";

import { useState } from "react";
import type { StyleProfile } from "@/lib/types";

export default function SettingsForm({
  initial,
  captionTemplates = [],
}: {
  initial: StyleProfile | null;
  captionTemplates?: string[];
}) {
  const [language, setLanguage] = useState(initial?.language_guidelines ?? "");
  const [dictionary, setDictionary] = useState(initial?.submagic_dictionary ?? "");
  const [template, setTemplate] = useState(initial?.submagic_template ?? "");
  const [themeId, setThemeId] = useState(initial?.submagic_theme_id ?? "");
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
        submagic_dictionary: dictionary,
        submagic_template: template,
        submagic_theme_id: themeId.trim(),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 flex flex-col gap-5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">הנחיות שפה</span>
        <span className="text-xs text-muted-foreground">
          טון, אוצר מילים, אורך, פנייה (את/אתה), מה כן ומה אסור. למשל: &quot;שפה חמה
          ואנושית, גוף שני נקבה, בלי קלישאות שיווקיות, משפטים קצרים.&quot;
        </span>
        <textarea
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          rows={7}
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm leading-relaxed"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">מילון מותג לרילס (Submagic)</span>
        <span className="text-xs text-muted-foreground">
          מונחים, שמות ומותגים שחוזרים בפרקים — שורה לכל מונח (או מופרדים בפסיק). עוזר
          לכתוביות של הרילס לצאת מדויקות כבר מהיצירה. עד 100 מונחים.
        </span>
        <textarea
          value={dictionary}
          onChange={(e) => setDictionary(e.target.value)}
          rows={4}
          placeholder={"בדיוק\nיונה משה-דוד"}
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm leading-relaxed"
        />
      </label>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold">סגנון כתוביות לרילס</span>
        <span className="text-xs text-muted-foreground">
          קובע את הפונט, הגודל והמיקום של הכתוביות הצרובות — מוחל על כל הרילס שייווצרו
          מעכשיו. לשליטה מלאה: עצבי ערכה משלך בעורך Submagic (פרויקט ← Theme ← שמירה ←
          אייקון עיפרון מציג את ה-ID) והדביקי את ה-ID — הערכה שלך גוברת על התבנית.
        </span>
        <label className="flex flex-col gap-1 mt-1">
          <span className="text-xs font-medium">תבנית מובנית של Submagic</span>
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm bg-transparent"
          >
            <option value="">ברירת מחדל (Sara)</option>
            {captionTemplates.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 mt-1">
          <span className="text-xs font-medium">Theme ID מותאם אישית (לא חובה)</span>
          <input
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
            dir="ltr"
            placeholder="למשל: 749a19fs-4b45-4b14-bd31-a3970a1a5ff2"
            className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring text-sm"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-brand text-brand-foreground rounded-lg px-5 py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? "שומר…" : "שמירה"}
        </button>
        {saved && <span className="text-success text-sm">נשמר ✓</span>}
      </div>
    </div>
  );
}
