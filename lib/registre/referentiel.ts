/**
 * The référentiel: every text a register can hold. Two origins, merged:
 *   - data/referentiel/textes.json, curated: texts with their summary of requirements, risk, and
 *     the conditions under which they apply (see lib/registre/profil.ts);
 *   - the texts the veille finds in the JORT (data/veille/feed.json), whose conditions come from
 *     the rule that found them ('when' in data/veille/watch.json).
 * A text is known by its number ("décret n° 2005-1991") or, without one, by its kind and date
 * ("arrêté du 10 janvier 1995"); that is also how a new JORT title is seen to modify it.
 */
import curated from "@/data/referentiel/textes.json";
import { isoDate, pdfPage, pdfUrl } from "../veille/jort";
import { type Amendment, fold, type Hit, ignored, rules, type Severity, type Sommaires, subject } from "../veille/watch";
import { applies, type Site } from "./profil";

export interface Texte {
  id: string;
  type: string; // "Décret"
  numero?: string; // "2005-1991"
  date?: string; // ISO: the text's own date
  titre: string;
  domaine: string; // a domain of the veille ("sst")
  theme: string; // the DOMAINE column of the register
  when?: string[]; // no 'when': added by hand only
  resume?: string; // summary of the requirements
  risque?: string;
  frequence?: string; // of evaluation, when not annual
  source?: string; // where to read it
  publie?: string; // "JORT n° 18/2010, p. 559"
  origine: "referentiel" | "jort";
  niveau?: Severity; // for a text found in the JORT
  remplace?: boolean; // a JORT text of a series (the SMIG of each year…) replaced by a newer one: not proposed
  coche?: string[]; // for a JORT text: the sites it is ticked for (the others with 'when': suggested)
}

export const REFERENTIEL: Texte[] = (curated as { textes: Omit<Texte, "origine">[] }).textes.map((t) => ({ ...t, origine: "referentiel" }));

const KIND = "(loi|decret-loi|decret|arrete|decision|circulaire)";
const KIND_NAME: Record<string, string> = { loi: "loi", "decret-loi": "decret-loi", decret: "decret", arrete: "arrete", decision: "decision", circulaire: "circulaire" };
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const DATE = `(\\d{1,2})(?:er)? (${MONTHS.join("|")}) (\\d{4})`;

/** Folded, with "n° 2013- 5183" made "n° 2013-5183" and plurals of kinds made singular. */
function prepare(title: string): string {
  return fold(title)
    .replace(/(\d)\s*-\s+(\d)/g, "$1-$2")
    .replace(/\b(lois|decrets|arretes|decisions|circulaires)\b/g, (k) => k.slice(0, -1))
    .replace(/\bdecret (?:gouvernemental|presidentiel)\b/g, "decret")
    .replace(/\bloi organique\b/g, "loi");
}

