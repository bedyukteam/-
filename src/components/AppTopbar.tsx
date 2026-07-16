// studio/src/components/AppTopbar.tsx
// Thin top bar over the content area: current-section title, the global
// "＋ פרק חדש" CTA, and (on mobile) a hamburger that opens the nav in a Sheet.
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavActive } from "@/components/AppSidebar";

function sectionTitle(pathname: string): string {
  if (pathname.startsWith("/episodes")) return "פרק";
  if (pathname.startsWith("/ideas")) return "רעיונות לתוכן";
  if (pathname.startsWith("/analytics/video")) return "אנליטיקס · סרטון";
  if (pathname.startsWith("/analytics")) return "אנליטיקס";
  if (pathname.startsWith("/settings")) return "הנחיות סגנון";
  return "הפרקים שלי";
}

export default function AppTopbar() {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 h-14">
        <div className="flex items-center gap-3 min-w-0">
          {/* mobile: hamburger + logo */}
          <button
            className="md:hidden text-foreground/80 hover:text-foreground"
            onClick={() => setNavOpen(true)}
            aria-label="תפריט"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="font-bold text-lg truncate">{sectionTitle(pathname)}</h1>
        </div>

        <Button variant="cta" size="lg" render={<Link href="/#new" />}>
          <Plus data-icon="inline-start" />
          פרק חדש
        </Button>
      </div>

      {/* mobile nav */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="right" className="w-64 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SheetHeader>
            <SheetTitle className="text-sidebar-foreground">
              <span className="inline-flex items-center bg-white rounded-lg px-2 py-1">
                <Image src="/logo.png" alt="בדיוק" width={200} height={200} className="h-6 w-auto" />
              </span>
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-2">
            {NAV_ITEMS.map((item) => {
              const active = isNavActive(item, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60",
                  )}
                >
                  <Icon className="size-4.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
