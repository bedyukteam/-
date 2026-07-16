import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "בדיוק — אולפן התוכן",
  description:
    "מעלים פרק, מקבלים חבילת תוכן מוכנה: תמלול, כותרות, תמונות ממוזערות, תיאור, קרוסלות וציטוטים.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full font-sans`}>
      <body className="min-h-full">
        {children}
        <Toaster richColors position="bottom-left" dir="rtl" />
      </body>
    </html>
  );
}
