// studio/src/components/AppSidebar.tsx
// The app's main navigation: a fixed dark-navy sidebar on the right (RTL start
// side) — logo, icon nav with active state, and the account/settings entry at
// the bottom. Hidden on mobile (AppTopbar shows a hamburger instead).
"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BarChart3, Clapperboard, Home, Lightbulb, Palette, PlusCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import SettingsDrawer from "@/components/SettingsDrawer";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Additional path prefixes that keep this item active. */
  also?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/new", label: "פרק חדש", icon: PlusCircle },
  { href: "/", label: "הפרקים שלי", icon: Home, also: ["/episodes"] },
  { href: "/ideas", label: "רעיונות לתוכן", icon: Lightbulb },
  { href: "/reels", label: "רילס", icon: Clapperboard },
  { href: "/analytics", label: "אנליטיקס", icon: BarChart3 },
  { href: "/settings", label: "הנחיות סגנון", icon: Palette },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") {
    return pathname === "/" || (item.also ?? []).some((p) => pathname.startsWith(p));
  }
  return pathname.startsWith(item.href) || (item.also ?? []).some((p) => pathname.startsWith(p));
}

export default function AppSidebar({
  ytConnected,
  canvaConnected,
  templateCount,
}: {
  ytConnected: boolean;
  canvaConnected: boolean;
  templateCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground sticky top-0 h-dvh">
      {/* logo */}
      <div className="px-4 pt-5 pb-4">
        <Link href="/" className="inline-flex items-center bg-white rounded-xl px-3 py-1.5">
          <Image src="/logo.png" alt="בדיוק" width={500} height={500} priority className="h-8 w-auto" />
        </Link>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isNavActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              {active && (
                <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-sidebar-primary" aria-hidden />
              )}
              <Icon className="size-4.5 shrink-0" strokeWidth={active ? 2.4 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* account / settings */}
      <div className="p-3 border-t border-sidebar-border">
        <SettingsDrawer
          ytConnected={ytConnected}
          canvaConnected={canvaConnected}
          templateCount={templateCount}
        />
      </div>
    </aside>
  );
}
