// studio/src/app/api/auth/youtube/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, expiresAtFromNow } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("yt_oauth_state")?.value;
  cookieStore.delete("yt_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?youtube=error", req.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const tokens = await exchangeCode(code);
    // Google only issues a refresh_token on the FIRST consent for a given
    // client+user — if the app was connected before and the user revoked
    // access from Google's side instead of ours, this can come back empty.
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL("/settings?youtube=no_refresh_token", req.url));
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
      return NextResponse.redirect(new URL("/settings?youtube=error", req.url));
    }
    return NextResponse.redirect(new URL("/settings?youtube=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?youtube=error", req.url));
  }
}
