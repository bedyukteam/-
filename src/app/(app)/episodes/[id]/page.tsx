import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import EpisodeView from "@/components/EpisodeView";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: ep } = await supabase
    .from("episodes")
    .select("id, title, source_filename, type, status")
    .eq("id", id)
    .single();

  if (!ep) {
    return (
      <div className="text-center py-20">
        <p className="text-muted">הפרק לא נמצא.</p>
        <Link href="/" className="text-accent underline">
          חזרה לפרקים
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" className="text-sm text-muted-on-navy hover:text-accent">
        ← כל הפרקים
      </Link>
      <h1 className="text-2xl font-extrabold mt-2 mb-6 text-on-navy">
        {ep.title || ep.source_filename || "פרק"}
      </h1>
      <EpisodeView episodeId={id} initialStatus={ep.status} />
    </div>
  );
}
