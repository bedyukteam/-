import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden">
      <div className="brand-rings absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-extrabold text-accent">🎙️ Podcast Studio</div>
          <p className="text-muted-on-navy mt-2 text-sm">
            אולפן התוכן — מעלים פרק, מקבלים חבילה מוכנה
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
