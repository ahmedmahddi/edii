/**
 * An error met in the browser, as reported to the server (app/api/erreurs): what it says, where,
 * and nothing more (no page content, no query string: a dossier may be in it).
 */
import { cloud } from "@/lib/cloud/client";

export interface ErreurReport {
  message: string;
  stack?: string;
  url?: string;
  digest?: string;
}

const cut = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** A report as sent by a browser: only what is expected, cut to size; null when unusable. */
export function parseErreur(body: unknown): ErreurReport | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const message = cut(b.message, 1000);
  if (!message) return null;
  let url = cut(b.url, 500);
  if (url) {
    try {
      url = new URL(url, "https://x").pathname; // the path only
    } catch {
      url = undefined;
    }
  }
  return { message, stack: cut(b.stack, 8000), url, digest: cut(b.digest, 100) };
}

// What the browser says once per visit and per message, so that a loop does not send hundreds.
const sent = new Set<string>();

/** Report an error to the server (in the browser). Never throws. */
export function reportError(error: unknown, extra: { digest?: string } = {}): void {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
    const key = `${e.message}|${location.pathname}`;
    if (sent.has(key) || sent.size > 20) return;
    sent.add(key);
    const body = JSON.stringify({ message: e.message || e.name, stack: e.stack, url: location.pathname, digest: extra.digest });
    // Signed in: the session's token says who met it (checked by the server).
    void (async () => {
      const token = (await cloud()?.auth.getSession())?.data.session?.access_token;
      await fetch("/api/erreurs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body,
        keepalive: true,
      });
    })().catch(() => {});
  } catch {
    // reporting must never break the page
  }
}
