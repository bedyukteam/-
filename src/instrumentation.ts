// Runs once when the server boots (Next instrumentation hook). The free-tier
// instance is killed on idle/deploy, taking every pending retry/poll timer
// with it — this sweep re-arms them so in-flight reels pipelines resume on
// the next boot instead of stalling forever.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { schedulePoll, triggerSubmagic } = await import("@/lib/submagic-trigger");

  const admin = createAdminClient();
  if (!admin) return;

  const origin =
    process.env.RENDER_EXTERNAL_URL ?? "https://podcast-studio-wxbw.onrender.com";

  try {
    const { data: stuck } = await admin
      .from("episodes")
      .select("id, submagic_project_id")
      .eq("submagic_status", "processing");
    for (const ep of stuck ?? []) {
      if (ep.submagic_project_id) {
        // Project exists — resume polling until its clips land.
        console.log(`[boot-sweep] resuming ingestion polling for ${ep.id}`);
        schedulePoll(ep.id as string, 18);
      } else {
        // Mid retry-chain when the process died — restart the trigger.
        console.log(`[boot-sweep] resuming reels trigger for ${ep.id}`);
        void triggerSubmagic(admin, ep.id as string, origin, { retriesLeft: 8 });
      }
    }
  } catch (e) {
    console.error("[boot-sweep]", (e as Error).message);
  }
}
