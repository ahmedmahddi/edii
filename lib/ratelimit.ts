/**
 * A limit on how often one address may call a route: a fixed window per key, in this server's
 * memory. On Vercel each instance keeps its own count, so the limit is approximate; it stops a
 * script hammering a route, which is its purpose (the routes behind it read jort.tn or write data).
 */
const windows = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k); // keep the map small
    return { ok: true };
  }
  if (w.count >= limit) return { ok: false, retryAfter: Math.ceil((w.start + windowMs - now) / 1000) };
  w.count++;
  return { ok: true };
}

/** The caller's address, as the hosting proxy reports it. */
export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "inconnu";
}

export function tooMany(retryAfter: number): Response {
  return Response.json({ error: "Trop de demandes : réessayez dans quelques instants." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
