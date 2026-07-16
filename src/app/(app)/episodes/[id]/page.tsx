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
        <p className="text-muted-foreground">הפרק לא נמצא.</p>
        <Link href="/" className="text-primary underline">
          חזרה לפרקים
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
        ← כל הפרקים
      </Link>
      <h1 className="text-2xl font-extrabold mt-2 mb-6 text-foreground">
        {ep.title || ep.source_filename || "פרק"}
      </h1>
      <EpisodeView episodeId={id} initialStatus={ep.status} />
    </div>
  );
}
