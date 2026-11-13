/**
 * The registers of a client workspace, kept in Supabase: the register itself (name,
 * classification, site profile) in `registres`, each of its lines (one text: evaluation, evidence,
 * plan, history) in `registre_lignes`, each with its own version. The screens change the list as
 * before (lib/registre/store.ts); shortly after, only what changed is sent: the register's own
 * fields if they changed, and the lines that changed, each from the version it was read at.
 *
 * When a colleague saved the same line (or the register's fields) meanwhile, the save is refused
 * with their copy: both are merged (lib/registre/merge.ts) and saved again, and the screen shows
 * the merged copy. Two people on different texts of one register never meet. A colleague's change
 * heard live (or on coming back to the page) replaces what has no change of ours waiting.
 */
import { mergeLigne, mergeRegistre } from "@/lib/registre/merge";
import type { Ligne, Registre } from "@/lib/registre/registre";
import type { RegistreBackend } from "@/lib/registre/store";

export type SyncState = { state: "saved" | "saving" | "error" | "readonly"; message?: string };

export type Saved<T> = { ok: true; version: number } | { ok: false; version: number; current: T };

/** A register as stored: its own version, and the version of each of its lines (by text id). */
export interface Stored {
  registre: Registre;
  version: number;
  lignes: Record<string, number>;
}

