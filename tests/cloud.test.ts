import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudBackend, diff, type SyncState } from "@/lib/cloud/sync";
import type { Registre } from "@/lib/registre/registre";

const reg = (id: string, nom = id) => ({ id, nom }) as unknown as Registre;

describe("registers kept in a client workspace", () => {
  afterEach(() => vi.useRealTimers());

  it("sends only the registers changed, and the ids of those removed", () => {
    const a = reg("a");
    const b = reg("b");
    expect(diff([a, b], [a, reg("b", "B renommé"), reg("c")])).toEqual({ upserts: [reg("b", "B renommé"), reg("c")], deletes: [] });
    expect(diff([a, b], [b])).toEqual({ upserts: [], deletes: ["a"] });
    expect(diff([a], [a])).toEqual({ upserts: [], deletes: [] });
  });

  it("groups quick changes into one send, and says when it is saved", async () => {
    vi.useFakeTimers();
    const upsert = vi.fn(async (_: Registre[]) => {});
    const remove = vi.fn(async (_: string[]) => {});
    const states: SyncState["state"][] = [];
    const b = cloudBackend([reg("a")], { upsert, remove }, { onState: (s) => states.push(s.state) });
    b.save([reg("a", "A1")], [reg("a")]);
    b.save([reg("a", "A2")], [reg("a", "A1")]);
    b.save([reg("a", "A2"), reg("z")], [reg("a", "A2")]);
    expect(b.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toEqual([reg("a", "A2"), reg("z")]);
    expect(b.pending()).toBe(false);
    expect(states.at(-1)).toBe("saved");
  });

  it("keeps what failed and sends it again", async () => {
    vi.useFakeTimers();
    let down = true;
    const sent: string[][] = [];
    const upsert = vi.fn(async (list: Registre[]) => {
      if (down) throw new Error("réseau indisponible");
      sent.push(list.map((r) => r.nom));
    });
    const states: SyncState[] = [];
    const b = cloudBackend([], { upsert, remove: async () => {} }, { onState: (s) => states.push(s) });
    b.save([reg("a", "A1")], []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toEqual({ state: "error", message: "réseau indisponible" });
    // Changed again while it was failing: the newer version is the one sent.
    b.save([reg("a", "A2")], [reg("a", "A1")]);
    down = false;
    await vi.advanceTimersByTimeAsync(6000);
    expect(sent).toEqual([["A2"]]);
    expect(states.at(-1)?.state).toBe("saved");
  });

  it("does not send anything for a reader", async () => {
    vi.useFakeTimers();
    const upsert = vi.fn(async () => {});
    const states: SyncState["state"][] = [];
    const b = cloudBackend([], { upsert, remove: async () => {} }, { readOnly: true, onState: (s) => states.push(s.state) });
    b.save([reg("a")], []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(upsert).not.toHaveBeenCalled();
    expect(states).toEqual(["readonly"]);
  });
});
