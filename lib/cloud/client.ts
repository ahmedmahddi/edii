/**
 * The connection to Supabase (accounts, client workspaces, registers: supabase/migrations), when the
 * deployment has one: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the project's
 * public "anon" key: what it may read is decided by the database's row-level security).
 * Without them the app runs as before, everything kept in the browser ("mode local").
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** The client, typed by the database (lib/cloud/database.types.ts, npm run db:types). */
export type Db = SupabaseClient<Database>;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim().replace(/^["']|["']$/g, "");

/**
 * What is wrong with the settings, when they are given but cannot work; null when they are fine.
 * The values themselves are never shown: a pasted database connection string holds its password.
 */
export const cloudConfigError: string | null = !URL && !KEY
  ? null
  : !URL || !KEY
    ? `Il manque ${!URL ? "NEXT_PUBLIC_SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_ANON_KEY"} dans la configuration.`
    : /^postgres(ql)?:/i.test(URL)
      ? "NEXT_PUBLIC_SUPABASE_URL contient la chaîne de connexion à la base (postgresql://…) : il faut la « Project URL », https://<projet>.supabase.co (Supabase : Project Settings → Data API)."
      : !/^https?:\/\/[^\s/]+$/i.test(URL)
        ? "NEXT_PUBLIC_SUPABASE_URL n’est pas une adresse web : il faut la « Project URL », de la forme https://<projet>.supabase.co (Supabase : Project Settings → Data API)."
        : /^(sb_secret_|service_role)/.test(KEY) || /"role"\s*:\s*"service_role"/.test(safeJwtPayload(KEY))
          ? "NEXT_PUBLIC_SUPABASE_ANON_KEY est une clé secrète (service_role / secret) : elle donnerait tous les droits à n’importe quel visiteur. Mettez la clé publique (publishable ou anon), et changez la clé secrète dans Supabase."
          : null;

function safeJwtPayload(key: string): string {
  try {
    const part = key.split(".")[1];
    return part ? atob(part.replace(/-/g, "+").replace(/_/g, "/")) : "";
  } catch {
    return "";
  }
}

export const cloudEnabled = !!(URL && KEY) && !cloudConfigError;

let client: Db | null = null;
/** The client, in the browser only; null in local mode. */
export function cloud(): Db | null {
  if (!cloudEnabled || typeof window === "undefined") return null;
  client ??= createClient<Database>(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
