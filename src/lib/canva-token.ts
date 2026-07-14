import { SupabaseClient } from "@supabase/supabase-js";
import { refreshAccessToken, expiresAtFromNow } from "./canva-oauth";

/** Returns a live Canva access token, refreshing it first if it's expired (or about to be). */
export async function getValidCanvaToken(sb: SupabaseClient): Promise<string> {
  const { data: row } = await sb
    .from("oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", "canva")
    .maybeSingle();
  if (!row?.refresh_token) {
    throw new Error("Canva לא מחוברת — יש לחבר אותה במסך ההגדרות");
  }

  const stillValid =
    row.access_token && row.expires_at && new Date(row.expires_at as string) > new Date();
  if (stillValid) return row.access_token as string;

  const fresh = await refreshAccessToken(row.refresh_token as string);
  await sb
    .from("oauth_tokens")
    .update({
      access_token: fresh.access_token,
      ...(fresh.refresh_token ? { refresh_token: fresh.refresh_token } : {}),
      expires_at: expiresAtFromNow(fresh.expires_in),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "canva");
  return fresh.access_token;
}
