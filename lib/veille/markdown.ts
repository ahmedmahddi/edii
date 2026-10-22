/**
 * Reading a JORT issue from its OCR text at ocr.jort.tn (Markdown, one block per page, pages
 * separated by "<!-- page:N -->"). Every French issue since 1957 is there, the scanned ones too,
 * which have no text layer in their PDF.
 *
 * The sommaire comes out as lines, in the order printed: section headings, institutions and titles
 * ending with their page number. The layout changed over the years, and so does the OCR's markup:
 *   1957-1975  institutions in capitals, as headings, bold or plain; titles wrapped over several
 *              lines, the page number after the last one;
 *   1980-      institutions as headings ("### Ministère de…") or plain lines, one title per line.
 * Institutions have no page number, which is how they are told apart from titles; a title's
 * wrapped lines are held until the line that ends with its page. The sommaire ends where the texts
 * themselves start ("Par décret…", "Nous, …", "Vu …").
 */
import { arFold, isArabic, isoDateAr } from "./arabe";
import { clean, INSTITUTION, type Issue, isoDate, kindOf, MONTHS, sommaireEntry, TEXT_START } from "./jort";

// Section headings of the sommaire, as the OCR writes them over the years.
// Tested without accents: the OCR of the old issues drops them ("DECRETS ET ARRETES").
const SECTION =
  /^(lois?(?: organiques?)?|decrets?[- ]lois?|decrets?(?:,| et)? arretes(?: et decisions)?|decrets?(?: gouvernementaux| presidentiels)?|arretes|decisions?|avis(?: et communications)?|circulaires?|textes? generaux|conventions?|accords?|ordonnances?|partie (?:non )?officielle|bilans?|annonces)$/i;
