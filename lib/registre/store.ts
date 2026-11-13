/**
 * The registers on screen: one store for every screen, read with useSyncExternalStore. They are
 * kept in this browser (localStorage) by default, or in a client workspace once signed in
 * (lib/cloud/sync.ts gives a backend that sends the changes). A change made anywhere is seen
 * everywhere at once (the menu's count, the home, the open register); a colleague's change too, with
 * a word to say so (onRemote).
 */
import { compacter, type Registre } from "@/lib/registre/registre";

/** Where the registers go once changed: a client workspace (lib/cloud/sync.ts). */
export interface RegistreBackend {
  list: Registre[];
  save(next: Registre[], prev: Registre[]): void;
}

/** Registers changed by someone else ("remote"), or ours merged with a colleague's ("merged"). */
export type Remote = { ids: string[]; kind: "remote" | "merged" };

// Kept in this browser. Reading may fail (private window, blocked storage): then nothing is kept.
const STORAGE = "abclassement-registres";

let backend: RegistreBackend | null = null;
let local: { raw: string | null; list: Registre[] } = { raw: null, list: [] };
let saved = true;
const listeners = new Set<() => void>();
const remoteListeners = new Set<(r: Remote) => void>();
const notify = () => listeners.forEach((fn) => fn());

/** The registers kept in this browser, whatever the backend (to import them into a workspace). */
export function localRegistres(): Registre[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE);
  } catch {
    return local.list;
  }
  // The same array while nothing changed: React compares snapshots by identity.
  if (raw === local.raw) return local.list;
  try {
    const list: unknown = JSON.parse(raw ?? "[]");
    local = { raw, list: Array.isArray(list) ? (list as Registre[]).map(compacter) : [] };
  } catch {
    local = { raw, list: [] };
  }
  return local.list;
}

export function clearLocalRegistres(): void {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    // nothing kept, nothing to clear
  }
  if (!backend) notify();
}

export const registres = {
  /** The registers now (the same array until they change). */
  get(): Registre[] {
    return backend ? backend.list : localRegistres();
  },
  /** False when this browser could not keep the last change (private window, storage full). */
  saved(): boolean {
    return saved;
  },
  set(next: Registre[]): void {
    if (backend) {
      const prev = backend.list;
      backend.list = next;
      backend.save(next, prev);
      saved = true;
    } else {
      try {
        const raw = JSON.stringify(next);
        localStorage.setItem(STORAGE, raw);
        local = { raw, list: next };
        saved = true;
      } catch {
        local = { raw: local.raw, list: next };
        saved = false;
      }
    }
    notify();
  },
  update(fn: (list: Registre[]) => Registre[]): void {
    registres.set(fn(registres.get()));
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    // Another tab of this browser changed them (local mode).
    const storage = (e: StorageEvent) => {
      if (!backend && e.key === STORAGE) fn();
    };
    window.addEventListener("storage", storage);
    return () => {
      listeners.delete(fn);
      window.removeEventListener("storage", storage);
    };
  },
  /** A workspace's registers (null: back to this browser's). */
  setBackend(b: RegistreBackend | null): void {
    backend = b;
    notify();
  },
  /** The backend's list was replaced (a colleague's change, a merge): say it to the screens. */
  announce(remote: Remote): void {
    notify();
    remoteListeners.forEach((fn) => fn(remote));
  },
  onRemote(fn: (r: Remote) => void): () => void {
    remoteListeners.add(fn);
    return () => remoteListeners.delete(fn);
  },
};
