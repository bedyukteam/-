import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import SettingsDrawer from "@/components/SettingsDrawer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ data: ytToken }, { data: canvaToken }, { count: templateCount }] = await Promise.all([
    supabase.from("oauth_tokens").select("provider").eq("provider", "youtube").maybeSingle(),
    supabase.from("oauth_tokens").select("provider").eq("provider", "canva").maybeSingle(),
    supabase.from("cover_templates").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-panel-dark border-b border-border-navy">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center bg-white rounded-lg px-2.5 py-1"
          >
            <Image
              src="/logo.png"
              alt="בדיוק"
              width={500}
              height={500}
              priority
              className="h-8 w-auto"
            />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-on-navy">
            <Link href="/" className="hover:text-accent transition">
              הפרקים שלי
            </Link>
            <Link href="/ideas" className="hover:text-accent transition">
              רעיונות לתוכן
            </Link>
            <Link href="/analytics" className="hover:text-accent transition">
              אנליטיקס
            </Link>
            <Link href="/settings" className="hover:text-accent transition">
              הנחיות סגנון
            </Link>
            <Suspense fallback={<span className="w-9 h-9" />}>
              <SettingsDrawer
                ytConnected={!!ytToken}
                canvaConnected={!!canvaToken}
                templateCount={templateCount ?? 0}
              />
            </Suspense>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
