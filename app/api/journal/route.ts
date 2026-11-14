/**
 * POST /api/journal { q, niveau, domaine, secteur, statut, statuts, page, tout, live }: the texts
 * the veille found, filtered and a page at a time (lib/veille/journal.ts). `statuts` are the reading
 * statuses kept in the browser; `live`, the issues it read with "Vérifier maintenant" and that the
 * site does not carry yet.
 */
import { clientAddress, rateLimit, tooMany } from "@/lib/ratelimit";
import { serverFeed } from "@/lib/veille/feed-server";
import { journal, parseQuery } from "@/lib/veille/journal";
import { type LiveIssue, withLive } from "@/lib/veille/live";

export async function POST(request: Request): Promise<Response> {
  const limited = rateLimit(`journal:${clientAddress(request)}`, 120, 60_000);
  if (!limited.ok) return tooMany(limited.retryAfter);
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const query = parseQuery(body);
  const base = serverFeed();
  const live = (body as { live?: unknown } | null)?.live;
  const issues = Array.isArray(live)
    ? (live as LiveIssue[]).filter((i) => i && Number.isInteger(i.year) && Number.isInteger(i.number) && i.issue && Array.isArray(i.issue.entries)).slice(0, 30)
    : [];
  const hits = issues.length ? withLive(base, issues).hits : base.hits;
  return Response.json(journal(hits, query));
}
