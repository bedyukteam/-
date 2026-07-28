// Pulls the clip's current state from Submagic and updates our row when a new
// render exists. Serves two flows:
// - in-app export ('exporting'): completion check, as before (webhook fallback).
// - external edit in Submagic's UI ('editing'): exports there never call our
//   webhook, so ClipCard polls this route; a re-export is recognized only when
//   the fetched downloadUrl actually differs from the stored one.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProjectDetail, isNewRender } from "@/lib/submagic";

const EDITING_MAX_AGE_MS = 24 * 3600_000;

export async function POST(_req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("submagic_clips")
    .select("download_url, direct_url, edit_status, edit_opened_at")
    .eq("id", clipId)
    .single();
  if (!row) return NextResponse.json({ error: "clip not found" }, { status: 404 });

  let fresh;
  try {
    fresh = await getProjectDetail(clipId);
  } catch (e) {
    const msg = (e as Error).message;
    if (/\(404\)/.test(msg)) {
      // Deleted on Submagic's side — keep our row (it may already be
      // published), just stop the external-edit polling.
      if (row.edit_status === "editing") {
        await supabase
          .from("submagic_clips")
          .update({ edit_status: null, edit_opened_at: null })
          .eq("id", clipId);
      }
      return NextResponse.json({ notFound: true, changed: false, exported: false });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (row.edit_status === "exporting") {
    // In-app export in flight — we know a render was started, so completion
    // status is the signal (unchanged behavior).
    const exported = fresh.status === "completed";
    await supabase
      .from("submagic_clips")
      .update({
        ...(exported ? { edit_status: "exported", edit_opened_at: null } : {}),
        ...(fresh.status === "failed" ? { edit_status: "error" } : {}),
        ...(fresh.downloadUrl ? { download_url: fresh.downloadUrl } : {}),
        ...(fresh.directUrl ? { direct_url: fresh.directUrl } : {}),
      })
      .eq("id", clipId);
    return NextResponse.json({ status: fresh.status ?? null, changed: exported, exported });
  }

  // Change-detection mode ('editing' / 'exported' / null): only an actually
  // different downloadUrl counts as a re-export — a completed status alone
  // proves nothing for a clip that was already rendered once.
  if (isNewRender(row.download_url, fresh.downloadUrl)) {
    await supabase
      .from("submagic_clips")
      .update({
        download_url: fresh.downloadUrl,
        ...(fresh.directUrl ? { direct_url: fresh.directUrl } : {}),
        ...(fresh.title ? { title: fresh.title } : {}),
        edit_status: "exported",
        edit_opened_at: null,
      })
      .eq("id", clipId);
    return NextResponse.json({ status: fresh.status ?? null, changed: true, exported: true });
  }

  // Nothing new. Expire a stale external-edit session so the card stops polling.
  const openedAt = row.edit_opened_at ? Date.parse(row.edit_opened_at) : NaN;
  if (row.edit_status === "editing" && Number.isFinite(openedAt) && Date.now() - openedAt > EDITING_MAX_AGE_MS) {
    await supabase
      .from("submagic_clips")
      .update({ edit_status: null, edit_opened_at: null })
      .eq("id", clipId);
    return NextResponse.json({ status: fresh.status ?? null, changed: false, exported: false, cleared: true });
  }

  return NextResponse.json({ status: fresh.status ?? null, changed: false, exported: false });
}
