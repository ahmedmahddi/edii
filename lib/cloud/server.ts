/**
 * Supabase from the server, with the service role key (SUPABASE_SERVICE_ROLE_KEY): it reads every
 * workspace, bypassing row-level security, so it is used only by server routes that check their
 * caller themselves (the cron's CRON_SECRET, the unsubscribe link's signature). Never sent to a browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function serviceClient(env: Record<string, string | undefined> = process.env): SupabaseClient<Database> | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Every row of a query, 1000 at a time (PostgREST's page). */
export async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}
