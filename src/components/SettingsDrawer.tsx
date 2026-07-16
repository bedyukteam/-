// studio/src/components/SettingsDrawer.tsx
// Account drawer (shadcn Sheet, slides from the left edge): profile (avatar +
// display name), connections (YouTube/Canva), password change and sign-out.
// The trigger is the account row at the bottom of the sidebar. Opens
// automatically after an OAuth callback (/?connected=...).
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ImagePlus, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
      {/* sidebar account row — the drawer trigger */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-start hover:bg-sidebar-accent/60 transition"
        title="הגדרות וחשבון"
      >
        <Avatar className="h-9 w-9 border border-sidebar-border">
          <AvatarImage src={avatarUrl || undefined} alt="" />
          <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm font-bold">
            {initial}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-sidebar-accent-foreground truncate">
            {name || "החשבון שלי"}
          </span>
          <span className="block text-[11px] text-sidebar-foreground/60 truncate" dir="ltr">
            {email}
          </span>
        </span>
        <ChevronLeft className="size-4 text-sidebar-foreground/50 shrink-0" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[24rem] max-w-[92vw] bg-background p-0 gap-0">
          <SheetHeader className="px-5 py-4 border-b border-border">
            <SheetTitle>הגדרות וחשבון</SheetTitle>
            <SheetDescription className="sr-only">פרופיל, חיבורים ואבטחה</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {/* פרופיל */}
            <section className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
              <h3 className="font-bold text-sm">פרופיל</h3>
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={avatarUrl || undefined} alt="" />
                  <AvatarFallback className="text-xl font-bold">{initial}</AvatarFallback>
                </Avatar>
                <label className="inline-flex items-center gap-1.5 text-xs border border-border rounded-lg px-3 py-1.5 hover:border-primary transition cursor-pointer">
                  <ImagePlus className="size-3.5" />
                  {uploadingAvatar ? "מעלה…" : "החלפת תמונה"}
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
                <span className="text-xs text-muted-foreground">שם תצוגה</span>
                <div className="flex gap-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="איך לקרוא לך?"
                  />
                  <Button variant="secondary" size="sm" onClick={saveName} disabled={savingName}>
                    {savingName ? "שומר…" : "שמור"}
                  </Button>
                </div>
              </label>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {email}
              </p>
              {profileMsg && <p className="text-xs text-muted-foreground">{profileMsg}</p>}
            </section>

            {/* חיבורים */}
            <section className="flex flex-col gap-3">
              <h3 className="font-bold text-sm px-1">חיבורים</h3>
              <YouTubeConnectPanel connected={ytConnected} statusParam={status?.yt} />
              <CanvaConnectPanel
                connected={canvaConnected}
                statusParam={status?.canva}
                templateCount={templateCount}
              />
            </section>

            {/* אבטחה */}
            <section className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
              <h3 className="font-bold text-sm">שינוי סיסמה</h3>
              <Input
                type="password"
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
                placeholder="סיסמה חדשה (8 תווים לפחות)"
              />
              <Input
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                placeholder="אימות סיסמה חדשה"
              />
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={changePassword}
                disabled={changingPw || !pw1}
              >
                {changingPw ? "מעדכן…" : "עדכן סיסמה"}
              </Button>
              {pwMsg && (
                <p className={`text-xs ${pwMsg.ok ? "text-success" : "text-destructive"}`}>
                  {pwMsg.text}
                </p>
              )}
            </section>

            <p className="text-xs text-muted-foreground text-center">עוד הגדרות יתווספו כאן בהמשך ✨</p>
          </div>

          {/* התנתקות */}
          <div className="p-4 border-t border-border">
            <Button variant="destructive" className="w-full" onClick={signOut}>
              <LogOut data-icon="inline-start" />
              התנתקות מהמערכת
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
