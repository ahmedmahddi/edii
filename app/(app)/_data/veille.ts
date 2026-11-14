"use client";
/**
 * The veille's data for the screens, through TanStack Query: fetched once per visit and shared by
 * every screen (lib/veille/served.ts says what each file holds). The issues read in this browser by
 * "Vérifier maintenant" are merged in.
 */
import { type QueryClient, useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import type { Texte } from "@/lib/registre/referentiel";
import type { FicheData } from "@/lib/veille/fiche";
import { liveIssues, subscribeLive } from "@/lib/veille/live-store";
import { type VeilleMeta, withLiveIssues } from "@/lib/veille/served";
import type { Amendment } from "@/lib/veille/watch";

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const veilleKeys = {
  meta: ["veille", "meta"] as const,
  catalogue: ["veille", "catalogue"] as const,
  amendements: ["veille", "amendements"] as const,
  fiche: (id: string) => ["veille", "fiche", id] as const,
};

// Built with the site: they change with a deployment, not during a visit.
const STATIC = { staleTime: Infinity, gcTime: Infinity, retry: 2 } as const;

const EMPTY_META: VeilleMeta = { updated: null, scanned: {}, recent: [] };

const NO_LIVE: ReturnType<typeof liveIssues> = [];
/** The issues read in this browser with "Vérifier maintenant", not yet carried by the site. */
export function useLive() {
  return useSyncExternalStore(subscribeLive, liveIssues, () => NO_LIVE);
}

/** The issues read and the recent texts (small: the home, the menu). */
export function useVeilleMeta(): VeilleMeta | null {
  const live = useLive();
  const meta = useQuery({ queryKey: veilleKeys.meta, queryFn: () => json<VeilleMeta>("/veille/meta.json"), ...STATIC });
  return useMemo(() => (meta.data ? withLiveIssues({ meta: meta.data, catalogue: [], amendements: [] }, live).meta : null), [meta.data, live]);
}

/** The amendments alone (the menu's count). */
export function useAmendements(): Amendment[] | null {
  const q = useQuery({ queryKey: veilleKeys.amendements, queryFn: () => json<Amendment[]>("/veille/amendements.json"), ...STATIC });
  return q.data ?? null;
}

/** Every text a register can hold, and the amendments read at the JORT: what the registers need. */
export function useCatalogue(): { ready: boolean; meta: VeilleMeta; texts: Texte[]; amendments: Amendment[] } {
  const live = useLive();
  const [meta, catalogue, amendements] = useQueries({
    queries: [
      { queryKey: veilleKeys.meta, queryFn: () => json<VeilleMeta>("/veille/meta.json"), ...STATIC },
      { queryKey: veilleKeys.catalogue, queryFn: () => json<Texte[]>("/veille/catalogue.json"), ...STATIC },
      { queryKey: veilleKeys.amendements, queryFn: () => json<Amendment[]>("/veille/amendements.json"), ...STATIC },
    ],
  });
  return useMemo(() => {
    if (!meta.data || !catalogue.data || !amendements.data) return { ready: false, meta: meta.data ?? EMPTY_META, texts: [], amendments: [] };
    const merged = withLiveIssues({ meta: meta.data, catalogue: catalogue.data, amendements: amendements.data }, live);
    return { ready: true, meta: merged.meta, texts: merged.catalogue, amendments: merged.amendements };
  }, [meta.data, catalogue.data, amendements.data, live]);
}

/** The fiches of some texts, from the server (app/api/fiches), a hundred at a time. */
export async function fetchFiches(ids: string[]): Promise<Record<string, FicheData>> {
  const out: Record<string, FicheData> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    Object.assign(out, await json<Record<string, FicheData>>(`/api/fiches?ids=${part.map(encodeURIComponent).join(",")}`));
  }
  return out;
}

/** One text's fiche (its sheet). Undefined while it comes, null when the text has none. */
export function useFiche(id: string | null): FicheData | null | undefined {
  const q = useQuery({
    queryKey: veilleKeys.fiche(id ?? ""),
    queryFn: async () => (await fetchFiches([id!]))[id!] ?? null,
    enabled: !!id,
    ...STATIC,
  });
  return q.data;
}

/** The served files, fetched if not yet (the check of the JORT needs them all). */
export async function veilleBase(client: QueryClient): Promise<{ meta: VeilleMeta; catalogue: Texte[]; amendements: Amendment[] }> {
  const [meta, catalogue, amendements] = await Promise.all([
    client.ensureQueryData({ queryKey: veilleKeys.meta, queryFn: () => json<VeilleMeta>("/veille/meta.json"), ...STATIC }),
    client.ensureQueryData({ queryKey: veilleKeys.catalogue, queryFn: () => json<Texte[]>("/veille/catalogue.json"), ...STATIC }),
    client.ensureQueryData({ queryKey: veilleKeys.amendements, queryFn: () => json<Amendment[]>("/veille/amendements.json"), ...STATIC }),
  ]);
  return { meta, catalogue, amendements };
}