const unaccented = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");
// Institutions printed as plain lines (headings and bold lines are taken as institutions anyway).
const ISSUER =
  /^(Premier minist[eè]re|Secr[ée]tariat d'[EÉ]tat|Tribunal|Chambre|Office|Gouvernorat|Commissariat|Haut[e]? (?:comit[ée]|commissariat|autorit[ée])|Comit[ée]|M[ée]diateur|Caisse|Imprimerie|Municipalit[ée]|Commune|Garde des Sceaux)(?!\p{L})/iu;
// A heading that continues the institution above it: "### SECRETARIAT D'ETAT" "### AU PLAN…".
// (Word ends are written (?!\p{L}): \b does not see one after an accented letter.)
const CONTINUES = /^(au|aux|à|a|de|des|du|d'|et|chargée?|auprès)(?!\p{L})/iu;
// The first lines of the texts themselves: the sommaire is over.
const BODY =
  /^(par (?:décret|arrêté|décision)s?(?!\p{L})|nous,|vu(?!\p{L})|article (?:premier|1er|\d)|art\.\s*\d|décr[eè]te\s*:|décrétons|arr[eê]tent?\s*:|considérant|sur (?:la )?proposition|le (?:président|premier ministre|chef du gouvernement|ministre|gouverneur|secrétaire d'[eé]tat)(?!\p{L})[^.]*,$)/iu;
// Dot leaders or a space, then the page number, at the end of a title.
const PAGE = /^(.*?\S)(?:\s*(?:[.…·_]\s*){2,}\s*|\s+)(\d{1,4})$/;
// A year closing a title line ("du 14 décembre 1956", "au titre de l'année 2023") is not a page number.
const YEAR_BEFORE = new RegExp(`(?:${MONTHS.join("|")}|année|gestion|exercice|campagne|saison|session|promotion)$`, "i");
// A line ending with one of these words goes on: the next line is the rest of the same title.
const CONNECTOR = /(?:(?<!\p{L})(?:de|du|des|le|la|les|à|au|aux|et|en|par|pour|sur|portant|relatif|relative|fixant|modifiant|complétant)|(?<!\p{L})[dl]'|,)$/iu;
const MAX_PENDING = 8; // lines held without a page number: past this, it is not the sommaire any more
const MAX_PAGES = 8; // pages of the issue where the sommaire can run

/** Without the Markdown: headings, bold, quotes the OCR put around a line. */
function plain(line: string): string {
  // A table row ("| title | 2397 |"): its cells, in order; the rule under the header row is nothing.
  if (/^\s*\|/.test(line)) line = line.split("|").map((c) => c.trim()).filter((c) => c && !/^:?-{3,}:?$/.test(c)).join(" ");
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/^["«»“”]\s*/, "")
    .replace(/^[-–•*]\s+/, "") // a list mark
    .replace(/\\([*_#])/g, "$1")
    .trim();
}

const isHeading = (raw: string) => /^#{1,6}\s/.test(raw) || /^\*\*[^*]+\*\*$/.test(raw.trim());
const capitals = (s: string) => {
  const letters = s.replace(/[^\p{L}]/gu, "");
  return letters.length >= 6 && letters.replace(/\p{Lu}/gu, "").length <= letters.length * 0.15;
};
const ignored = (s: string) =>
  !s ||
  /^-{3,}$/.test(s) ||
  /^!\[/.test(s) ||
  /^pages?$/i.test(s) ||
  /journal officiel/i.test(s) ||
  /^(?:\(?traduction française\)?|traduction française pour information)$/i.test(s) ||
  /^page\s+\d+$/i.test(s) ||
  /^N°\s*\d{1,3}$/i.test(s) ||
  /^\d{1,4}$/.test(s);

/** Split the Markdown into its pages (page 1 first). */
export function markdownPages(md: string): string[][] {
  const pages: string[][] = [[]];
  for (const line of md.split(/\r?\n/)) {
    if (/^<!--\s*page:\s*\d+\s*-->$/.test(line.trim())) {
      if (pages.at(-1)!.length) pages.push([]);
      continue;
    }
    pages.at(-1)!.push(line);
  }
  return pages;
}

/**
 * JORT page number of the issue's first page: pages carry their number alone on a line, as
 * "Page 315", or before the running title ("950 JOURNAL OFFICIEL…"). The most frequent reading wins.
 */
function firstPageOf(pages: string[][]): number | null {
  const votes = new Map<number, number>();
  for (const [i, lines] of pages.slice(0, 12).entries()) {
    for (const raw of lines) {
      const s = plain(raw);
      const m = /^(?:page\s+)?(\d{1,4})$/i.exec(s) ?? /^(\d{1,4})\s+journal officiel/i.exec(s) ?? /journal officiel.*\bpage\s+(\d{1,4})$/i.exec(s);
      if (!m) continue;
      const first = Number(m[1]) - i;
      if (first >= 1) votes.set(first, (votes.get(first) ?? 0) + 1);
    }
  }
  let best: number | null = null;
  for (const [p, n] of votes) if (n >= 2 && (best === null || n > votes.get(best)!)) best = p;
  return best;
}

/** Parse the sommaire of an issue from its OCR Markdown. */
export function parseMarkdown(md: string): Issue {
  return read(md).issue;
}

/**
 * The same from the beginning of the Markdown only (a partial download): null when the sommaire
 * may go on past it, and the whole text is needed.
 */
export function parseMarkdownStart(md: string): Issue | null {
  const { issue, ended } = read(md);
  return ended ? issue : null;
}

function read(md: string): { issue: Issue; ended: boolean } {
  const pages = markdownPages(md);
  const all = pages.flatMap((lines, page) => lines.map((raw) => ({ raw, page })));
  const start = all.findIndex((l) => /^sommaire\b/i.test(plain(l.raw)));
  const header = (start >= 0 ? all.slice(0, start) : all.slice(0, 40)).map((l) => plain(l.raw));
  // "N° 40", not the postal account "N° 610-15" of the old mastheads.
  const number = header.map((l) => /N°\s*(\d{1,3})(?![\d.-]*\d)/.exec(l)).find(Boolean);
  const dated = header.find((l) => isoDate(l));
  const issue: Issue = {
    number: number ? Number(number[1]) : null,
    date: dated ? isoDate(dated) : null,
    firstPage: firstPageOf(pages),
    entries: [],
  };
  if (start < 0) {
    // No "Sommaire": an Arabic edition filed as French (2019, 2023, 2026…) says so by its letters.
    const arabic = (md.slice(0, 20_000).match(/[\u0600-\u06FF]/g) ?? []).length;
    if (arabic > 300) return readArabic(pages);
    return { issue, ended: false };
  }

  let institution: string | null = null;
  let section: string | null = null;
  let pending: string[] = [];
  let lastWasInstitution = false;
  let lastPage: number | null = null;
  // Titles whose page number the OCR lost: they take the page of the next title (the same or close).
  let orphans: { institution: string | null; section: string | null; title: string }[] = [];
  const push = (title: string, page: number) => {
    for (const o of orphans) issue.entries.push(sommaireEntry(o.institution, o.section, o.title, page));
    orphans = [];
    lastPage = page;
    issue.entries.push(sommaireEntry(institution, section, title, page));
  };
  const orphan = () => {
    const title = clean(pending.join(" ")).replace(/[.\s]+$/, "");
    if (title) orphans.push({ institution, section, title });
    pending = [];
  };

  let ended = false;
  const sections = new Map<string, number>(); // section headings of the sommaire, and their page
  for (const { raw, page } of all.slice(start + 1)) {
    if (page >= MAX_PAGES) {
      ended = true;
      break;
    }
    const text = clean(plain(raw));
    if (ignored(text)) continue;
    // A title left without its page (the OCR lost it): a heading or a new title follows it.
    if (pending.length && (isHeading(raw) || (startsTitle(text) && !CONNECTOR.test(pending.at(-1)!)))) orphan();
    if (BODY.test(text) || pending.length >= MAX_PENDING) {
      if (issue.entries.length) {
        ended = true; // the texts start: the sommaire is over
        break;
      }
      pending = [];
      continue;
    }
    const end = PAGE.exec(text);
    if (end && !YEAR_BEFORE.test(end[1]) && plausible(Number(end[2]), lastPage ?? issue.firstPage)) {
      const title = clean([...pending, end[1]].join(" ")).replace(/[.\s]+$/, "");
      pending = [];
      lastWasInstitution = false;
      if (title) push(title, Number(end[2]));
      continue;
    }
    if (pending.length) {
      pending.push(text);
      continue;
    }
    const bare = text.replace(/[.:]$/, "");
    if (SECTION.test(unaccented(bare))) {
      // A section heading again, on a later page: the texts start with it, the sommaire is over.
      const name = unaccented(bare).toLowerCase().replace(/[^a-z]+/g, " ");
      if (issue.entries.length && (sections.get(name) ?? page) < page) {
        ended = true;
        break;
      }
      if (!sections.has(name)) sections.set(name, page);
      section = bare;
      institution = null; // laws have no institution: the next heading names one if any
      lastWasInstitution = false;
      continue;
    }
    if (/^sommaire\b/i.test(text)) continue;
    if (!TEXT_START.test(text) && (INSTITUTION.test(text) || ISSUER.test(text) || isHeading(raw) || capitals(text))) {
      institution = lastWasInstitution && institution && CONTINUES.test(text) ? clean(`${institution} ${text}`) : text;
      lastWasInstitution = true;
      continue;
    }
    pending.push(text);
    lastWasInstitution = false;
  }
  // Lines without a page after the last title are the start of the texts, not titles: dropped.
  return { issue, ended };
}

// The Arabic sommaire (read folded: one alef, hā for tā marbūṭa, ي for ى).
const AR_START = /^(المحتوي|المحتويات|المحترم|الفهرس|فهرس)$/;
const AR_SECTION =
  /^(القوانين|القوانين الاساسيه|قوانين|المراسيم|مراسيم|الاوامر والقرارات|اوامر وقرارات|الاوامر|القرارات|الاراء والبلاغات|اراء وبلاغات|الاعلانات|البلاغات|المنشورات|المقررات)$/;
const AR_INSTITUTION =
  /^(وزاره|رئاسه|الهيئه|هيئه|البنك المركزي|مجلس|المجلس|محكمه|المحكمه|الكتابه العامه|كتابه الدوله|ديوان|الديوان|الوكاله|المعهد|الاداره العامه|دائره المحاسبات)/;
const AR_TITLE =
  /^(قانون|مرسوم|امر|قرار|مقرر|منشور|راي|بلاغ|اعلان|تسميه|انهاء|اسناد|ترقيه|تكليف|احاله|ابقاء|اعفاء|قائمه|جدول|محضر|تفويض|نتائج)(?![\u0600-\u06FF])/;
// The texts start: "إن رئيس الجمهورية،", "بعد الاطلاع على…", "الفصل الأول", "بمقتضى أمر…".
const AR_BODY = /^(ان رئيس|ان رئيسه|ان وزير|ان وزيره|بعد الاطلاع|وبعد الاطلاع|يصدر|يصدر الامر|الفصل الاول|الفصل 1|بمقتضي|باقتراح|اصدرنا|باسم الشعب)/;
// A year closing a line ("لسنة 2022", "ديسمبر 2023") is not a page.
const AR_YEAR = /(لسنه|سنه|بعنوان|جانفي|فيفري|مارس|افريل|ماي|جوان|جويليه|اوت|سبتمبر|اكتوبر|نوفمبر|ديسمبر) \d{4}\.?$/;

/**
 * The sommaire of the Arabic edition: sections, institutions, and titles that start with their
 * kind (قانون، أمر، قرار، تسمية…) and run to the next one. The OCR sets page numbers on a line of
 * their own before a title, or at either end of one of its lines; a title left without one takes
 * the next title's page.
 */
function readArabic(pages: string[][]): { issue: Issue; ended: boolean } {
  const all = pages.flatMap((lines, page) => lines.map((raw) => ({ raw, page, text: arFold(plain(raw)) })));
  let start = all.findIndex((l) => AR_START.test(l.text));
  if (start < 0) start = all.findIndex((l) => AR_SECTION.test(l.text)) - 1;
  // No heading at all (a PDF whose headings are images): from the first title of the first page.
  if (start < -1) start = all.findIndex((l) => l.page === 0 && AR_TITLE.test(l.text)) - 1;
  const header = all.slice(0, start >= 0 ? start + 1 : 40).map((l) => l.text);
  // "24 عدد" or "عدد 96", not the volume next to "السنة" ("السنة 169 عدد 96").
  const number = header
    .flatMap((l) => [...l.matchAll(/(?:^|\s)(\d{1,3}) عدد(?=\s|$)|(?:^|\s)عدد (\d{1,3})(?=\s|$)/g)])
    .find((m) => !new RegExp(`السنه ${m[1] ?? m[2]}(?!\\d)|(?<!\\d)${m[1] ?? m[2]} السنه`).test(m.input!));
  const dated = header.map((l) => isoDateAr(l)).find(Boolean);
  // Page footers: "صفحة 160", "ص 882".
  const votes = new Map<number, number>();
  for (const l of all.slice(0, 400)) {
    const m = /^(?:صفحه|ص) (\d{1,4})$/.exec(l.text);
    if (m) votes.set(Number(m[1]) - l.page, (votes.get(Number(m[1]) - l.page) ?? 0) + 1);
  }
  const firstPage = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const issue: Issue = {
    number: number ? Number(number[1] ?? number[2]) : null,
    date: dated ?? null,
    firstPage: firstPage !== null && firstPage > 0 ? firstPage : null,
    entries: [],
    arabe: true,
  };
  if (start < -1) return { issue, ended: true };

  let section: string | null = null;
  let institution: string | null = null;
  let current: { lines: string[]; page: number | null; institution: string | null; section: string | null } | null = null;
  let pendingPage: number | null = null;
  let lastPage: number | null = issue.firstPage;
  const found: { institution: string | null; section: string | null; title: string; page: number | null }[] = [];
  const sections = new Map<string, number>();
  const page = (n: string, text: string) => {
    const p = Number(n);
    if (AR_YEAR.test(text) || p < 1) return null;
    return lastPage === null ? (p < 10000 ? p : null) : p >= lastPage - 60 && p <= lastPage + 600 ? p : null;
  };
  const flush = () => {
    if (current?.lines.length) {
      found.push({ institution: current.institution, section: current.section, title: clean(current.lines.join(" ")).replace(/[.\s]+$/, ""), page: current.page });
      if (current.page !== null) lastPage = current.page;
    }
    current = null;
  };
  let ended = false;
  for (const { raw, page: at, text: folded } of all.slice(start + 1)) {
    if (at >= 6) {
      ended = true;
      break;
    }
    let text = folded
      .replace(/^[-–•*]\s+/, "")
      .replace(/\s*(?:[.…·_]\s*){2,}/g, " ") // dot leaders
      .trim();
    if (!text || /^-{3,}$/.test(text) || /^!\[/.test(text) || /الرائد الرسمي/.test(text) || /^(صفحه|ص) \d+$/.test(text) || /^(\d{1,3} عدد|عدد \d{1,3})$/.test(text)) continue;
    if (/^\d{1,4}$/.test(text)) {
      // The page's own number (its footer) is not a title's.
      if (issue.firstPage === null || Number(text) !== issue.firstPage + at) pendingPage = page(text, "") ?? pendingPage;
      continue;
    }
    if (!isArabic(text)) continue; // the signature block, "II" and other OCR noise
    if (AR_BODY.test(text)) {
      if (found.length || current) {
        ended = true;
        break;
      }
      continue;
    }
    if (AR_SECTION.test(text)) {
      flush();
      if ((found.length || current) && (sections.get(text) ?? at) < at) {
        ended = true;
        break;
      }
      if (!sections.has(text)) sections.set(text, at);
      section = raw.replace(/^#+\s*/, "").trim();
      institution = null;
      continue;
    }
    // A page number at the start of a line: the end of the title before, as the page is laid out
    // right to left; at the end of a line: this title's.
    const lead = /^(\d{1,4}) (.+)$/.exec(text);
    // "… عدد 54 لسنة" / "2022 المؤرخ في…": a year wrapped to the next line is not a page.
    const year = !!lead && !!current && /(لسنه|سنه|بعنوان|[\u0600-\u06FF]+ \d{1,2})$/.test(current.lines.at(-1) ?? "");
    if (lead && year) {
      current!.lines.push(lead[1]);
      text = lead[2];
    } else if (lead) {
      const p = page(lead[1], "");
      if (p !== null) {
        if (current && current.page === null) current.page = p;
        else if (!AR_TITLE.test(lead[2])) pendingPage = p;
      }
      // A misread number before a title still leaves the title to start its line.
      if (p !== null || AR_TITLE.test(lead[2])) text = lead[2];
    }
    if (AR_TITLE.test(text)) {
      flush();
      current = { lines: [], page: pendingPage, institution, section };
      pendingPage = null;
    } else if (AR_INSTITUTION.test(text) || (/^#/.test(raw) && !current)) {
      flush();
      institution = raw.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
      continue;
    } else if (!current) continue;
    const trail = /^(.*\S) (\d{1,4})\.?$/.exec(text);
    const p = trail ? page(trail[2], text) : null;
    if (trail && p !== null) {
      current!.lines.push(trail[1]);
      if (current!.page === null) current!.page = p;
    } else current!.lines.push(text);
  }
  flush();
  // Titles left without a page take the next title's, or the one before.
  for (let i = found.length - 1, next: number | null = null; i >= 0; i--) {
    if (found[i].page === null) found[i].page = next;
    else next = found[i].page;
  }
  let before = issue.firstPage ?? 0;
  for (const f of found) {
    if (f.page === null) f.page = before;
    before = f.page;
    if (f.title.length >= 8) issue.entries.push(sommaireEntry(f.institution, f.section, f.title, f.page));
  }
  return { issue, ended: ended || !!found.length };
}

/** A line that opens a title: "DECRET N°…", "NOMINATION de…", "Arrêté du…". */
function startsTitle(text: string): boolean {
  return /^\p{Lu}/u.test(text) && (kindOf(text) !== "Autre" || /^\p{Lu}{4,}(?!\p{L})/u.test(text));
}

/**
 * A page number follows the previous one (or the issue's first page), give or take: a year or a
 * count closing a title does not.
 */
function plausible(page: number, last: number | null): boolean {
  if (page < 1) return false;
  return last === null ? page < 4000 : page >= last - 60 && page <= last + 600;
}

/** Address of an issue's OCR text on ocr.jort.tn (French translation). */
export function ocrUrl(year: number, number: number): string {
  return `https://ocr.jort.tn/journal-officiel/fr/${year}/${String(number).padStart(3, "0")}.md`;
}
