/**
 * The registers of a client workspace, kept in Supabase. The pages change the list as before
 * (saveRegistres); the changes are sent shortly after, register by register (only those changed),
 * and their state is told to the page (saved, saving, error: retried).
 */
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

export interface CloudBackend extends RegistreBackend {
  /** Changes not sent yet (or being sent). */
  pending(): boolean;
  /** Send what waits now (before leaving, switching workspace). */
  flush(): Promise<void>;
  dispose(): void;
}

export function cloudBackend(
  initial: Registre[],
  io: { upsert(list: Registre[]): Promise<void>; remove(ids: string[]): Promise<void> },
  { readOnly = false, delay = 800, retry = 5000, onState = (_: SyncState) => {} }: { readOnly?: boolean; delay?: number; retry?: number; onState?: (s: SyncState) => void } = {},
): CloudBackend {
  const waiting = new Map<string, Registre | null>(); // id → the register to write, or null to delete
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };

  const send = async () => {
    const batch = new Map(waiting);
    waiting.clear();
    const upserts = [...batch.values()].filter((r): r is Registre => r !== null);
    const deletes = [...batch].filter(([, r]) => r === null).map(([id]) => id);
    onState({ state: "saving" });
    try {
      await io.upsert(upserts);
      await io.remove(deletes);
      onState(waiting.size ? { state: "saving" } : { state: "saved" });
    } catch (error) {
      // Put back what was not superseded meanwhile, and try again a little later.
      for (const [id, r] of batch) if (!waiting.has(id)) waiting.set(id, r);
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

  return {
    list: initial,
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
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
