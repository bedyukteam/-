"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("פרטי ההתחברות שגויים. נסי שוב.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">אימייל</span>
        <input
          type="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">סיסמה</span>
        <input
          type="password"
          required
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border border-border rounded-lg px-3 py-2 outline-none focus:border-ring"
        />
      </label>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-brand text-brand-foreground rounded-lg py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {loading ? "מתחברת…" : "כניסה"}
      </button>
    </form>
  );
}
