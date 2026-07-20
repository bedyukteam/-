// Public completion webhook from Submagic Magic Clips. No user session —
// requests are matched (and implicitly authenticated) by the unguessable
// submagic_project_id we stored when the project was created; unknown project
// ids are dropped. Writes use the service-role client because RLS policies
// only cover authenticated users.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectDetail, mapWebhookClips, type MagicClipsWebhookPayload } from "@/lib/submagic";
import { tryGenerateReelsMetadata } from "@/lib/submagic-trigger";

export async function POST(req: Request) {
  const sb = createAdminClient();
  if (!sb) {
    console.error("[submagic-webhook] SUPABASE_SERVICE_ROLE_KEY missing");
    return NextResponse.json({ error: "server not configured" }, { status: 500 });
  }

  let payload: MagicClipsWebhookPayload;
  try {
    payload = (await req.json()) as MagicClipsWebhookPayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload?.projectId) return NextResponse.json({ error: "missing projectId" }, { status: 400 });

  const { data: ep } = await sb
    .from("episodes")
    .select("id")
    .eq("submagic_project_id", payload.projectId)
    .maybeSingle();
  if (!ep) {
    // Not an episode-level Magic Clips project — maybe a per-clip export
    // finishing (each clip is its own project; see reel edit flow).
    const { data: clipRow } = await sb
      .from("submagic_clips")
      .select("id")
      .eq("id", payload.projectId)
      .maybeSingle();
    if (clipRow) {
      try {
        const fresh = await getProjectDetail(clipRow.id as string);
        await sb
          .from("submagic_clips")
          .update({
            edit_status: payload.status === "completed" ? "exported" : "error",
            ...(fresh.downloadUrl ? { download_url: fresh.downloadUrl } : {}),
            ...(fresh.directUrl ? { direct_url: fresh.directUrl } : {}),
          })
          .eq("id", clipRow.id);
      } catch (e) {
        console.error("[submagic-webhook] clip export refresh failed:", (e as Error).message);
        await sb.from("submagic_clips").update({ edit_status: "error" }).eq("id", clipRow.id);
      }
      return NextResponse.json({ ok: true, clip: clipRow.id });
    }
    console.error("[submagic-webhook] unknown projectId:", payload.projectId);
    return NextResponse.json({ error: "unknown project" }, { status: 404 });
  }

  const rows = mapWebhookClips(payload, ep.id as string);
  if (rows.length) {
    const { error } = await sb.from("submagic_clips").upsert(rows, { onConflict: "id" });
    if (error) {
      console.error("[submagic-webhook] clips upsert failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  await sb
    .from("episodes")
    .update({ submagic_status: payload.status === "completed" ? "ready" : "error" })
    .eq("id", ep.id);

  if (payload.status === "completed" && rows.length) {
    await tryGenerateReelsMetadata(sb, ep.id as string);
  }

  return NextResponse.json({ ok: true, clips: rows.length });
}
