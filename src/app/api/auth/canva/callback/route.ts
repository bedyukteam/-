import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, expiresAtFromNow } from "@/lib/canva-oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("canva_oauth_state")?.value;
  const verifier = cookieStore.get("canva_oauth_verifier")?.value;
  cookieStore.delete("canva_oauth_state");
  cookieStore.delete("canva_oauth_verifier");

  if (!code || !state || !verifier || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings?canva=error", req.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const tokens = await exchangeCode(code, verifier);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(new URL("/settings?canva=error", req.url));
    }
    const { error: upsertErr } = await supabase.from("oauth_tokens").upsert(
      {
        provider: "canva",
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expires_at: expiresAtFromNow(tokens.expires_in),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (upsertErr) {
      return NextResponse.redirect(new URL("/settings?canva=error", req.url));
    }
    return NextResponse.redirect(new URL("/settings?canva=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/settings?canva=error", req.url));
  }
}
