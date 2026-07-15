import Link from "next/link";
import Image from "next/image";
import SignOutButton from "@/components/SignOutButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
