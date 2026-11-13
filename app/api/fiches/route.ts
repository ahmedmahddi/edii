/**
 * GET /api/fiches?ids=a,b,c: the fiches of these texts (requirements read in their articles,
 * written résumé, risk and plan), at most 100 at a time. The whole set is not served: it is
 * ABC Consulting's work, read here text by text as the registers need it.
 */
import { clientAddress, rateLimit, tooMany } from "@/lib/ratelimit";
import { fichesOf, parseIds } from "@/lib/veille/fiches-server";

export async function GET(request: Request): Promise<Response> {
  // A register's export asks for a few hundred texts at once; far more is a script reading them all.
  const limited = rateLimit(`fiches:${clientAddress(request)}`, 120, 60_000);
  if (!limited.ok) return tooMany(limited.retryAfter);
  const ids = parseIds(new URL(request.url).searchParams.get("ids"));
  if (!ids.length) return Response.json({ error: "ids manquants" }, { status: 400 });
  return Response.json(fichesOf(ids), {
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" },
  });
}
