import { describe, expect, it } from "vitest";
import { clientAddress, rateLimit } from "@/lib/ratelimit";

describe("limiting how often a route is called", () => {
  it("lets a few calls through per window, then refuses with the wait", () => {
    const t = 1_000_000;
    expect(rateLimit("k1", 2, 60_000, t)).toEqual({ ok: true });
    expect(rateLimit("k1", 2, 60_000, t + 1)).toEqual({ ok: true });
    expect(rateLimit("k1", 2, 60_000, t + 10_000)).toEqual({ ok: false, retryAfter: 50 });
    expect(rateLimit("k2", 2, 60_000, t + 10_000)).toEqual({ ok: true }); // another address
    expect(rateLimit("k1", 2, 60_000, t + 60_000)).toEqual({ ok: true }); // a new window
  });
  it("reads the caller's address from the proxy", () => {
    expect(clientAddress(new Request("http://x", { headers: { "x-forwarded-for": "41.1.2.3, 10.0.0.1" } }))).toBe("41.1.2.3");
    expect(clientAddress(new Request("http://x"))).toBe("inconnu");
  });
});
