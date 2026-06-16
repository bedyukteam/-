import { createClient } from "@/lib/supabase/server";
import SettingsForm from "@/components/SettingsForm";
import { KIND_LABELS } from "@/lib/constants";
import type { GenerationKind, StyleExample, StyleProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;

  const { data: profile } = await supabase
    .from("style_profiles")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();

  const { data: examples } = await supabase
    .from("style_examples")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(50);

  const grouped: Record<string, StyleExample[]> = {};
  for (const ex of (examples ?? []) as StyleExample[]) {
    (grouped[ex.kind] ??= []).push(ex);
  }

  return (
    <div className="grid lg:grid-cols-2 gap-8 items-start">
      <div>
        <h1 className="text-2xl font-extrabold mb-2">הנחיות סגנון</h1>
        <p className="text-muted text-sm mb-5">
          כאן את מלמדת את המערכת באיזו שפה ובאיזה וויזואל להפיק את התוכן. ההנחיות
          נכנסות לכל פרק חדש, יחד עם הדוגמאות שאישרת — וכך הסגנון משתפר מפרק לפרק.
        </p>
        <SettingsForm
          initial={(profile as StyleProfile) ?? null}
        />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-2">ספריית דוגמאות מאושרות</h2>
        <p className="text-muted text-sm mb-4">
          כל פריט שאת מסמנת ככוכב ★ בפרקים נשמר כאן ומשמש את המערכת כדוגמה.
        </p>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-muted text-sm bg-surface border border-border rounded-2xl p-6">
            עדיין אין דוגמאות. סמני פריטים ★ בפרקים כדי לבנות את הזיכרון.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {Object.entries(grouped).map(([kind, items]) => (
              <div key={kind} className="bg-surface border border-border rounded-2xl p-4">
                <h3 className="font-semibold text-sm mb-2">
                  {KIND_LABELS[kind as GenerationKind] ?? kind}{" "}
                  <span className="text-muted">({items.length})</span>
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {items.slice(0, 8).map((ex) => (
                    <li key={ex.id} className="text-sm text-muted line-clamp-2">
                      • {(ex.content as { text?: string }).text ?? JSON.stringify(ex.content)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
