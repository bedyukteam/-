import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, expiresAtFromNow } from "@/lib/canva-oauth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // Behind Render's proxy req.url carries the internal origin (localhost:10000)
  // — browser redirects must use the public URL.
  const base = process.env.RENDER_EXTERNAL_URL ?? req.url;

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("canva_oauth_state")?.value;
  const verifier = cookieStore.get("canva_oauth_verifier")?.value;
  cookieStore.delete("canva_oauth_state");
  cookieStore.delete("canva_oauth_verifier");

  if (!code || !state || !verifier || state !== expectedState) {
    console.error("[canva-callback] state check failed:", {
      hasCode: !!code,
      hasState: !!state,
      hasVerifier: !!verifier,
      stateMatches: state === expectedState,
      host: url.host,
    });
    return NextResponse.redirect(new URL("/?connected=canva_error", base));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  try {
    const tokens = await exchangeCode(code, verifier);
    if (!tokens.refresh_token) {
      console.error("[canva-callback] token response missing refresh_token");
      return NextResponse.redirect(new URL("/?connected=canva_error", base));
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
      console.error("[canva-callback] oauth_tokens upsert failed:", upsertErr.message);
      return NextResponse.redirect(new URL("/?connected=canva_error", base));
    }
    return NextResponse.redirect(new URL("/?connected=canva", base));
  } catch (e) {
    console.error("[canva-callback] token exchange failed:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL("/?connected=canva_error", base));
  }
}
