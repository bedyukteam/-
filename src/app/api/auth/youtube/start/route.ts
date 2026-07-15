// studio/src/app/api/auth/youtube/start/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl } from "@/lib/google-oauth";

// Redirects into Google's consent screen. The random `state` is stashed in a
// short-lived cookie and checked back in the callback (CSRF protection).
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("yt_oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
