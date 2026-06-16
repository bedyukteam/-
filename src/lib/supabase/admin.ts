import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * A privileged server-side client that bypasses RLS via the service-role key.
 * Used by the background pipeline (transcription + generation) when it runs
 * detached from a user request. Falls back to `null` when the key is absent so
 * callers can degrade to a user-scoped client instead.
 */
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Build a user-scoped client from a raw access token (used to keep the
 * pipeline authenticated inside `after()` once the request cookies are gone).
 */
export function createTokenClient(accessToken: string): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
