/**
 * The classifications on screen: one store for every screen, as for the registers
 * (lib/registre/store.ts). Kept in this browser by default, or in the client workspace once signed
 * in (a backend given by app/components/cloud.tsx).
 */
import type { Classement } from "@/lib/classement/classement";

export interface ClassementBackend {
  list: Classement[];
  save(next: Classement[], prev: Classement[]): void;
}

const STORAGE = "abclassement-classements";
let backend: ClassementBackend | null = null;
let local: { raw: string | null; list: Classement[] } = { raw: null, list: [] };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function localList(): Classement[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE);
  } catch {
    return local.list;
  }
  if (raw === local.raw) return local.list;
  try {
    const list: unknown = JSON.parse(raw ?? "[]");
    local = { raw, list: Array.isArray(list) ? (list as Classement[]) : [] };
  } catch {
    local = { raw, list: [] };
  }
  return local.list;
}

export const classements = {
  get(): Classement[] {
    return backend ? backend.list : localList();
  },
  set(next: Classement[]): void {
    if (backend) {
      const prev = backend.list;
      backend.list = next;
      backend.save(next, prev);
    } else {
      try {
        const raw = JSON.stringify(next);
        localStorage.setItem(STORAGE, raw);
        local = { raw, list: next };
      } catch {
        local = { raw: local.raw, list: next };
      }
    }
    notify();
  },
  update(fn: (list: Classement[]) => Classement[]): void {
    classements.set(fn(classements.get()));
  },
  /** One classification changed (its date of change follows). */
  change(id: string, fn: (c: Classement) => Classement): void {
    classements.update((all) => all.map((c) => (c.id === id ? { ...fn(c), maj: new Date().toISOString() } : c)));
  },
  remove(id: string): void {
    classements.update((all) => all.filter((c) => c.id !== id));
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    const storage = (e: StorageEvent) => {
      if (!backend && e.key === STORAGE) fn();
    };
    window.addEventListener("storage", storage);
    return () => {
      listeners.delete(fn);
      window.removeEventListener("storage", storage);
    };
  },
  setBackend(b: ClassementBackend | null): void {
    backend = b;
    notify();
  },
  /** The backend's list was replaced (read again): say it to the screens. */
  changed(): void {
    notify();
  },
};

/** The classifications kept in this browser, whatever the backend (to import them into a workspace). */
export const localClassements = localList;
export function clearLocalClassements(): void {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    // nothing kept
  }
}
