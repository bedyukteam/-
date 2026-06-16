import Image from "next/image";
import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden">
      <div className="brand-rings absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex bg-white rounded-2xl px-6 py-3 shadow-lg">
            <Image
              src="/logo.png"
              alt="בדיוק"
              width={500}
              height={500}
              priority
              className="h-28 w-auto"
            />
          </div>
          <p className="text-muted-on-navy mt-4 text-sm">
            אולפן התוכן — מעלים פרק, מקבלים חבילה מוכנה
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
