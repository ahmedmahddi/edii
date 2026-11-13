/**
 * The registers of a client workspace, kept in Supabase. The pages change the list as before
 * (saveRegistres); the changes are sent shortly after, register by register (only those changed),
 * each from the version it was read at. When a colleague saved the same register meanwhile, the
 * save is refused with their copy: both are merged (lib/registre/merge.ts) and saved again, and the
 * page shows the merged register. A colleague's save heard live (or on coming back to the page)
 * replaces a register that has no change waiting here.
 */
import { mergeRegistre } from "@/lib/registre/merge";
import type { Registre, RegistreBackend } from "@/lib/registre/registre";

export type SyncState = { state: "saved" | "saving" | "error" | "readonly"; message?: string };
export const SYNC_EVENT = "abclassement-sync";

/** The registers added or changed, and the ids of those removed, from one list to the next. */
export function diff(prev: Registre[], next: Registre[]): { upserts: Registre[]; deletes: string[] } {
  const before = new Map(prev.map((r) => [r.id, JSON.stringify(r)]));
  const ids = new Set(next.map((r) => r.id));
  return {
    upserts: next.filter((r) => before.get(r.id) !== JSON.stringify(r)),
    deletes: prev.filter((r) => !ids.has(r.id)).map((r) => r.id),
  };
}

export type Saved = { ok: true; version: number } | { ok: false; version: number; current: Registre };
export interface Stored {
  registre: Registre;
  version: number;
}

export interface CloudBackend extends RegistreBackend {
  /** Changes not sent yet (or being sent). */
  pending(): boolean;
  /** Send what waits now (before leaving, switching workspace). */
  flush(): Promise<void>;
  /** A colleague's save: taken unless a change of ours waits for that register. True when taken. */
  applyRemote(s: Stored): boolean;
  /** A register removed by a colleague: dropped unless a change of ours waits for it. */
  applyRemoval(id: string): boolean;
  /** The version known for a register (0: never saved). */
  versionOf(id: string): number;
  dispose(): void;
}

const MAX_MERGES = 3;

export function cloudBackend(
  initial: Stored[],
  io: { save(r: Registre, expected: number | null): Promise<Saved>; remove(ids: string[]): Promise<void> },
  {
    readOnly = false,
    delay = 800,
    retry = 5000,
    onState = (_: SyncState) => {},
    onMerged = (_: string[]) => {},
  }: { readOnly?: boolean; delay?: number; retry?: number; onState?: (s: SyncState) => void; onMerged?: (ids: string[]) => void } = {},
): CloudBackend {
  const waiting = new Map<string, Registre | null>(); // id → the register to write, or null to delete
  const versions = new Map(initial.map((s) => [s.registre.id, s.version]));
  const bases = new Map(initial.map((s) => [s.registre.id, s.registre])); // the copy last read or saved
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  /** Save one register, merging with colleagues' saves until it goes through. */
  const saveOne = async (r: Registre): Promise<Registre> => {
    let toSave = r;
    for (let i = 0; i <= MAX_MERGES; i++) {
      const res = await io.save(toSave, versions.get(r.id) ?? null);
      if (res.ok) {
        versions.set(r.id, res.version);
        bases.set(r.id, toSave);
        return toSave;
      }
      // Someone saved meanwhile: our changes on top of theirs, then try again from their version.
      toSave = mergeRegistre(bases.get(r.id), toSave, res.current);
      versions.set(r.id, res.version);
      bases.set(r.id, res.current);
    }
    throw new Error("Le registre change trop souvent en même temps : nouvel essai…");
  };

  const send = async () => {
    const batch = new Map(waiting);
    waiting.clear();
    const upserts = [...batch.values()].filter((r): r is Registre => r !== null);
    const deletes = [...batch].filter(([, r]) => r === null).map(([id]) => id);
    onState({ state: "saving" });
    const merged: string[] = [];
    try {
      for (const r of upserts) {
        const saved = await saveOne(r);
        if (saved !== r) {
          // Merged with a colleague's changes: the page shows the merged register, with any change
          // made here since put on top of it.
          const newer = waiting.get(r.id);
          const current = newer ? mergeRegistre(r, newer, saved) : saved;
          if (newer) waiting.set(r.id, current);
          backend.list = backend.list.map((x) => (x.id === r.id ? current : x));
          merged.push(r.id);
        }
        batch.delete(r.id);
      }
      await io.remove(deletes);
      for (const id of deletes) {
        versions.delete(id);
        bases.delete(id);
        batch.delete(id);
      }
      if (merged.length) onMerged(merged);
      onState(waiting.size ? { state: "saving" } : { state: "saved", message: merged.length ? "Fusionné avec les modifications d’un collègue" : undefined });
      if (waiting.size && !disposed) schedule(delay);
    } catch (error) {
      // Put back what was not sent and not superseded meanwhile, and try again a little later.
      for (const [id, r] of batch) if (!waiting.has(id)) waiting.set(id, r);
      if (merged.length) onMerged(merged);
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

  const busy = (id: string) => waiting.has(id) || running !== null;

  const backend: CloudBackend = {
    list: initial.map((s) => s.registre),
    save(next, prev) {
      if (readOnly) {
        onState({ state: "readonly" });
        return;
      }
      const { upserts, deletes } = diff(prev, next);
      for (const r of upserts) waiting.set(r.id, r);
      for (const id of deletes) waiting.set(id, null);
      if (waiting.size) {
        onState({ state: "saving" });
        schedule(delay);
      }
    },
    pending: () => waiting.size > 0 || running !== null,
    flush,
    applyRemote({ registre, version }) {
      if (version <= (versions.get(registre.id) ?? 0) || busy(registre.id)) return false;
      versions.set(registre.id, version);
      bases.set(registre.id, registre);
      const known = backend.list.some((r) => r.id === registre.id);
      backend.list = known ? backend.list.map((r) => (r.id === registre.id ? registre : r)) : [...backend.list, registre];
      return true;
    },
    applyRemoval(id) {
      if (!versions.has(id) || busy(id)) return false;
      versions.delete(id);
      bases.delete(id);
      const before = backend.list.length;
      backend.list = backend.list.filter((r) => r.id !== id);
      return backend.list.length !== before;
    },
    versionOf: (id) => versions.get(id) ?? 0,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
  return backend;
}
