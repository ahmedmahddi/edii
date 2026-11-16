import { afterEach, describe, expect, it, vi } from "vitest";
import { nouveauClassement } from "@/lib/classement/classement";
import { classementsBackend } from "@/lib/cloud/classements-sync";

afterEach(() => vi.useRealTimers());

describe("the classifications of a workspace", () => {
  it("saves those changed, deletes those removed", async () => {
    vi.useFakeTimers();
    const upserted: string[][] = [];
    const removed: string[][] = [];
    const a = nouveauClassement(new Date("2026-11-16T09:00:00Z"));
    const b = cl("b");
    const back = classementsBackend([a, b], { upsert: async (l) => void upserted.push(l.map((c) => c.id)), remove: async (ids) => void removed.push(ids) });
    back.save([{ ...a, nom: "A" }], [a, b]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(upserted).toEqual([[a.id]]);
    expect(removed).toEqual([["b"]]);
  });

  it("does not take a list read before a change of ours", async () => {
    vi.useFakeTimers();
    const back = classementsBackend([], { upsert: async () => {}, remove: async () => {} });
    const since = back.generation();
    const fresh = cl("new");
    back.save([fresh], []);
    await vi.advanceTimersByTimeAsync(1000); // saved: nothing waits any more
    expect(back.replace([], since)).toBe(false); // read before the change: out of date
    expect(back.list.map((c) => c.id)).toEqual(["new"]);
    expect(back.replace([fresh, cl("theirs")], back.generation())).toBe(true); // read after: taken
  });
});

function cl(id: string) {
  return { ...nouveauClassement(new Date("2026-11-16T09:00:00Z")), id };
}
