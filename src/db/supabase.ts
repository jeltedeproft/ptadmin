import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase connection.
 *
 * The URL and anon key are compiled into the bundle — that is by design, and
 * they are useless on their own: `anon` holds no table privileges at all, and
 * every table is behind row-level security. See supabase/migrations/.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the app is built without a backend — it then stays device-local. */
export const hasBackend = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = hasBackend
  ? createClient(url!, anonKey!, {
      auth: {
        // Keeps the session in localStorage so a reload — and an offline start —
        // does not force a new login.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE returns the token as ?code= in the query string. The implicit
        // flow puts it in the hash fragment, which this app already uses for
        // routing — the two would fight over the same part of the URL.
        flowType: "pkce",
      },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Geen backend geconfigureerd (VITE_SUPABASE_URL ontbreekt).");
  return supabase;
}

/**
 * Where Supabase should send people back to after a confirmation or reset mail.
 * Deliberately without the hash: the router owns that, and a stray `#/route`
 * in the redirect makes the link fail Supabase's allow-list check.
 */
export function appUrl(): string {
  return window.location.origin + window.location.pathname;
}
