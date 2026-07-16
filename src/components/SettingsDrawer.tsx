// studio/src/components/SettingsDrawer.tsx
// Account drawer that slides in from the left edge: profile (avatar + display
// name), connections (YouTube/Canva panels), security (password change) and
// sign-out. The header avatar button and the drawer live together so they can
// share state. Opens automatically after an OAuth callback (/?connected=...).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import YouTubeConnectPanel from "@/components/YouTubeConnectPanel";
import CanvaConnectPanel from "@/components/CanvaConnectPanel";

const AVATAR_BUCKET = "media";

// /?connected=<value> → which panel shows which status message
const CONNECTED_STATUS: Record<string, { yt?: string; canva?: string }> = {
  youtube: { yt: "connected" },
  youtube_error: { yt: "error" },
  no_refresh_token: { yt: "no_refresh_token" },
  canva: { canva: "connected" },
  canva_error: { canva: "error" },
};

export default function SettingsDrawer({
  ytConnected,
  canvaConnected,
  templateCount,
}: {
  ytConnected: boolean;
  canvaConnected: boolean;
  templateCount: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected") ?? "";
  const status = CONNECTED_STATUS[connectedParam];

  const [open, setOpen] = useState(!!status);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      setName((user.user_metadata?.display_name as string) ?? "");
      const path = user.user_metadata?.avatar_path as string | undefined;
      if (path) {
        const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 86400);
        if (data?.signedUrl) setAvatarUrl(data.signedUrl);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [supabase]);

  async function saveName() {
    setSavingName(true);
    setProfileMsg("");
    try {
      const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim() } });
      setProfileMsg(error ? `שגיאה: ${error.message}` : "השם נשמר ✓");
    } finally {
      setSavingName(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setProfileMsg("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `avatars/${user.id}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (upErr) {
        setProfileMsg(`שגיאה בהעלאה: ${upErr.message}`);
        return;
      }
      const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (metaErr) {
        setProfileMsg(`שגיאה: ${metaErr.message}`);
        return;
      }
      const { data } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 86400);
      if (data?.signedUrl) setAvatarUrl(data.signedUrl);
      setProfileMsg("תמונת הפרופיל עודכנה ✓");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (pw1.length < 8) {
      setPwMsg({ text: "הסיסמה חייבת להיות באורך 8 תווים לפחות", ok: false });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ text: "הסיסמאות לא זהות", ok: false });
      return;
    }
    setChangingPw(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw1 });
      if (error) setPwMsg({ text: `שגיאה: ${error.message}`, ok: false });
      else {
        setPwMsg({ text: "הסיסמה שונתה בהצלחה ✓", ok: true });
        setPw1("");
        setPw2("");
      }
    } finally {
      setChangingPw(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (name || email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      {/* header trigger — avatar or initial */}
      <button
        onClick={() => setOpen(true)}
        title="הגדרות וחשבון"
        className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 hover:border-accent transition grid place-items-center bg-white/10 text-white text-sm font-bold shrink-0"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="פרופיל" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>

      {/* backdrop */}
      {open && <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />}

      {/* drawer — slides from the LEFT edge */}
      <aside
        className={`fixed top-0 left-0 h-dvh w-[22rem] max-w-[90vw] bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-extrabold">הגדרות וחשבון</h2>
          <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* פרופיל */}
          <section className="border border-border rounded-2xl p-4 flex flex-col gap-3">
            <h3 className="font-bold text-sm">פרופיל</h3>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 grid place-items-center text-xl font-bold text-muted shrink-0">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <label className="text-xs border border-border rounded-lg px-3 py-1.5 hover:border-accent transition cursor-pointer">
                {uploadingAvatar ? "מעלה…" : "🖼 החלפת תמונה"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingAvatar}
                  onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted">שם תצוגה</span>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="איך לקרוא לך?"
                  className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={saveName}
                  disabled={savingName}
                  className="text-xs bg-accent text-accent-foreground rounded-lg px-3 font-semibold disabled:opacity-50"
                >
                  {savingName ? "שומר…" : "שמור"}
                </button>
              </div>
            </label>
            <p className="text-xs text-muted" dir="ltr">
              {email}
            </p>
            {profileMsg && <p className="text-xs text-muted">{profileMsg}</p>}
          </section>

          {/* חיבורים */}
          <section className="flex flex-col gap-3">
            <h3 className="font-bold text-sm px-1">חיבורים</h3>
            <YouTubeConnectPanel connected={ytConnected} statusParam={status?.yt} />
            <CanvaConnectPanel connected={canvaConnected} statusParam={status?.canva} templateCount={templateCount} />
          </section>

          {/* אבטחה */}
          <section className="border border-border rounded-2xl p-4 flex flex-col gap-2">
            <h3 className="font-bold text-sm">שינוי סיסמה</h3>
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="סיסמה חדשה (8 תווים לפחות)"
              className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="אימות סיסמה חדשה"
              className="border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={changePassword}
              disabled={changingPw || !pw1}
              className="self-start text-xs bg-accent text-accent-foreground rounded-lg px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              {changingPw ? "מעדכן…" : "עדכן סיסמה"}
            </button>
            {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-success" : "text-danger"}`}>{pwMsg.text}</p>}
          </section>

          <p className="text-xs text-muted text-center">עוד הגדרות יתווספו כאן בהמשך ✨</p>
        </div>

        {/* התנתקות */}
        <div className="p-4 border-t border-border">
          <button
            onClick={signOut}
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm font-semibold text-danger hover:bg-red-50 transition"
          >
            התנתקות מהמערכת
          </button>
        </div>
      </aside>
    </>
  );
}
