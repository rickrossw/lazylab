import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public, browser-safe values (the anon key is designed to be shipped; row-level security protects data).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Null when sign-in isn't configured; the site then runs guest-only. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }) : null;

export type OAuthProvider = "github" | "google";

/** Social providers to offer, e.g. NEXT_PUBLIC_AUTH_PROVIDERS="github,google" (enable them in Supabase first). */
export const OAUTH_PROVIDERS: OAuthProvider[] = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s): s is OAuthProvider => s === "github" || s === "google");

export function siteUrl(): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
}
