import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-extrabold text-accent text-lg">
            🎙️ Podcast Studio
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="hover:text-accent transition">
              הפרקים שלי
            </Link>
            <Link href="/settings" className="hover:text-accent transition">
              הנחיות סגנון
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
