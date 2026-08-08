// studio/src/app/api/auth/youtube/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, expiresAtFromNow } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // Behind Render's proxy req.url carries the internal origin (localhost:10000)
  // — browser redirects must use the public URL.
  const base = process.env.RENDER_EXTERNAL_URL ?? req.url;

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("yt_oauth_state")?.value;
  cookieStore.delete("yt_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/?connected=youtube_error", base));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  try {
    const tokens = await exchangeCode(code);
    // Google only issues a refresh_token on the FIRST consent for a given
    // client+user — if the app was connected before and the user revoked
    // access from Google's side instead of ours, this can come back empty.
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL("/?connected=no_refresh_token", base));
    }
    const { error } = await supabase.from("oauth_tokens").upsert(
      {
        provider: "youtube",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expires_at: expiresAtFromNow(tokens.expires_in),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) {
      return NextResponse.redirect(new URL("/?connected=youtube_error", base));
    }
    return NextResponse.redirect(new URL("/?connected=youtube", base));
  } catch {
    return NextResponse.redirect(new URL("/?connected=youtube_error", base));
  }
}
