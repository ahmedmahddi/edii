/**
 * Veille réglementaire: which JORT texts concern the app, from their sommaire titles.
 *
 * Rules are in data/veille/watch.json. "references" catch a title that cites a text the app is built
 * on (the nomenclature and its amendments, décret n° 2005-1991, décret n° 2006-2687): such a text
 * may change the app, so it is "critique". "topics" catch a title on one of the app's subjects:
 * "important". The result is a candidate for a person to read, never a legal conclusion.
 */
import watch from "@/data/veille/watch.json";
import type { Issue, SommaireEntry } from "./jort";
import { pdfPage, pdfUrl } from "./jort";

export type Severity = "critique" | "important";
export type Impact = "nomenclature" | "addition" | "etude" | "procedures";

interface Rule {
  id: string;
  label: string;
  any: string[];
  with?: string[];
  impacts: string[];
}

export const rules = watch as unknown as { ignore: string[]; references: Rule[]; topics: Rule[] };

export interface Match {
  rule: string;
  label: string;
  terms: string[]; // what matched in the title
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
  impacts: Impact[];
  matches: Match[];
}

export interface Feed {
  updated: string | null; // last run of the scanner
  scanned: Record<string, number[]>; // year → issue numbers read
  hits: Hit[];
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

function apply(rule: Rule, title: string): Match | null {
  const terms = rule.any.filter((t) => contains(title, t));
  if (!terms.length) return null;
  if (rule.with) {
    const also = rule.with.filter((t) => contains(title, t));
    if (!also.length) return null;
    terms.push(...also);
  }
  return { rule: rule.id, label: rule.label, terms };
}

/** The rules a sommaire entry matches, and how severe; null when none (or when ignored). */
export function assess(entry: Pick<SommaireEntry, "title">): Pick<Hit, "severity" | "impacts" | "matches"> | null {
  const title = fold(entry.title);
  if (rules.ignore.some((p) => title.startsWith(fold(p)))) return null;
  const refs = rules.references.map((r) => [r, apply(r, title)] as const).filter(([, m]) => m);
  const topics = rules.topics.map((r) => [r, apply(r, title)] as const).filter(([, m]) => m);
  const all = [...refs, ...topics];
  if (!all.length) return null;
  const impacts = [...new Set(all.flatMap(([r]) => r.impacts))] as Impact[];
  return { severity: refs.length ? "critique" : "important", impacts, matches: all.map(([, m]) => m!) };
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

/** Add an issue's hits to the feed (replacing any from a previous read of the same issue). */
export function record(feed: Feed, year: number, issue: Issue): Feed {
  if (issue.number === null) return feed;
  const hits = feed.hits.filter((h) => !(h.year === year && h.issue === issue.number)).concat(hitsOf(year, issue));
  hits.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.issue - a.issue || a.page - b.page);
  const scanned = { ...feed.scanned, [year]: [...new Set([...(feed.scanned[year] ?? []), issue.number])].sort((a, b) => a - b) };
  return { ...feed, scanned, hits };
}
