/**
 * POST /api/erreurs { message, stack, url, digest }: an error met in a browser. Logged (the
 * hosting's logs), and kept in the database when the server has its key (public.erreurs, read by
 * platform administrators in Administration → Erreurs). The account, when signed in, comes from
 * the session's token, checked with Supabase; never from the body.
 */
import { parseErreur } from "@/lib/erreurs";
import { clientAddress, rateLimit, tooMany } from "@/lib/ratelimit";
import { serviceClient } from "@/lib/cloud/server";

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimit(`erreurs:${clientAddress(request)}`, 20, 60_000);
  if (!limited.ok) return tooMany(limited.retryAfter);
  let body: unknown = null;
  try {
    body = JSON.parse(await request.text());
  } catch {
    body = null;
  }
  const e = parseErreur(body);
  if (!e) return new Response(null, { status: 204 });
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null;
  console.error("[erreur navigateur]", e.url ?? "", e.message, e.digest ?? "");
  const db = serviceClient();
  if (db) {
    let user_id: string | null = null;
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    if (token) user_id = (await db.auth.getUser(token)).data.user?.id ?? null;
    const { error } = await db.from("erreurs").insert({
      message: e.message,
      stack: e.stack ?? null,
      url: e.url ?? null,
      digest: e.digest ?? null,
      user_id,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      version,
    });
    if (error) console.error("[erreur navigateur] non enregistrée :", error.message);
  }
  return new Response(null, { status: 204 });
}
