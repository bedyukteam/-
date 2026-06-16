import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-extrabold text-accent">🎙️ Podcast Studio</div>
          <p className="text-muted mt-2 text-sm">אולפן התוכן — מעלים פרק, מקבלים חבילה מוכנה</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
