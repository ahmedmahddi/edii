"use client";
/** The classifications, for the screens: the store of lib/classement/store.ts, read the React way. */
import { useSyncExternalStore } from "react";
import type { Classement } from "@/lib/classement/classement";
import { classements } from "@/lib/classement/store";

const none = () => null;

/** The classifications (null until loaded: they are in the browser or the workspace). */
export function useClassements(): Classement[] | null {
  return useSyncExternalStore<Classement[] | null>(classements.subscribe, classements.get, none);
}
