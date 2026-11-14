import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudBackend, diff, type Saved, type Stored, type SyncIO, type SyncState } from "@/lib/cloud/sync";
import type { Ligne, Registre } from "@/lib/registre/registre";

const ligne = (id: string, extra: Partial<Ligne> = {}) =>
  ({ texte: { id, titre: id }, retenu: true, origine: "propose", raisons: [], conformite: "", resume: "", risque: "", plan: "", responsable: "", echeance: "", frequence: "Annuelle", evalue: "", vus: [], ...extra }) as unknown as Ligne;
const reg = (id: string, nom = id, lignes: Ligne[] = [], extra: Partial<Registre> = {}) => ({ id, nom, lignes, ecartes: [], maj: "", ...extra }) as unknown as Registre;
const withLigne = (r: Registre, l: Ligne) => ({ ...r, lignes: r.lignes.map((x) => (x.texte.id === l.texte.id ? l : x)) });

/** A fake server keeping a version per register and per line, as save_registre and save_lignes do. */
function server(initial: Registre[] = []) {
  const metas = new Map(initial.map((r) => [r.id, { r: { ...r, lignes: [] }, v: 1 }]));
  const lines = new Map<string, { l: Ligne; v: number }>(initial.flatMap((r) => r.lignes.map((l) => [`${r.id}/${l.texte.id}`, { l, v: 1 }] as const)));
  const calls: string[] = [];
  const io: SyncIO = {
    async create(r) {
      calls.push(`create ${r.id}: ${r.lignes.map((l) => l.texte.id).join(" ")}`);
      const cur = metas.get(r.id);
      if (cur) return { version: cur.v, existed: true };
      metas.set(r.id, { r: { ...r, lignes: [] }, v: 1 });
      for (const l of r.lignes) lines.set(`${r.id}/${l.texte.id}`, { l, v: 1 });
      return { version: 1, existed: false };
    },
    async saveMeta(r, expected): Promise<Saved<Registre>> {
      calls.push(`meta ${r.id}@${expected}`);
      const cur = metas.get(r.id);
      if (cur && expected !== cur.v) return { ok: false, version: cur.v, current: cur.r };
      const v = (cur?.v ?? 0) + 1;
      metas.set(r.id, { r: { ...r, lignes: [] }, v });
      return { ok: true, version: v };
    },
    async saveLignes(rid, items) {
      calls.push(`lignes ${rid}: ${items.map((x) => `${x.ligne.texte.id}@${x.expected}`).join(" ")}`);
      if (!metas.has(rid)) throw new Error("no register");
      return items.map(({ ligne: l, expected }) => {
        const k = `${rid}/${l.texte.id}`;
        const cur = lines.get(k);
        if (cur && expected !== cur.v) return { id: l.texte.id, ok: false as const, version: cur.v, current: cur.l };
        const v = (cur?.v ?? 0) + 1;
        lines.set(k, { l, v });
        return { id: l.texte.id, ok: true as const, version: v };
      });
    },
    async removeLignes(rid, ids) {
      for (const id of ids) lines.delete(`${rid}/${id}`);
    },
    async remove(ids) {
      for (const id of ids) metas.delete(id);
    },
  };
  return {
    io,
    metas,
    lines,
    calls,
    stored: (): Stored[] => initial.map((r) => ({ registre: r, version: 1, lignes: Object.fromEntries(r.lignes.map((l) => [l.texte.id, 1])) })),
    /** A colleague saves a line directly. */
    colleague(rid: string, l: Ligne) {
      const k = `${rid}/${l.texte.id}`;
      const v = (lines.get(k)?.v ?? 0) + 1;
      lines.set(k, { l, v });
      return v;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("registers kept in a client workspace, line by line", () => {
  it("tells which registers changed, which of their lines, and their own fields apart from the date", () => {
    const a = reg("a", "A", [ligne("t1"), ligne("t2")]);
    const a2 = { ...withLigne(a, ligne("t2", { conformite: "C" })), maj: "2026-11-13" };
    expect(diff([a, reg("b")], [a2, reg("c")])).toEqual({
      changes: [
        { id: "a", meta: false, lignes: ["t2"], removed: [] },
        { id: "c", meta: true, lignes: [], removed: [] },
      ],
      deletes: ["b"],
    });
    expect(diff([a], [{ ...a, nom: "A2", lignes: [ligne("t1")] }]).changes).toEqual([{ id: "a", meta: true, lignes: [], removed: ["t2"] }]);
  });

  it("saves only the lines changed, each from the version read; a new register first, then its lines", async () => {
    vi.useFakeTimers();
    const a = reg("a", "A", [ligne("t1"), ligne("t2")]);
    const s = server([a]);
    const states: SyncState["state"][] = [];
    const b = cloudBackend(s.stored(), s.io, { onState: (x) => states.push(x.state) });
    const a1 = withLigne(a, ligne("t2", { conformite: "C" }));
    b.save([a1], [a]);
    const a2 = withLigne(a1, ligne("t2", { conformite: "NC" }));
    const z = reg("z", "Z", [ligne("u1")]);
    b.save([a2, z], [a1]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.calls).toEqual(["lignes a: t2@1", "create z: u1"]);
    expect(s.lines.get("a/t2")).toMatchObject({ v: 2, l: { conformite: "NC" } });
    expect(b.ligneVersionOf("a", "t2")).toBe(2);
    expect(b.versionOf("z")).toBe(1);
    expect(states.at(-1)).toBe("saved");
  });

  it("two people on different texts of one register never meet; on the same text, both changes are kept", async () => {
    vi.useFakeTimers();
    const a = reg("a", "Usine", [ligne("t1"), ligne("t2")]);
    const s = server([a]);
    const merged: string[][] = [];
    const states: SyncState[] = [];
    const b = cloudBackend(s.stored(), s.io, { onMerged: (ids) => merged.push(ids), onState: (x) => states.push(x) });
    // A colleague evaluates t1 and names a responsible on t2; here, t2 gets a plan.
    s.colleague("a", ligne("t1", { conformite: "C" }));
    s.colleague("a", ligne("t2", { responsable: "Bob" }));
    b.save([withLigne(a, ligne("t2", { plan: "Former le personnel" }))], [a]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.calls).toEqual(["lignes a: t2@1", "lignes a: t2@2"]);
    expect(s.lines.get("a/t1")!.l.conformite).toBe("C"); // untouched by our save
    expect(s.lines.get("a/t2")).toMatchObject({ v: 3, l: { responsable: "Bob", plan: "Former le personnel" } });
    expect(b.list[0]!.lignes.find((l) => l.texte.id === "t2")).toMatchObject({ responsable: "Bob", plan: "Former le personnel" });
    expect(merged).toEqual([["a"]]);
    expect(states.at(-1)).toEqual({ state: "saved", message: "Fusionné avec les modifications d’un collègue" });
  });

  it("takes a colleague's line or register heard live, unless a change of ours waits", async () => {
    vi.useFakeTimers();
    const a = reg("a", "A", [ligne("t1")]);
    const s = server([a, reg("b")]);
    const b = cloudBackend(s.stored(), s.io, {});
    expect(b.applyLigne("a", ligne("t1", { conformite: "C" }), 2)).toBe(true);
    expect(b.list[0]!.lignes[0]!.conformite).toBe("C");
    expect(b.applyLigne("a", ligne("t1", { conformite: "NA" }), 2)).toBe(false); // already known
    expect(b.applyRemote({ registre: reg("a", "par Bob", [ligne("t1", { conformite: "C" }), ligne("t9")]), version: 2, lignes: { t1: 2, t9: 1 } })).toBe(true);
    expect(b.list[0]).toMatchObject({ nom: "par Bob" });
    expect(b.list[0]!.lignes.map((l) => l.texte.id)).toEqual(["t1", "t9"]);
    expect(b.applyLigneRemoval("a", "t9")).toBe(true);
    b.save([b.list[0]!, reg("b", "mine")], b.list);
    expect(b.applyRemote({ registre: reg("b", "theirs"), version: 2, lignes: {} })).toBe(false); // ours waits: the save merges
    await vi.advanceTimersByTimeAsync(1000);
    expect(b.applyRemoval("a")).toBe(true);
    expect(b.list.map((r) => r.id)).toEqual(["b"]);
  });

  it("keeps what failed and sends it again", async () => {
    vi.useFakeTimers();
    let down = true;
    const s = server();
    const io: SyncIO = { ...s.io, create: (r) => (down ? Promise.reject(new Error("réseau indisponible")) : s.io.create(r)) };
    const states: SyncState[] = [];
    const b = cloudBackend([], io, { onState: (x) => states.push(x) });
    b.save([reg("a", "A1", [ligne("t1")])], []);
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toEqual({ state: "error", message: "réseau indisponible" });
    b.save([reg("a", "A2", [ligne("t1", { plan: "x" })])], b.list);
    down = false;
    await vi.advanceTimersByTimeAsync(6000);
    expect(s.metas.get("a")!.r.nom).toBe("A2");
    expect(s.lines.get("a/t1")!.l.plan).toBe("x");
    expect(states.at(-1)?.state).toBe("saved");
  });

  it("sends a new register at once, with its lines, and only once", async () => {
    vi.useFakeTimers();
    const s = server();
    const b = cloudBackend([], s.io, { delay: 1500 });
    b.save([reg("n", "Neuf", [ligne("t1"), ligne("t2")])], []);
    await vi.advanceTimersByTimeAsync(10);
    expect(s.calls).toEqual(["create n: t1 t2"]);
    expect(b.ligneVersionOf("n", "t2")).toBe(1);
    b.save([withLigne(b.list[0]!, ligne("t2", { plan: "x" }))], b.list);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.calls).toEqual(["create n: t1 t2", "lignes n: t2@1"]);
  });

  it("does not send anything for a reader", async () => {
    vi.useFakeTimers();
    const s = server();
    const states: SyncState["state"][] = [];
    const b = cloudBackend([], s.io, { readOnly: true, onState: (x) => states.push(x.state) });
    b.save([reg("a")], []);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.calls).toEqual([]);
    expect(states).toEqual(["readonly"]);
  });
});
