/**
 * What the site serves of the veille, split by use, so that a screen downloads only what it needs.
 * Written at build (npm run veille --reassess, before dev and build) into public/veille/:
 *
 *   meta.json        the issues read and the texts of the last 120 days (home, menu, e-mails)  ~0.1 MB
 *   catalogue.json   every text a register can hold, built once here, not in each browser       ~4 MB (0.6 gz)
 *   amendements.json the JORT texts that modify a text of the référentiel (registers' alerts)   ~0.6 MB
 *
 * Everything (data/build/feed.json) stays on the server: the Journal officiel screen asks it for a
 * page at a time (app/api/journal). The fiches (requirements, written résumés, risks and plans) are not public files: the server
 * gives them one text at a time (app/api/fiches), from data/build/fiches.json.
 */
import { amendments, catalogue, type Texte } from "@/lib/registre/referentiel";
import { type LiveIssue, withLive } from "@/lib/veille/live";
import type { Amendment, Feed, Hit, Sommaires } from "@/lib/veille/watch";

export const RECENT_DAYS = 120;

export interface VeilleMeta {
  updated: string | null;
  scanned: Record<string, number[]>;
  /** The texts found in the last RECENT_DAYS days before the last issue read, newest first. */
  recent: Hit[];
}

const minusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/** The newest first: by year, issue, then page. */
export const byNewest = (a: Hit, b: Hit) => b.year - a.year || b.issue - a.issue || a.page - b.page;

export function served(feed: Feed): { meta: VeilleMeta; catalogue: Texte[]; amendements: Amendment[] } {
  const last = feed.hits.reduce<string | null>((m, h) => (h.date && (!m || h.date > m) ? h.date : m), null);
  const from = last ? minusDays(last, RECENT_DAYS) : null;
  return {
    meta: {
      updated: feed.updated,
      scanned: feed.scanned,
      recent: from ? feed.hits.filter((h) => h.date && h.date > from).sort(byNewest) : [],
    },
    catalogue: catalogue(feed.hits, feed.amendments ?? [], feed.citations ?? {}),
    amendements: feed.amendments ?? [],
  };
}

/** The last issue read: its year and number. */
export function lastIssue(scanned: Record<string, number[]>): { year: number; number: number } | null {
  const y = Object.keys(scanned)
    .map(Number)
    .filter((year) => scanned[String(year)]?.length)
    .sort((a, b) => b - a)[0];
  return y === undefined ? null : { year: y, number: Math.max(...scanned[String(y)]!) };
}

/**
 * What the site serves, with the issues read in this browser by "Vérifier maintenant" (kept until
 * a deployment carries them): their texts join the catalogue and the recent texts, and the texts of
 * the référentiel they modify join the amendments.
 */
export function withLiveIssues(
  base: { meta: VeilleMeta; catalogue: Texte[]; amendements: Amendment[] },
  issues: LiveIssue[],
): { meta: VeilleMeta; catalogue: Texte[]; amendements: Amendment[] } {
  const fresh = issues.filter((i) => i.issue && !(base.meta.scanned[String(i.year)] ?? []).includes(i.number));
  if (!fresh.length) return base;
  const live = withLive({ updated: null, scanned: base.meta.scanned, hits: [] }, fresh);
  const known = new Set(base.catalogue.map((t) => t.id));
  const texts = [...base.catalogue, ...catalogue(live.hits).filter((t) => t.origine === "jort" && !known.has(t.id))];
  const years: Sommaires[] = [...new Set(fresh.map((i) => i.year))].map((year) => ({
    year,
    issues: Object.fromEntries(fresh.filter((i) => i.year === year).map((i) => [String(i.number), i.issue!])),
  }));
  const knownAmendments = new Set(base.amendements.map((a) => a.id));
  return {
    meta: { ...base.meta, scanned: live.scanned, recent: [...live.hits, ...base.meta.recent].sort(byNewest) },
    catalogue: texts,
    amendements: [...base.amendements, ...amendments(years, texts).filter((a) => !knownAmendments.has(a.id))],
  };
}
