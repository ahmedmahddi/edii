/**
 * The connection to Supabase (accounts, client workspaces, registers: supabase/migrations), when the
 * deployment has one: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the project's
 * public "anon" key: what it may read is decided by the database's row-level security).
 * Without them the app runs as before, everything kept in the browser ("mode local").
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudEnabled = !!(URL && KEY);

let client: SupabaseClient | null = null;
/** The client, in the browser only; null in local mode. */
export function cloud(): SupabaseClient | null {
  if (!cloudEnabled || typeof window === "undefined") return null;
  client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
