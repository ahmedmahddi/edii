/**
 * Veille réglementaire: which JORT texts concern ABClassement's users, from their sommaire titles.
 *
 * Rules are in data/veille/watch.json, by domain: établissements classés, environnement, santé et
 * sécurité au travail, hygiène, sécurité incendie, produits dangereux, and the sectors of the
 * nomenclature, and for companies in general droit du travail, code de la route and fiscalité. A
 * title citing a text the app is built on is "critique"; other rules are
 * "important" (an obligation for establishments) or "information" (sector news). The issuer
 * ("Arrêté du ministre de l'industrie, des mines et de l'énergie du 3 mars 2026,") is left out
 * before matching, so a ministry's name does not count as a subject. A hit is something to read,
 * never a legal conclusion.
 */
import watch from "@/data/veille/watch.json";
import type { Issue, SommaireEntry } from "./jort";
import { pdfPage, pdfUrl } from "./jort";

export type Severity = "critique" | "important" | "information";
export type Impact = "nomenclature" | "addition" | "etude" | "procedures";

interface Rule {
  id: string;
  label: string;
  level?: "important" | "information";
  domain?: string;
  sectors?: string[];
  any?: string[];
  with?: string[];
  institution?: string[];
  impacts?: string[];
}

export const rules = watch as unknown as {
  domains: Record<string, string>;
  registre: { systemes: Record<string, string>; frequence: string };
  ignore: string[];
  ignoreAnywhere: string[];
  demote: string[];
  references: Rule[];
  rules: Rule[];
};

export const SEVERITY_RANK: Record<Severity, number> = { critique: 0, important: 1, information: 2 };

export interface Match {
  rule: string;
  label: string;
  terms: string[]; // what matched
}

export interface Hit {
  id: string; // "2010-018-559-1": stable across runs
  year: number;
  issue: number;
  date: string | null;
  pdf: string; // issue PDF, with #page= when known
  page: number;
  institution: string | null;
  kind: string;
  title: string;
  severity: Severity;
  domains: string[];
  sectors: string[]; // sections of the nomenclature ("1200")
  impacts: Impact[];
  matches: Match[];
}

export interface Feed {
  updated: string | null; // last run of the scanner
  scanned: Record<string, number[]>; // year → issue numbers read
  hits: Hit[];
}

/** Every sommaire read, kept so that edited rules can be applied again without downloading. */
export interface Sommaires {
  year: number;
  updated?: string; // when an issue of that year was last read
  issues: Record<string, Issue>; // issue number → its sommaire
}

/** Lower case, no accents, plain apostrophes and spaces: titles and rules compare on this. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/œ/g, "oe")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Whole words or phrases only: "anpe" must not match inside another word. */
function contains(text: string, term: string): boolean {
  const t = fold(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${t}($|[^a-z0-9])`).test(text);
}

const MONTH = "(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)";
const ISSUER = new RegExp(
  `^(?:arretes?|decisions?|circulaires?)(?: conjoints?)? (?:du|de la|des|de l'|de)\\s.*?\\bdu \\d{1,2}(?:er)? ${MONTH} \\d{4}\\s*,\\s*`,
);

/** The title without its issuer: "Arrêté du ministre … du 3 mars 2026, fixant …" → "fixant …". */
export function subject(title: string): string {
  const t = fold(title);
  const m = ISSUER.exec(t);
  return m ? t.slice(m[0].length) : t;
}

function apply(rule: Rule, text: string, institution: string): Match | null {
  if (rule.institution) {
    const terms = rule.institution.filter((t) => contains(institution, t));
    return terms.length ? { rule: rule.id, label: rule.label, terms } : null;
  }
  const terms = (rule.any ?? []).filter((t) => contains(text, t));
  if (!terms.length) return null;
  if (rule.with) {
    const also = rule.with.filter((t) => contains(text, t));
    if (!also.length) return null;
    terms.push(...also);
  }
  return { rule: rule.id, label: rule.label, terms };
}

/** The rules a sommaire entry matches, and how severe; null when none (or when ignored). */
export function assess(
  entry: Pick<SommaireEntry, "title"> & Partial<Pick<SommaireEntry, "institution">>,
): Pick<Hit, "severity" | "domains" | "sectors" | "impacts" | "matches"> | null {
  const full = fold(entry.title);
  if (rules.ignore.some((p) => full.startsWith(fold(p)))) return null;
  if (rules.ignoreAnywhere.some((p) => contains(full, p))) return null;
  const text = subject(entry.title);
  const institution = fold(entry.institution ?? "");
  // References are looked for in the whole title: "modifiant l'arrêté du 15 novembre 2005" is
  // after the issuer, but a reference may also sit in it.
  const refs = rules.references.map((r) => [r, apply(r, full, institution)] as const).filter(([, m]) => m);
  const others = rules.rules.map((r) => [r, apply(r, text, institution)] as const).filter(([, m]) => m);
  if (!refs.length && !others.length) return null;
  // A text found only by its institution, with nothing in its title, is information at most; so is
  // an international agreement or a one-off act (rules.demote).
  const severity: Severity = refs.length
    ? "critique"
    : others.some(([r]) => r.level === "important" && !r.institution) && !rules.demote.some((p) => contains(full, p))
      ? "important"
      : "information";
  const all = [...refs, ...others];
  return {
    severity,
    domains: [...new Set([...(refs.length ? ["etablissements-classes"] : []), ...others.map(([r]) => r.domain ?? "secteurs")])],
    sectors: [...new Set(all.flatMap(([r]) => r.sectors ?? []))].sort(),
    impacts: [...new Set(all.flatMap(([r]) => r.impacts ?? []))] as Impact[],
    matches: all.map(([, m]) => m!),
  };
}

/** The hits of one issue. */
export function hitsOf(year: number, issue: Issue): Hit[] {
  if (issue.number === null) return [];
  const url = pdfUrl(year, issue.number);
  return issue.entries.flatMap((entry, index) => {
    const found = assess(entry);
    if (!found) return [];
    const page = pdfPage(issue, entry.page);
    return [
      {
        id: `${year}-${String(issue.number).padStart(3, "0")}-${entry.page}-${index}`,
        year,
        issue: issue.number!,
        date: issue.date,
        pdf: page ? `${url}#page=${page}` : url,
        page: entry.page,
        institution: entry.institution,
        kind: entry.kind,
        title: entry.title,
        ...found,
      },
    ];
  });
}

function sortHits(hits: Hit[]): Hit[] {
  return hits.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.issue - a.issue || a.page - b.page);
}

/** Add an issue's hits to the feed (replacing any from a previous read of the same issue). */
export function record(feed: Feed, year: number, issue: Issue): Feed {
  if (issue.number === null) return feed;
  const hits = sortHits(feed.hits.filter((h) => !(h.year === year && h.issue === issue.number)).concat(hitsOf(year, issue)));
  const scanned = { ...feed.scanned, [year]: [...new Set([...(feed.scanned[year] ?? []), issue.number])].sort((a, b) => a - b) };
  return { ...feed, scanned, hits };
}

/** The feed rebuilt from stored sommaires with the current rules (after editing watch.json). */
export function reassess(feed: Feed, years: Sommaires[]): Feed {
  const kept = new Set(years.map((y) => y.year));
  let next: Feed = { ...feed, hits: feed.hits.filter((h) => !kept.has(h.year)) };
  for (const y of years) for (const issue of Object.values(y.issues)) next = record(next, y.year, issue);
  return next;
}
