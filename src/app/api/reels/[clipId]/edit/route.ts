// In-app reel editing: GET returns the clip's editable state (caption words,
// hook title, pacing flags) from Submagic; POST applies changes and — only
// when export:true — triggers a re-render (consumes a Submagic credit; the UI
// warns and never auto-exports).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exportProject,
  getProjectDetail,
  listHookTitleTemplates,
  updateProject,
  type UpdateProjectPayload,
} from "@/lib/submagic";

export const maxDuration = 300;

// Hook templates barely change — cache for the process lifetime.
let hookTemplatesCache: string[] | null = null;
async function hookTemplates(): Promise<string[]> {
  if (!hookTemplatesCache) {
    try {
      hookTemplatesCache = await listHookTitleTemplates();
    } catch {
      return [];
    }
  }
  return hookTemplatesCache;
}

export async function GET(_req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const detail = await getProjectDetail(clipId);
    return NextResponse.json({
      words: detail.words ?? [],
      hookTitle: detail.hookTitle ?? null,
      hookTemplates: await hookTemplates(),
      removeBadTakes: detail.removeBadTakes ?? false,
      disableCaptions: detail.disableCaptions ?? false,
      status: detail.status ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ clipId: string }> }) {
  const { clipId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as UpdateProjectPayload & {
    export?: boolean;
  };
  const { export: doExport, ...payload } = body;

  try {
    if (Object.keys(payload).length > 0) {
      await updateProject(clipId, payload);
    }
    if (doExport) {
      const origin = new URL(req.url).origin;
      const webhookUrl = /localhost|127\.0\.0\.1/.test(origin)
        ? undefined
        : `${origin}/api/webhooks/submagic`;
      await exportProject(clipId, webhookUrl);
      await supabase
        .from("submagic_clips")
        .update({ edit_status: "exporting" })
        .eq("id", clipId);
    }
    return NextResponse.json({ ok: true, exporting: !!doExport });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
