"use client";
/** Reading statuses of the Journal's texts: this browser's own notes, never sent but with the list's requests. */
import { useCallback, useSyncExternalStore } from "react";
import type { Statut } from "@/lib/veille/journal";

const KEY = "abclassement-veille-statuts";
const EVENT = "abclassement-veille-statuts";
let cache: { raw: string | null; value: Record<string, Statut> } = { raw: null, value: {} };

function read(): Record<string, Statut> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.value;
  }
  if (raw === cache.raw) return cache.value;
  try {
    cache = { raw, value: JSON.parse(raw ?? "{}") };
  } catch {
    cache = { raw, value: {} };
  }
  return cache.value;
}
const subscribe = (fn: () => void) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
};
const EMPTY: Record<string, Statut> = {};

export function useStatuts(): [Record<string, Statut>, (id: string, s: Statut) => void] {
  const statuts = useSyncExternalStore(subscribe, read, () => EMPTY);
  const set = useCallback((id: string, s: Statut) => {
    const next = { ...read() };
    if (s === "a-lire") delete next[id];
    else next[id] = s;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      cache = { raw: cache.raw, value: next }; // this visit only
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [statuts, set];
}
