"use client";
/**
 * The registers and the texts they draw from, for the screens. Registers live in this browser, or in
 * the client workspace when signed in (lib/cloud/sync.ts); the texts come from the veille's feed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFeed } from "@/app/components/veille";
import { catalogue, type Texte } from "@/lib/registre/referentiel";
import { CHANGED, loadRegistres, RELOADED, type Registre, saveRegistres } from "@/lib/registre/registre";
import type { Amendment, Feed } from "@/lib/veille/watch";

/**
 * The registers to read and change: loaded once (and again when another workspace is opened or a
 * colleague's changes arrive), saved after each change.
 */
export function useRegistres(): {
  list: Registre[];
  update: (fn: (list: Registre[]) => Registre[]) => void;
  saved: boolean;
  loaded: boolean;
} {
  const [list, setList] = useState<Registre[]>([]);
  const [saved, setSaved] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const changed = useRef(false);
  useEffect(() => {
    const reload = () => {
      changed.current = false;
      setList(loadRegistres());
    };
    reload();
    setLoaded(true);
    window.addEventListener(RELOADED, reload);
    return () => window.removeEventListener(RELOADED, reload);
  }, []);
  // Saved after rendering: saving tells the rest of the page (the menu's count), which must not
  // change while this renders.
  useEffect(() => {
    if (!changed.current) return;
    changed.current = false;
    setSaved(saveRegistres(list));
  }, [list]);
  const update = useCallback((fn: (list: Registre[]) => Registre[]) => {
    changed.current = true;
    setList(fn);
  }, []);
  return { list, update, saved, loaded };
}

/** The registers, read only, kept up to date (the home). */
export function useRegistreList(): Registre[] | null {
  const [list, setList] = useState<Registre[] | null>(null);
  useEffect(() => {
    const load = () => setList(loadRegistres());
    load();
    window.addEventListener(CHANGED, load);
    window.addEventListener(RELOADED, load);
    return () => {
      window.removeEventListener(CHANGED, load);
      window.removeEventListener(RELOADED, load);
    };
  }, []);
  return list;
}

// The catalogue is long to build (thousands of texts): once per feed.
const built = new WeakMap<Feed, Texte[]>();

/** Every text a register can hold (the référentiel and the JORT), and the amendments read at the JORT. */
export function useCatalogue(): { feed: Feed | null; texts: Texte[]; amendments: Amendment[] } {
  const feed = useFeed();
  if (!feed) return { feed, texts: [], amendments: [] };
  let texts = built.get(feed);
  if (!texts) {
    texts = catalogue(feed.hits, feed.amendments ?? [], feed.citations ?? {});
    built.set(feed, texts);
  }
  return { feed, texts, amendments: feed.amendments ?? [] };
}
