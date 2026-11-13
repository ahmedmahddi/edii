"use client";
/** The registers, for the screens: the one store of lib/registre/store.ts, read the React way. */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Registre } from "@/lib/registre/registre";
import { type Remote, registres } from "@/lib/registre/store";

const none = () => null;

/**
 * The registers to read and change. `loaded` is false during the first render (the server's and
 * the hydration's: the registers are in the browser).
 */
export function useRegistres(): { list: Registre[]; update: (fn: (list: Registre[]) => Registre[]) => void; saved: boolean; loaded: boolean } {
  const list = useSyncExternalStore<Registre[] | null>(registres.subscribe, registres.get, none);
  const saved = useSyncExternalStore(registres.subscribe, registres.saved, () => true);
  return { list: list ?? [], update: registres.update, saved, loaded: list !== null };
}

/** The registers, read only (null until loaded). */
export function useRegistreList(): Registre[] | null {
  return useSyncExternalStore<Registre[] | null>(registres.subscribe, registres.get, none);
}

/** A word when a colleague's changes reach this register, or ours were merged with theirs; gone after 6 s. */
export function useRemoteNotice(id: string): string {
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = registres.onRemote((r: Remote) => {
      if (!r.ids.includes(id)) return;
      setNotice(r.kind === "merged" ? "Vos modifications ont été fusionnées avec celles d’un collègue." : "Registre mis à jour par un collègue.");
      clearTimeout(timer);
      timer = setTimeout(() => setNotice(""), 6000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [id]);
  return notice;
}
