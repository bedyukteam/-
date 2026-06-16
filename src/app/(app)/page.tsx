import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UploadForm from "@/components/UploadForm";
import { STATUS_LABELS } from "@/lib/constants";
import type { Episode } from "@/lib/types";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "bg-green-100 text-success",
    processing: "bg-amber-100 text-warning",
    error: "bg-red-100 text-danger",
    uploaded: "bg-slate-100 text-muted",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] ?? map.uploaded}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

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
        <h2 className="font-bold text-lg mb-4">הפרקים שלי</h2>
        {list.length === 0 ? (
          <p className="text-muted text-sm bg-surface border border-border rounded-2xl p-6">
            עדיין אין פרקים. העלי פרק ראשון כדי להתחיל ✨
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((ep) => (
              <li key={ep.id}>
                <Link
                  href={`/episodes/${ep.id}`}
                  className="flex items-center justify-between bg-surface border border-border rounded-xl p-4 hover:border-accent transition"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {ep.title || ep.source_filename || "פרק ללא שם"}
                    </span>
                    <span className="text-xs text-muted">
                      {ep.type === "short" ? "שורט" : "פרק"} ·{" "}
                      {new Date(ep.created_at).toLocaleDateString("he-IL")}
                    </span>
                  </div>
                  <StatusBadge status={ep.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
