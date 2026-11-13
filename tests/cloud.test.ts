import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudBackend, diff, type Saved, type SyncState } from "@/lib/cloud/sync";
import type { Registre } from "@/lib/registre/registre";

const reg = (id: string, nom = id, extra: Partial<Registre> = {}) => ({ id, nom, lignes: [], ecartes: [], maj: "", ...extra }) as unknown as Registre;

/** A fake server keeping a version per register, as save_registre does. */
function server(initial: Registre[] = []) {
  const rows = new Map(initial.map((r) => [r.id, { r, v: 1 }]));
  const calls: string[] = [];
  return {
    rows,
    calls,
    stored: () => initial.map((r) => ({ registre: r, version: 1 })),
    async save(r: Registre, expected: number | null): Promise<Saved> {
      calls.push(`${r.id}@${expected}`);
      const cur = rows.get(r.id);
      if (cur && expected !== cur.v) return { ok: false, version: cur.v, current: cur.r };
      const v = (cur?.v ?? 0) + 1;
      rows.set(r.id, { r, v });
      return { ok: true, version: v };
    },
    async remove(ids: string[]) {
      for (const id of ids) rows.delete(id);
    },
    /** A colleague saves directly. */
    colleague(r: Registre) {
      const v = (rows.get(r.id)?.v ?? 0) + 1;
      rows.set(r.id, { r, v });
      return v;
    },
  };
}

describe("registers kept in a client workspace", () => {
  afterEach(() => vi.useRealTimers());

  it("sends only the registers changed, and the ids of those removed", () => {
    const a = reg("a");
    const b = reg("b");
    expect(diff([a, b], [a, reg("b", "B renommé"), reg("c")])).toEqual({ upserts: [reg("b", "B renommé"), reg("c")], deletes: [] });
    expect(diff([a, b], [b])).toEqual({ upserts: [], deletes: ["a"] });
  });

  it("groups quick changes into one save, from the version read", async () => {
    vi.useFakeTimers();
    const s = server([reg("a")]);
    const states: SyncState["state"][] = [];
    const b = cloudBackend(s.stored(), s, { onState: (x) => states.push(x.state) });
    b.save([reg("a", "A1")], [reg("a")]);
    b.save([reg("a", "A2")], [reg("a", "A1")]);
    b.save([reg("a", "A2"), reg("z")], [reg("a", "A2")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.calls).toEqual(["a@1", "z@null"]);
    expect(s.rows.get("a")).toMatchObject({ v: 2, r: { nom: "A2" } });
    expect(b.versionOf("a")).toBe(2);
    expect(states.at(-1)).toBe("saved");
  });

  it("merges with a colleague's save instead of overwriting it", async () => {
    vi.useFakeTimers();
    const s = server([reg("a", "Usine")]);
    const merged: string[][] = [];
    const states: SyncState[] = [];
    const b = cloudBackend(s.stored(), s, { onMerged: (ids) => merged.push(ids), onState: (x) => states.push(x) });
    // A colleague adds a text set aside; here, the name changes.
    s.colleague(reg("a", "Usine", { ecartes: ["t-collegue"] }));
    b.save([reg("a", "Usine de Sfax")], [reg("a", "Usine")]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.calls).toEqual(["a@1", "a@2"]);
    expect(s.rows.get("a")).toMatchObject({ v: 3, r: { nom: "Usine de Sfax", ecartes: ["t-collegue"] } });
    expect(b.list[0]).toMatchObject({ nom: "Usine de Sfax", ecartes: ["t-collegue"] });
    expect(merged).toEqual([["a"]]);
    expect(states.at(-1)).toEqual({ state: "saved", message: "Fusionné avec les modifications d’un collègue" });
  });

  it("takes a colleague's save heard live, unless a change of ours waits", async () => {
    vi.useFakeTimers();
    const s = server([reg("a"), reg("b")]);
    const b = cloudBackend(s.stored(), s, {});
    expect(b.applyRemote({ registre: reg("a", "par Bob"), version: 2 })).toBe(true);
    expect(b.list.find((r) => r.id === "a")!.nom).toBe("par Bob");
    expect(b.applyRemote({ registre: reg("a", "ancien"), version: 2 })).toBe(false); // already known
    b.save([b.list[0], reg("b", "mine")], b.list);
    expect(b.applyRemote({ registre: reg("b", "theirs"), version: 2 })).toBe(false); // ours waits: the save merges
    expect(b.applyRemoval("a")).toBe(true);
    expect(b.list.map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps what failed and sends it again", async () => {
    vi.useFakeTimers();
    let down = true;
    const s = server();
    const io = { save: (r: Registre, e: number | null) => (down ? Promise.reject(new Error("réseau indisponible")) : s.save(r, e)), remove: s.remove };
    const states: SyncState[] = [];
    const b = cloudBackend([], io, { onState: (x) => states.push(x) });
    b.save([reg("a", "A1")], []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toEqual({ state: "error", message: "réseau indisponible" });
    b.save([reg("a", "A2")], [reg("a", "A1")]);
    down = false;
    await vi.advanceTimersByTimeAsync(6000);
    expect(s.rows.get("a")!.r.nom).toBe("A2");
    expect(states.at(-1)?.state).toBe("saved");
  });

  it("does not send anything for a reader", async () => {
    vi.useFakeTimers();
    const s = server();
    const states: SyncState["state"][] = [];
    const b = cloudBackend([], s, { readOnly: true, onState: (x) => states.push(x.state) });
    b.save([reg("a")], []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.calls).toEqual([]);
    expect(states).toEqual(["readonly"]);
  });
});
