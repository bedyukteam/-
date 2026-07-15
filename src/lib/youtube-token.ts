// studio/src/lib/youtube-token.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { refreshAccessToken, expiresAtFromNow } from "./google-oauth";

/** Returns a live YouTube access token, refreshing it first if it's expired (or about to be). */
export async function getValidAccessToken(sb: SupabaseClient): Promise<string> {
  const { data: row } = await sb
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "youtube")
    .maybeSingle();
  if (!row?.refresh_token) {
    throw new Error("ערוץ היוטיוב לא מחובר — יש לחבר אותו במסך ההגדרות");
  }

  const stillValid =
    row.access_token && row.expires_at && new Date(row.expires_at as string) > new Date();
  if (stillValid) return row.access_token as string;

  const fresh = await refreshAccessToken(row.refresh_token as string);
  await sb
    .from("oauth_tokens")
    .update({
      access_token: fresh.access_token,
      expires_at: expiresAtFromNow(fresh.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "youtube");
  return fresh.access_token;
}