const iso = (d: string, m: string, y: string) => `${y}-${String(MONTHS.indexOf(m) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;

interface Named {
  key: string;
  at: number;
  subject: string; // what the title says of it, after its date ("fixant la liste des maladies…")
}

/** Every text a title names, in order: the first is the title's own. */
function named(title: string): Named[] {
  const t = prepare(title);
  const found: Named[] = [];
  for (const m of t.matchAll(new RegExp(`\\b${KIND}\\b[^,;]{0,40}?n° ?(\\d{2,4}-\\d{1,5})`, "g")))
    found.push({ key: `n:${KIND_NAME[m[1]]}:${m[2]}`, at: m.index!, subject: "" });
  // A kind, then its date, with no other kind in between ("l'arrêté conjoint de la ministre de … du 3 mai 2023").
  for (const m of t.matchAll(new RegExp(`\\b${KIND}\\b((?:(?!\\b(?:loi|decret|arrete|decision|circulaire)\\b).){0,320}?)\\bdu ${DATE}`, "g"))) {
    if (/n° ?\d/.test(m[2])) continue; // numbered: known by its number
    const end = m.index! + m[0].length;
    found.push({ key: `d:${KIND_NAME[m[1]]}:${iso(m[3], m[4], m[5])}`, at: m.index!, subject: t.slice(end, end + 160) });
  }
  const seen = new Set<string>();
  return found.sort((a, b) => a.at - b.at).filter((n) => !seen.has(n.key) && seen.add(n.key));
}

/** Every text a title names: "n:decret:2005-1991", "d:arrete:1995-01-10". The first is the title's own. */
export function namedKeys(title: string): string[] {
  return named(title).map((n) => n.key);
}

// Words every title uses, which say nothing of its subject.
const COMMON = new Set(
  "fixant portant relatif relative relatifs relatives modifiant completant modalites conditions procedures dispositions application organisation ministre ministere ministres conjoint arrete decret articles article certaines certains".split(" "),
);
const words = (s: string) => new Set(fold(s).split(/[^a-z]+/).filter((w) => w.length >= 5 && !COMMON.has(w)));

/** Two texts of the same kind and date are told apart by their subject: some words in common. */
function sameSubject(subject: string, texte: Texte): boolean {
  const mine = words(texte.titre);
  let common = 0;
  for (const w of words(subject)) if (mine.has(w)) common++;
  return common >= 2;
}

/** The keys a text is known by. */
export function keysOf(t: Pick<Texte, "type" | "numero" | "date">): string[] {
  const kind = KIND_NAME[prepare(t.type).split(" ")[0]] ?? prepare(t.type);
  return [t.numero ? `n:${kind}:${t.numero}` : null, t.date && !t.numero ? `d:${kind}:${t.date}` : null].filter((k): k is string => !!k);
}

/** The texts a title cites: every text it names but its own. */
function cited(title: string): Named[] {
  const [own, ...others] = named(title);
  return /^\s*(loi|decret|arrete|decision|circulaire)/.test(prepare(title)) ? others : [own, ...others].filter(Boolean);
}

export function citedKeys(title: string): string[] {
  return cited(title).map((n) => n.key);
}

const SUGGESTED = new Set(rules.registre.suggere ?? []);
const ruleById = new Map([...rules.references, ...rules.rules].map((r) => [r.id, r]));

/** A text the veille found in the JORT, as a text of the référentiel. */
export function fromHit(hit: Hit): Texte {
  const numero = /n°\s*(\d{2,4}-\s?\d{1,5})/i.exec(hit.title)?.[1].replace(/\s/g, "");
  const when = [...new Set(hit.matches.flatMap((m) => ruleById.get(m.rule)?.when ?? []))];
  const labels = hit.matches.filter((m) => !m.rule.startsWith("ref-")).map((m) => m.label);
  // Ticked where an important rule outside the suggested domains (taxes, customs) places it; a
  // text kept as information (sector news, an international agreement) is only suggested.
  const coche =
    hit.severity === "information"
      ? []
      : [
          ...new Set(
            hit.matches
              .map((m) => ruleById.get(m.rule))
              .filter((r) => r && r.level !== "information" && !SUGGESTED.has(r.domain ?? ""))
              .flatMap((r) => r!.when ?? []),
          ),
        ];
  return {
    id: `jort-${hit.id}`,
    type: hit.kind === "Autre" ? "Texte" : hit.kind,
    numero,
    date: isoDate(hit.title) ?? undefined,
    titre: hit.title,
    domaine: hit.domains[0] ?? "secteurs",
    theme: labels[0] ?? hit.matches[0]?.label ?? "",
    when: when.length ? when : undefined,
    source: hit.pdf,
    publie: `JORT n° ${hit.issue}/${hit.year}, p. ${hit.page}`,
    origine: "jort",
    niveau: hit.severity,
    coche,
  };
}

/**
 * What a series of texts has in common: the subject without numbers or dates ("fixant le salaire
 * minimum interprofessionnel garanti…", "portant loi de finances pour l'année …"). Null for a text
 * that modifies another (each modification counts) or a subject too short to tell.
 */
export function seriesKey(title: string): string | null {
  const t = subject(title)
    .replace(/^(?:loi|decret|arrete|decision|circulaire)s?\b[^,]*?\d{4}\s*,\s*/, "")
    .replace(/n°\s*[\d-]+/g, "")
    .replace(/\d+(?:er)?/g, "")
    .replace(/[^a-z' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length >= 30 && !/modifi|complet|abrog|prorog|rectifi/.test(t) ? t : null;
}

/** The curated texts and the JORT's, a JORT text that is already curated adding its source only. */
export function catalogue(hits: Hit[]): Texte[] {
  const texts: Texte[] = REFERENTIEL.map((t) => ({ ...t }));
  const byKey = new Map(texts.flatMap((t) => keysOf(t).map((k) => [k, t] as const)));
  for (const hit of hits) {
    const t = fromHit(hit);
    const known = keysOf(t).map((k) => byKey.get(k)).find(Boolean);
    if (known) {
      known.source ??= t.source;
      known.publie ??= t.publie;
      continue;
    }
    texts.push(t);
    for (const k of keysOf(t)) byKey.set(k, t);
  }
  // Of a series, the newest text stands; the older ones are kept, to be added by hand.
  const newest = new Map<string, Texte>();
  for (const t of texts) {
    const key = t.origine === "jort" ? seriesKey(t.titre) : null;
    if (!key) continue;
    const other = newest.get(key);
    if (!other || (t.date ?? "") > (other.date ?? "")) {
      if (other) other.remplace = true;
      newest.set(key, t);
    } else t.remplace = true;
  }
  return texts;
}

export interface Proposal {
  texte: Texte;
  reasons: string[];
  proposed: boolean; // ticked when the register is created; otherwise a suggestion
}

/**
 * The texts that apply to a site: curated texts and important JORT texts are proposed (ticked),
 * among them every text on one of the site's activities; sector news and taxes are suggested.
 */
export function proposals(texts: Texte[], site: Site): Proposal[] {
  return texts.flatMap((texte) => {
    if (texte.remplace) return [];
    const reasons = applies(texte.when, site);
    const proposed = texte.origine === "referentiel" || applies(texte.coche, site) !== null;
    return reasons ? [{ texte, reasons, proposed }] : [];
  });
}

/**
 * The JORT texts that modify (or cite) a text of the référentiel, from every sommaire read: what
 * tells a register that one of its texts has changed.
 */
export function amendments(years: Sommaires[], texts: Texte[]): Amendment[] {
  const byKey = new Map<string, Texte[]>();
  for (const t of texts) for (const k of keysOf(t)) byKey.set(k, [...(byKey.get(k) ?? []), t]);
  // A number names one text; a date may name several: the subject must match too.
  const names = (n: Named) => byKey.get(n.key)?.some((t) => n.key.startsWith("n:") || sameSubject(n.subject, t));
  const out: Amendment[] = [];
  for (const y of years)
    for (const issue of Object.values(y.issues)) {
      if (issue.number === null) continue;
      issue.entries.forEach((e, index) => {
        if (!/modifi|complet|abrog|remplac|prorog|application/.test(fold(e.title)) || ignored(e.title)) return;
        const cites = cited(e.title).filter(names).map((n) => n.key);
        if (!cites.length) return;
        out.push({
          id: `${y.year}-${String(issue.number).padStart(3, "0")}-${e.page}-${index}`,
          year: y.year,
          issue: issue.number!,
          date: issue.date,
          page: e.page,
          title: e.title,
          pdf: `${pdfUrl(y.year, issue.number!)}${pdfPage(issue, e.page) ? `#page=${pdfPage(issue, e.page)}` : ""}`,
          cites,
        });
      });
    }
  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}
