/**
 * The classifications of a client workspace, kept in Supabase (table classements). Each is a short
 * document, saved whole shortly after a change; only those changed are sent, the removed ones
 * deleted. Two people rarely work on one classification at once: the last save is kept.
 */
import type { Classement } from "@/lib/classement/classement";
import type { ClassementBackend } from "@/lib/classement/store";

export interface ClassementsIO {
  upsert(list: Classement[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

export interface ClassementsCloud extends ClassementBackend {
  pending(): boolean;
  flush(): Promise<void>;
  /** A count of the changes made here: a list read before the last one is out of date. */
  generation(): number;
  /** The list read again (asked at `since`): taken unless a change of ours waits or came after. */
  replace(list: Classement[], since: number): boolean;
  dispose(): void;
}

export function classementsBackend(
  initial: Classement[],
  io: ClassementsIO,
  { readOnly = false, delay = 800, retry = 5000, onError = (_: string) => {} }: { readOnly?: boolean; delay?: number; retry?: number; onError?: (message: string) => void } = {},
): ClassementsCloud {
  const waiting = new Map<string, Classement | null>(); // id → to save, or null to delete
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;
  let changes = 0;
  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), ms);
  };
  const send = async () => {
    const batch = new Map(waiting);
    waiting.clear();
    try {
      const upserts = [...batch.values()].filter((c): c is Classement => c !== null);
      if (upserts.length) await io.upsert(upserts);
      const deletes = [...batch].filter(([, c]) => c === null).map(([id]) => id);
      if (deletes.length) await io.remove(deletes);
    } catch (e) {
      for (const [id, c] of batch) if (!waiting.has(id)) waiting.set(id, c);
      onError(e instanceof Error ? e.message : String(e));
      if (!disposed) schedule(retry);
    }
  };
  const flush = async () => {
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
  const backend: ClassementsCloud = {
    list: initial,
    save(next, prev) {
      backend.list = next;
      changes++;
      if (readOnly) return;
      const before = new Map(prev.map((c) => [c.id, c]));
      for (const c of next) {
        const p = before.get(c.id);
        if (p !== c && JSON.stringify(p) !== JSON.stringify(c)) waiting.set(c.id, c);
      }
      const ids = new Set(next.map((c) => c.id));
      for (const p of prev) if (!ids.has(p.id)) waiting.set(p.id, null);
      if (waiting.size) schedule(delay);
    },
    pending: () => waiting.size > 0 || running !== null,
    flush,
    generation: () => changes,
    replace(list, since) {
      if (since !== changes || backend.pending() || JSON.stringify(list) === JSON.stringify(backend.list)) return false;
      backend.list = list;
      return true;
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
  return backend;
}
