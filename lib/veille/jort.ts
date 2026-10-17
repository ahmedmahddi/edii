/**
 * Reading a JORT issue (Journal Officiel de la République Tunisienne, French translation).
 *
 * Each issue opens with a sommaire: section headings ("Décrets et Arrêtés"), the issuing
 * institution ("Ministère de l'Industrie…"), and under it the title of every text, possibly on
 * several lines, ending with dot leaders and the page number. Institutions are printed less
 * indented than titles, which is how the two are told apart.
 *
 * This module works on positioned text lines, so it can be tested without a PDF; lib/veille/pdf.ts
 * turns a PDF into such lines.
 */

export interface Line {
  x: number; // left edge
  y: number; // baseline, from the bottom of the page
  text: string;
}

export interface SommaireEntry {
  institution: string | null; // "Ministère de l'Industrie, de l'Energie et des PME"
  section: string | null; // "Décrets et Arrêtés"
  title: string;
  page: number; // page of the JORT (numbered across the year)
  kind: string; // "Loi", "Décret", "Arrêté"…, or "Autre"
  numbers: string[]; // "2006-2687"
}

export interface Issue {
  number: number | null; // N° 83
  date: string | null; // ISO date, from the header
  firstPage: number | null; // JORT page number of the PDF's first page
  entries: SommaireEntry[];
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const DATE = new RegExp(`(\\d{1,2})(?:er)?\\s+(${MONTHS.join("|")})\\s+(\\d{4})`, "i");
// Dot leaders, then the page number at the end of the line.
const LEADER_PAGE = /\s*(?:[.…·•_]\s*){2,}\s*(\d{1,5})\s*$/;
const SECTION = /^(lois?|décrets?(?:-lois?)?(?: et arrêtés)?|arrêtés|décisions?|avis(?: et communications)?|circulaires?|textes? généraux|conventions?|accords?)\s*$/i;
const SUPERSCRIPT = /^(ème|ère|er|e|bis)\s*$/i;
// An institution heading is usually less indented than the titles, but not always (the Instance
// supérieure indépendante pour les élections is centred): its first words tell it too.
const INSTITUTION = /^(Présidence|Ministère|Instance|Haute Instance|Conseil|Cour|Banque Centrale|Assemblée)\b/;
// A law has no institution above it, and its first line is as far left as an institution heading.
const TEXT_START = /^(lois?|loi organique|décrets?(?:-lois?)?|arrêtés?|décisions?|circulaires?|ordonnances?)\b/i;

export function isoDate(text: string): string | null {
  const m = DATE.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function kindOf(title: string): string {
  const m = /^(loi(?: organique)?|décret[s]?-loi|décret|arrêté|décision|avis|circulaire|ordonnance|convention|accord|nomination|délégation)/i.exec(title);
  if (!m) return "Autre";
  const k = m[1].toLowerCase();
  if (k.startsWith("décret") && k.includes("loi")) return "Décret-loi";
  return k[0].toUpperCase() + k.slice(1);
}

const clean = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();

/** Most frequent x among the lines that end with a page number: where titles start on this page. */
function titleIndent(lines: Line[]): number | null {
  const counts = new Map<number, number>();
  for (const l of lines) {
    if (!LEADER_PAGE.test(l.text)) continue;
    const x = Math.round(l.x / 4) * 4;
    counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [x, n] of counts) if (best === null || n > (counts.get(best) ?? 0) || (n === counts.get(best) && x < best)) best = x;
  return best;
}

/**
 * Parse the sommaire of an issue from its pages' lines (page 1 first). The sommaire runs over the
 * first pages that list texts with their page numbers.
 */
export function parseIssue(pages: Line[][]): Issue {
  const first = pages[0] ?? [];
  const firstText = first.map((l) => l.text).join("\n");
  const header = first.find((l) => /année/i.test(l.text) && DATE.test(l.text));
  const number = /N°\s*(\d{1,3})\b/.exec(header?.text ?? firstText);
  // The first page often carries no number: take the first numbered footer, and count back.
  let firstPage: number | null = null;
  for (const [i, lines] of pages.slice(0, 4).entries()) {
    const footer = lines.map((l) => /\bPage\s+(\d{1,5})\b/.exec(l.text)).find((m) => m && /journal officiel/i.test(m.input));
    if (footer) {
      firstPage = Number(footer[1]) - i;
      break;
    }
  }
  const issue: Issue = {
    number: number ? Number(number[1]) : null,
    date: isoDate(header?.text ?? "") ?? isoDate(/République Tunisienne\s*[—-]\s*([^\n]+)/.exec(firstText)?.[1] ?? ""),
    firstPage,
    entries: [],
  };

  let institution: string | null = null;
  let section: string | null = null;
  let pending: string[] = [];
  let lastWasInstitution = false;

  for (const [index, lines] of pages.entries()) {
    const listed = lines.filter((l) => LEADER_PAGE.test(l.text)).length;
    if (listed < 2) break; // the sommaire is over: the texts themselves start
    const indent = titleIndent(lines);
    const ordered = [...lines].sort((a, b) => b.y - a.y || a.x - b.x);
    let started = index > 0; // on page 1, skip the masthead until "Sommaire"
    for (const line of ordered) {
      const text = clean(line.text);
      if (!started) {
        if (/^sommaire\b/i.test(text)) started = true;
        continue;
      }
      if (!text || SUPERSCRIPT.test(text) || /^page\s+\d+\b.*journal officiel/i.test(text) || /journal officiel de la république/i.test(text)) continue;
      if (/^traduction française/i.test(text)) continue;
      const end = LEADER_PAGE.exec(text);
      if (end) {
        const title = clean([...pending, text.slice(0, end.index)].join(" "));
        pending = [];
        lastWasInstitution = false;
        if (title)
          issue.entries.push({
            institution,
            section,
            title,
            page: Number(end[1]),
            kind: kindOf(title),
            numbers: [...title.matchAll(/n°\s*(\d{2,4}-\d{1,5})/gi)].map((m) => m[1]),
          });
        continue;
      }
      if (!pending.length && SECTION.test(text)) {
        section = text;
        lastWasInstitution = false;
        continue;
      }
      const lessIndented = indent !== null && line.x < indent - 8;
      if (!pending.length && !TEXT_START.test(text) && (lessIndented || INSTITUTION.test(text))) {
        institution = lastWasInstitution && institution ? clean(`${institution} ${text}`) : text;
        lastWasInstitution = true;
        continue;
      }
      pending.push(text);
      lastWasInstitution = false;
    }
  }
  return issue;
}

/** Address of an issue's PDF on lake.jort.tn (French translation). */
export function pdfUrl(year: number, number: number): string {
  return `https://lake.jort.tn/journal-officiel/fr/${year}/${String(number).padStart(3, "0")}.pdf`;
}

/** Page of the PDF that holds a JORT page, given the JORT page number of the PDF's first page. */
export function pdfPage(issue: Pick<Issue, "firstPage">, jortPage: number): number | null {
  if (issue.firstPage === null || jortPage < issue.firstPage) return null;
  return jortPage - issue.firstPage + 1;
}
