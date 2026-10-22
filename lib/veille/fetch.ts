/**
 * Downloads that hold out on a home connection: a connection reset or a server hiccup is tried
 * again a few times, and a download that stalls is given up after a while (then tried again),
 * instead of ending (or hanging) a run of thousands of issues. Node only.
 */

const TIMEOUT_MS = 60_000;
const WAITS_MS = [2_000, 5_000, 15_000, 30_000]; // before each new try

/** Statuses worth trying again: the server is busy or failing for a moment. */
const transient = (status: number) => status === 408 || status === 429 || status >= 500;

export async function fetchRetry(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!transient(res.status) || attempt >= WAITS_MS.length) return res;
      await res.body?.cancel();
    } catch (error) {
      if (attempt >= WAITS_MS.length) throw error;
    }
    await new Promise((r) => setTimeout(r, WAITS_MS[attempt]));
  }
}

/** The body as text, tried again when the connection breaks while it comes. */
export async function fetchText(url: string, init: RequestInit = {}): Promise<{ status: number; text: string } | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchRetry(url, init);
    if (res.status === 404) return null;
    try {
      return { status: res.status, text: await res.text() };
    } catch (error) {
      if (attempt >= WAITS_MS.length) throw error;
      await new Promise((r) => setTimeout(r, WAITS_MS[attempt]));
    }
  }
}
