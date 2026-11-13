"use client";
import { useEffect, useState } from "react";
import type { FicheData } from "@/lib/veille/fiche";

/**
 * The texts' fiches (public/veille/fiches.json, written by npm run veille): what each text requires,
 * read from its articles, and the written résumés. Fetched once, when a register is opened.
 */
let fichesRequest: Promise<Record<string, FicheData>> | null = null;
export function useFiches(): Record<string, FicheData> {
  const [fiches, setFiches] = useState<Record<string, FicheData>>({});
  useEffect(() => {
    let live = true;
    fichesRequest ??= fetch("/veille/fiches.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    fichesRequest.then((f) => live && setFiches(f));
    return () => {
      live = false;
    };
  }, []);
  return fiches;
}
