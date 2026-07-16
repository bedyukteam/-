import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import AppSidebar from "@/components/AppSidebar";
import AppTopbar from "@/components/AppTopbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: ytToken }, { data: canvaToken }, { count: templateCount }] = await Promise.all([
    supabase.from("oauth_tokens").select("provider").eq("provider", "youtube").maybeSingle(),
    supabase.from("oauth_tokens").select("provider").eq("provider", "canva").maybeSingle(),
    supabase.from("cover_templates").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="flex min-h-dvh">
      {/* first flex child = the right edge in RTL */}
      <Suspense fallback={<div className="hidden md:block w-60 shrink-0 bg-sidebar" />}>
        <AppSidebar
          ytConnected={!!ytToken}
          canvaConnected={!!canvaToken}
          templateCount={templateCount ?? 0}
        />
      </Suspense>

      <div className="flex-1 flex flex-col min-w-0">
        <Suspense fallback={<div className="h-14 border-b border-border" />}>
          <AppTopbar
            ytConnected={!!ytToken}
            canvaConnected={!!canvaToken}
            templateCount={templateCount ?? 0}
          />
        </Suspense>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