export interface SyncIO {
  /** The register's own fields (not its lines), from the version read (null: new). */
  saveMeta(r: Registre, expected: number | null): Promise<Saved<Registre>>;
  /** Lines of one register, each from the version read (null: new). */
  saveLignes(rid: string, items: { ligne: Ligne; expected: number | null }[]): Promise<(Saved<Ligne> & { id: string })[]>;
  removeLignes(rid: string, ids: string[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

/** The register without its lines: what `registres.data` holds. `maj` aside: it follows any change. */
export const metaOf = (r: Registre): Omit<Registre, "lignes"> => {
  const { lignes: _lignes, ...meta } = r;
  return meta;
};
const sameMeta = (a: Registre, b: Registre) => JSON.stringify({ ...metaOf(a), maj: "" }) === JSON.stringify({ ...metaOf(b), maj: "" });
const idOf = (l: Ligne) => l.texte.id;

export interface Change {
  id: string;
  meta: boolean;
  lignes: string[]; // changed or added
  removed: string[];
}

/** What changed from one list to the next: per register, its fields and which lines; and the registers removed. */
export function diff(prev: Registre[], next: Registre[]): { changes: Change[]; deletes: string[] } {
  const before = new Map(prev.map((r) => [r.id, r]));
  const ids = new Set(next.map((r) => r.id));
  const changes: Change[] = [];
  for (const r of next) {
    const p = before.get(r.id);
    if (p === r) continue;
    if (!p) {
      changes.push({ id: r.id, meta: true, lignes: r.lignes.map(idOf), removed: [] });
      continue;
    }
    const old = new Map(p.lignes.map((l) => [idOf(l), l]));
    const lignes = r.lignes.filter((l) => old.get(idOf(l)) !== l && JSON.stringify(old.get(idOf(l))) !== JSON.stringify(l)).map(idOf);
    const kept = new Set(r.lignes.map(idOf));
    const removed = p.lignes.filter((l) => !kept.has(idOf(l))).map(idOf);
    const meta = !sameMeta(p, r);
    if (meta || lignes.length || removed.length) changes.push({ id: r.id, meta, lignes, removed });
  }
  return { changes, deletes: prev.filter((r) => !ids.has(r.id)).map((r) => r.id) };
}

export interface CloudBackend extends RegistreBackend {
  /** Changes not sent yet (or being sent). */
  pending(): boolean;
  /** Send what waits now (before leaving, switching workspace). */
  flush(): Promise<void>;
  /** A register as stored now (read again): what is newer than known and has no change of ours waiting is taken. True when something was. */
  applyRemote(s: Stored): boolean;
  /** One line saved by a colleague. */
  applyLigne(rid: string, ligne: Ligne, version: number): boolean;
  applyLigneRemoval(rid: string, tid: string): boolean;
  /** A register removed by a colleague: dropped unless a change of ours waits for it. */
  applyRemoval(id: string): boolean;
  /** The versions known (0: never saved). */
  versionOf(id: string): number;
  ligneVersionOf(rid: string, tid: string): number;
  dispose(): void;
}

type Pending = { meta: boolean; lignes: Set<string>; removed: Set<string> };
const MAX_MERGES = 3;
const key = (rid: string, tid: string) => `${rid}\u0000${tid}`;

export function cloudBackend(
  initial: Stored[],
  io: SyncIO,
  {
    readOnly = false,
    delay = 800,
    retry = 5000,
    onState = (_: SyncState) => {},
    onMerged = (_: string[]) => {},
  }: { readOnly?: boolean; delay?: number; retry?: number; onState?: (s: SyncState) => void; onMerged?: (ids: string[]) => void } = {},
): CloudBackend {
  let waiting = new Map<string, Pending | null>(); // register id → what to send, or null to delete it
  const metaVersions = new Map(initial.map((s) => [s.registre.id, s.version]));
  const metaBases = new Map(initial.map((s) => [s.registre.id, s.registre])); // last copy read or saved
  const lineVersions = new Map<string, number>();
  const lineBases = new Map<string, Ligne>();
  for (const s of initial)
    for (const l of s.registre.lignes) {
      const v = s.lignes[idOf(l)];
      if (v) {
        lineVersions.set(key(s.registre.id, idOf(l)), v);
        lineBases.set(key(s.registre.id, idOf(l)), l);
      }
    }
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };
  const find = (rid: string) => backend.list.find((r) => r.id === rid);
  const replace = (rid: string, fn: (r: Registre) => Registre) => {
    backend.list = backend.list.map((r) => (r.id === rid ? fn(r) : r));
  };
  const enqueue = (rid: string, p: Pending | null) => {
    const cur = waiting.get(rid);
    // Removed: nothing else to send. Back after a removal not sent yet (a backup restored): sent anew.
    if (p === null || !cur) return waiting.set(rid, p);
    p.lignes.forEach((t) => cur.lignes.add(t));
    p.removed.forEach((t) => cur.removed.add(t));
    cur.meta ||= p.meta;
  };

  /** The register's own fields, merged with a colleague's until saved. True when merged. */
  const saveMeta = async (rid: string): Promise<boolean> => {
    let merged = false;
    for (let i = 0; i <= MAX_MERGES; i++) {
      const mine = find(rid);
      if (!mine) return merged;
      const res = await io.saveMeta(mine, metaVersions.get(rid) ?? null);
      if (res.ok) {
        metaVersions.set(rid, res.version);
        metaBases.set(rid, mine);
        return merged;
      }
      // Someone saved meanwhile: our changes on top of theirs, then again from their version.
      const base = metaBases.get(rid);
      const m = mergeRegistre(base && { ...base, lignes: [] }, { ...mine, lignes: [] }, { ...res.current, lignes: [] });
      replace(rid, (r) => ({ ...m, lignes: r.lignes }));
      metaVersions.set(rid, res.version);
      metaBases.set(rid, res.current);
      merged = true;
    }
    throw new Error("Le registre change trop souvent en même temps : nouvel essai…");
  };

  /** Lines of one register, each merged with a colleague's until saved. True when one was merged. */
  const saveLignes = async (rid: string, ids: string[]): Promise<boolean> => {
    let todo = ids;
    let merged = false;
    for (let i = 0; i <= MAX_MERGES && todo.length; i++) {
      const r = find(rid);
      if (!r) return merged;
      const byId = new Map(r.lignes.map((l) => [idOf(l), l]));
      const items = todo.flatMap((tid) => {
        const ligne = byId.get(tid);
        return ligne ? [{ ligne, expected: lineVersions.get(key(rid, tid)) ?? null }] : [];
      });
      if (!items.length) return merged;
      const results = await io.saveLignes(rid, items);
      const sent = new Map(items.map((x) => [idOf(x.ligne), x.ligne]));
      const again: string[] = [];
      for (const res of results) {
        const k = key(rid, res.id);
        if (res.ok) {
          lineVersions.set(k, res.version);
          lineBases.set(k, sent.get(res.id)!);
          continue;
        }
        const mine = find(rid)?.lignes.find((l) => idOf(l) === res.id) ?? sent.get(res.id)!;
        const m = mergeLigne(lineBases.get(k), mine, res.current);
        replace(rid, (x) => ({ ...x, lignes: x.lignes.map((l) => (idOf(l) === res.id ? m : l)) }));
        lineVersions.set(k, res.version);
        lineBases.set(k, res.current);
        again.push(res.id);
        merged = true;
      }
      todo = again;
    }
    if (todo.length) throw new Error("Le registre change trop souvent en même temps : nouvel essai…");
    return merged;
  };

  const send = async () => {
    const batch = waiting;
    waiting = new Map();
    onState({ state: "saving" });
    const merged: string[] = [];
    const done = new Set<string>();
    try {
      const deletes = [...batch].filter(([, p]) => p === null).map(([id]) => id);
      for (const [rid, p] of batch) {
        if (!p) continue;
        // A new register: its own row first (its lines refer to it).
        const isNew = !metaVersions.has(rid);
        if ((p.meta || isNew) && (await saveMeta(rid))) merged.push(rid);
        if (p.lignes.size && (await saveLignes(rid, isNew ? find(rid)?.lignes.map(idOf) ?? [] : [...p.lignes]))) merged.push(rid);
        if (p.removed.size) {
          await io.removeLignes(rid, [...p.removed]);
          for (const tid of p.removed) {
            lineVersions.delete(key(rid, tid));
            lineBases.delete(key(rid, tid));
          }
        }
        done.add(rid);
      }
      await io.remove(deletes);
      for (const id of deletes) {
        metaVersions.delete(id);
        metaBases.delete(id);
        done.add(id);
      }
      if (merged.length) onMerged([...new Set(merged)]);
      onState(waiting.size ? { state: "saving" } : { state: "saved", message: merged.length ? "Fusionné avec les modifications d’un collègue" : undefined });
      if (waiting.size && !disposed) schedule(delay);
    } catch (error) {
      // Put back what was not sent, and try again a little later.
      for (const [rid, p] of batch) if (!done.has(rid)) enqueue(rid, p);
      if (merged.length) onMerged([...new Set(merged)]);
      onState({ state: "error", message: error instanceof Error ? error.message : String(error) });
      if (!disposed) schedule(retry);
    }
  };

  const flush = async (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (running) await running;
    if (!waiting.size) return;
    running = send();
    try {
      await running;
    } finally {
      running = null;
    }
  };

  const busy = (rid: string) => waiting.has(rid) || running !== null;

  const backend: CloudBackend = {
    list: initial.map((s) => s.registre),
    save(next, prev) {
      if (readOnly) {
        onState({ state: "readonly" });
        return;
      }
      backend.list = next; // what is sent is read from it
      const { changes, deletes } = diff(prev, next);
      for (const c of changes) enqueue(c.id, { meta: c.meta, lignes: new Set(c.lignes), removed: new Set(c.removed) });
      for (const id of deletes) enqueue(id, null);
      if (waiting.size) {
        onState({ state: "saving" });
        schedule(delay);
      }
    },
    pending: () => waiting.size > 0 || running !== null,
    flush,
    applyRemote(s) {
      const rid = s.registre.id;
      if (busy(rid)) return false;
      const known = find(rid);
      if (!known) {
        metaVersions.set(rid, s.version);
        metaBases.set(rid, s.registre);
        for (const l of s.registre.lignes) {
          lineVersions.set(key(rid, idOf(l)), s.lignes[idOf(l)] ?? 0);
          lineBases.set(key(rid, idOf(l)), l);
        }
        backend.list = [...backend.list, s.registre];
        return true;
      }
      let reg = known;
      if (s.version > (metaVersions.get(rid) ?? 0)) {
        reg = { ...s.registre, lignes: reg.lignes };
        metaVersions.set(rid, s.version);
        metaBases.set(rid, s.registre);
      }
      const theirs = new Map(s.registre.lignes.map((l) => [idOf(l), l]));
      let lignes = reg.lignes.filter((l) => theirs.has(idOf(l)) || !lineVersions.has(key(rid, idOf(l)))); // removed by a colleague
      for (const [tid, l] of theirs) {
        const v = s.lignes[tid] ?? 0;
        if (v <= (lineVersions.get(key(rid, tid)) ?? 0)) continue;
        lineVersions.set(key(rid, tid), v);
        lineBases.set(key(rid, tid), l);
        lignes = lignes.some((x) => idOf(x) === tid) ? lignes.map((x) => (idOf(x) === tid ? l : x)) : [...lignes, l];
      }
      if (reg === known && lignes.length === known.lignes.length && lignes.every((l, i) => l === known.lignes[i])) return false;
      replace(rid, () => ({ ...reg, lignes }));
      return true;
    },
    applyLigne(rid, ligne, version) {
      const k = key(rid, idOf(ligne));
      if (busy(rid) || version <= (lineVersions.get(k) ?? 0) || !find(rid)) return false;
      lineVersions.set(k, version);
      lineBases.set(k, ligne);
      replace(rid, (r) => ({
        ...r,
        lignes: r.lignes.some((l) => idOf(l) === idOf(ligne)) ? r.lignes.map((l) => (idOf(l) === idOf(ligne) ? ligne : l)) : [...r.lignes, ligne],
      }));
      return true;
    },
    applyLigneRemoval(rid, tid) {
      const k = key(rid, tid);
      if (busy(rid) || !lineVersions.has(k)) return false;
      lineVersions.delete(k);
      lineBases.delete(k);
      replace(rid, (r) => ({ ...r, lignes: r.lignes.filter((l) => idOf(l) !== tid) }));
      return true;
    },
    applyRemoval(id) {
      if (!metaVersions.has(id) || busy(id)) return false;
      metaVersions.delete(id);
      metaBases.delete(id);
      const before = backend.list.length;
      backend.list = backend.list.filter((r) => r.id !== id);
      return backend.list.length !== before;
    },
    versionOf: (id) => metaVersions.get(id) ?? 0,
    ligneVersionOf: (rid, tid) => lineVersions.get(key(rid, tid)) ?? 0,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
  return backend;
}
