import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail } from "@/lib/submagic";
import ReelEditorView, { type ReelEditorClip } from "@/components/ReelEditorView";

export const dynamic = "force-dynamic";

export default async function ReelEditorPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;
  const supabase = await createClient();

  const { data: clip } = await supabase
    .from("submagic_clips")
    .select("id, title, download_url, direct_url, edit_status, episode_id")
    .eq("id", clipId)
    .single();
  if (!clip) notFound();

  // Editable state comes straight from Submagic (each clip is its own project).
  let words: unknown[] = [];
  let hook: { text?: string } | boolean | null = null;
  let removeBadTakes = false;
  let loadError: string | null = null;
  try {
    const detail = await getProjectDetail(clipId);
    words = detail.words ?? [];
    hook = (detail.hookTitle as { text?: string } | boolean | undefined) ?? null;
    removeBadTakes = !!detail.removeBadTakes;
  } catch (e) {
    loadError = (e as Error).message;
  }

  return (
    <ReelEditorView
      clip={clip as ReelEditorClip}
      initialWords={words as never}
      initialHook={hook}
      initialRemoveBadTakes={removeBadTakes}
      loadError={loadError}
    />
  );
}
