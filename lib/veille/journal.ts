/**
 * The Journal officiel screen's list, answered by the server (app/api/journal): the texts the
 * veille found, filtered and a page at a time, instead of the browser downloading all of them.
 * The reading statuses are the browser's own (kept there, sent with each request).
 */
import { byNewest } from "@/lib/veille/served";
import { fold, type Hit, type Severity } from "@/lib/veille/watch";

export type Statut = "a-lire" | "pertinent" | "sans-objet";
export const STATUTS: Record<Statut, string> = { "a-lire": "À lire", pertinent: "Pertinent", "sans-objet": "Sans objet" };
export type Niveau = "tous" | "important" | "critique";

export interface JournalQuery {
  q?: string;
  niveau?: Niveau;
  domaine?: string; // "" or absent: all
  secteur?: string;
  statut?: Statut | "tous";
  /** The statuses set in this browser (texts not listed are "à lire"). */
  statuts?: Record<string, Statut>;
  page?: number; // from 0
  /** Every text matching (the Excel export), not one page. */
  tout?: boolean;
}

export interface JournalPage {
  total: number; // texts matching
  hits: Hit[];
  page: number;
  pages: number;
  /** Across the whole journal, whatever the filters. */
  counts: Record<Severity, number> & { aLire: number };
  domaines: string[]; // domains and sectors that occur, for the filters
  secteurs: string[];
}

export const PAGE_SIZE = 25;
const MAX_ALL = 10_000;

export function journal(all: Hit[], query: JournalQuery): JournalPage {
  const statuts = query.statuts ?? {};
  const statutOf = (h: Hit): Statut => statuts[h.id] ?? "a-lire";
  const q = fold(query.q ?? "");
  const niveau = query.niveau ?? "tous";
  const matching = all
    .filter(
      (h) =>
        (niveau === "tous" || (niveau === "critique" ? h.severity === "critique" : h.severity !== "information")) &&
        (!query.domaine || h.domains.includes(query.domaine)) &&
        (!query.secteur || h.sectors.includes(query.secteur)) &&
        (!query.statut || query.statut === "tous" || statutOf(h) === query.statut) &&
        (!q || fold(`${h.title} ${h.institution ?? ""}`).includes(q)),
    )
    .sort(byNewest);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, Math.floor(query.page ?? 0)), pages - 1);
  const count = (s: Severity) => all.filter((h) => h.severity === s).length;
  return {
    total: matching.length,
    hits: query.tout ? matching.slice(0, MAX_ALL) : matching.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    page,
    pages,
    counts: { critique: count("critique"), important: count("important"), information: count("information"), aLire: all.filter((h) => statutOf(h) === "a-lire").length },
    domaines: [...new Set(all.flatMap((h) => h.domains))],
    secteurs: [...new Set(all.flatMap((h) => h.sectors))].sort(),
  };
}

/** A request's body, as sent by a browser: only what is expected, of the expected types. */
export function parseQuery(body: unknown): JournalQuery {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const statuts: Record<string, Statut> = {};
  if (b.statuts && typeof b.statuts === "object")
    for (const [id, s] of Object.entries(b.statuts as Record<string, unknown>).slice(0, 20_000))
      if ((s === "pertinent" || s === "sans-objet" || s === "a-lire") && id.length <= 80) statuts[id] = s;
  const niveau = b.niveau === "critique" || b.niveau === "important" ? b.niveau : "tous";
  const statut = b.statut === "a-lire" || b.statut === "pertinent" || b.statut === "sans-objet" ? b.statut : "tous";
  return {
    q: str(b.q),
    niveau,
    domaine: str(b.domaine, 60),
    secteur: str(b.secteur, 10),
    statut,
    statuts,
    page: typeof b.page === "number" && Number.isFinite(b.page) ? b.page : 0,
    tout: b.tout === true,
  };
}
