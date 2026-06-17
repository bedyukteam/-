import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/components/UploadForm";
import EpisodeRow from "@/components/EpisodeRow";
import type { Episode } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const channelId = process.env.NEXT_PUBLIC_DEFAULT_CHANNEL_ID!;
  const { data: episodes } = await supabase
    .from("episodes")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false });

  const list = (episodes ?? []) as Episode[];

  return (
    <div className="grid md:grid-cols-[1fr_1.2fr] gap-8 items-start">
      <UploadForm />

      <section>
        <h2 className="font-bold text-lg mb-4 text-on-navy">הפרקים שלי</h2>
        {list.length === 0 ? (
          <p className="text-muted text-sm bg-surface border border-border rounded-2xl p-6">
            עדיין אין פרקים. העלי פרק ראשון כדי להתחיל ✨
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((ep) => (
              <li key={ep.id}>
                <EpisodeRow ep={ep} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
