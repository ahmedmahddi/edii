/**
 * Veille réglementaire: read the JORT issues not read yet and record the texts that concern the
 * app in public/veille/feed.json (fetched by the Veille réglementaire view).
 *
 *   npm run veille                         new issues of the current year (and of last year in January)
 *   npm run veille -- --year 2025          new issues of 2025
 *   npm run veille -- --year 2025 --from 1 --to 40     re-read issues 1 to 40 of 2025
 *   npm run veille -- --file jort.pdf --year 2010 --number 18   read a PDF (or .md OCR text) already on disk
 *   npm run veille -- --reassess           apply edited rules (data/veille/watch.json) to every
 *                                          sommaire already read, without downloading anything
 *                                          (run before dev and build: feed.json is
 *                                          derived from the sommaires and not kept in git)
 *   npm run veille -- --list --year 2026   every title already read, flagged or not, to check the rules
 *   npm run veille -- --years 1990-2023    the issues not read yet of those years, most recent first
 *   npm run veille -- --reread             read again the issues that gave no text (not scans) or
 *                                          glued titles, after the reading improved
 *   npm run veille -- --probe              sample one issue every few years (1960 to today): is it in
 *                                          French, its size, has it a text layer, does its sommaire
 *                                          read; the first pages are kept in data/veille/probe/ so
 *                                          that the reading can be adapted to old layouts
 *
 *   npm run veille -- --ocr --years 2023-2026   read again from the OCR text the issues first read
 *                                          from the PDF, keeping the reading with more texts
 *
 * Issues are numbered from 1 each year. The list of issues comes from the catalog of jort.tn
 * (https://index.jort.tn/catalog); without it, numbers are tried in order and the first missing
 * ones end the year. Each issue is read from its OCR text (https://ocr.jort.tn/journal-officiel/fr/
 * <year>/<nnn>.md, every French issue since 1957, scans included); when there is none yet, or no
 * sommaire in it, from its PDF (https://lake.jort.tn/…/<nnn>.pdf). Only the sommaire is read; it is
 * kept in data/veille/sommaires/<year>.json, so the rules can be applied again later.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Issue, isSommairePage, type Line, parseIssue, pdfUrl } from "../lib/veille/jort";
import { ocrUrl, parseMarkdown, parseMarkdownStart } from "../lib/veille/markdown";
import { amendments, catalogue } from "../lib/registre/referentiel";
import { pdfLines, pdfLinesFromUrl, pdfPageImages } from "../lib/veille/pdf";
import { assess, type Feed, reassess, record, type Sommaires } from "../lib/veille/watch";

const DIR = path.join(process.cwd(), "data", "veille");
// Served to the page, which fetches it when the veille is opened (not part of the page's code).
const FEED = path.join(process.cwd(), "public", "veille", "feed.json");
const SOMMAIRES = path.join(DIR, "sommaires");
const PROBE = path.join(DIR, "probe");
const UA = "ABClassement veille réglementaire";
// Where the PDFs are fetched from: lake.jort.tn, or a copy of it (JORT_BASE, for tests or a mirror).
const fetchUrl = (year: number, n: number) =>
  process.env.JORT_BASE ? pdfUrl(year, n).replace("https://lake.jort.tn", process.env.JORT_BASE) : pdfUrl(year, n);
// The OCR text, from ocr.jort.tn or a copy of it (JORT_OCR_BASE; "none" to read the PDFs only).
const ocrFetchUrl = (year: number, n: number) =>
  process.env.JORT_OCR_BASE ? ocrUrl(year, n).replace("https://ocr.jort.tn", process.env.JORT_OCR_BASE) : ocrUrl(year, n);
const CATALOG = process.env.JORT_CATALOG ?? "https://index.jort.tn/catalog";
const SOMMAIRE_PAGES = 8;
const OCR_START = 1 << 16; // first bytes of the OCR text: the sommaire, mostly
const PAUSE_MS = 150; // between downloads, to stay gentle with the server
const MISSES = 3; // a past year ends after this many missing numbers in a row (numbering may skip one)
const MIN_TEXT = 200; // characters on the first pages below which an issue is a scan
let downloaded = 0; // bytes, reported at the end

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadFeed(): Feed {
  if (!existsSync(FEED)) return { updated: null, scanned: {}, hits: [] };
  return JSON.parse(readFileSync(FEED, "utf8")) as Feed;
}

function writeFeed(feed: Feed): void {
  mkdirSync(path.dirname(FEED), { recursive: true });
  writeFileSync(FEED, JSON.stringify(feed) + "\n");
}

function saveFeed(feed: Feed): void {
  writeFeed({ ...feed, updated: new Date().toISOString() });
}

function sommairesFile(year: number): string {
  return path.join(SOMMAIRES, `${year}.json`);
}

function loadSommaires(year: number): Sommaires {
  const file = sommairesFile(year);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Sommaires) : { year, issues: {} };
}

function saveSommaire(year: number, issue: Issue): void {
  const all = loadSommaires(year);
  all.issues[String(issue.number)] = issue;
  const issues = Object.fromEntries(Object.entries(all.issues).sort(([a], [b]) => Number(a) - Number(b)));
  mkdirSync(SOMMAIRES, { recursive: true });
  writeFileSync(sommairesFile(year), JSON.stringify({ year, updated: new Date().toISOString(), issues }) + "\n");
}

/**
 * The first pages of an issue, as lines, or null when it is not published (yet). Only the parts
 * of the PDF those pages need are downloaded, when the server allows it.
 */
async function openIssue(year: number, number: number, pages: number): Promise<{ lines: Line[][]; bytes: number } | null> {
  try {
    // Pages are read until one is no longer the sommaire (page 1 always: the sommaire starts there).
    const got = await pdfLinesFromUrl(fetchUrl(year, number), pages, { "User-Agent": UA }, (page, i) => i > 0 && !isSommairePage(page));
    downloaded += got?.bytes ?? 0;
    return got;
  } catch (error) {
    const reason = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
    throw new Error(`Impossible de lire le n° ${number}/${year} sur lake.jort.tn (${reason}). Vérifiez la connexion Internet, puis relancez : ce qui a déjà été lu est gardé.`);
  }
}

/** The sommaire read from an issue's OCR text, or null when there is no such text (yet). */
async function openMarkdown(year: number, number: number): Promise<Issue | null> {
  if (process.env.JORT_OCR_BASE === "none") return null;
  const url = ocrFetchUrl(year, number);
  const get = async (range?: string) => {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...(range ? { Range: range } : {}) } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    downloaded += Buffer.byteLength(text);
    return { text, whole: res.status === 200 };
  };
  try {
    // The beginning first: the whole text (up to a few megabytes) only when the sommaire runs on.
    const start = await get(`bytes=0-${OCR_START - 1}`);
    if (!start) return null;
    if (/^\s*</.test(start.text) && !/<!--\s*page/.test(start.text)) return null; // an HTML page, not the text
    const issue = (start.whole ? parseMarkdown(start.text) : parseMarkdownStart(start.text)) ?? parseMarkdown((await get())?.text ?? "");
    return { ...issue, source: "ocr" };
  } catch (error) {
    const reason = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
    throw new Error(`Impossible de lire le n° ${number}/${year} sur ocr.jort.tn (${reason}). Vérifiez la connexion Internet, puis relancez : ce qui a déjà été lu est gardé.`);
  }
}

/**
 * An issue's sommaire: from its OCR text, or from its PDF when the OCR text is missing or gave no
 * sommaire (then the reading with more texts is kept). Null when the issue is not published (yet).
 */
async function fetchIssue(year: number, number: number): Promise<Issue | null> {
  const ocr = await openMarkdown(year, number);
  if (ocr?.entries.length) return ocr;
  const pdf = await openIssue(year, number, SOMMAIRE_PAGES);
  if (!pdf) return ocr;
  const issue: Issue = { ...parseIssue(pdf.lines), source: "pdf" };
  // A scan without OCR text yet: its pages are images.
  issue.sansTexte = pdf.lines.slice(0, 3).reduce((n, lines) => n + lines.reduce((m, l) => m + l.text.length, 0), 0) < MIN_TEXT || undefined;
  return ocr && ocr.entries.length >= issue.entries.length && !issue.sansTexte ? ocr : issue;
}

let catalog: Map<number, number[]> | null | undefined;
/** The French issues of each year, from the catalog of jort.tn; null when it cannot be read. */
async function catalogYears(): Promise<Map<number, number[]> | null> {
  if (catalog !== undefined) return catalog;
  try {
    const res = await fetch(CATALOG, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { collections: { id: string; years: Record<string, Record<string, { fr?: unknown }>> }[] };
    const years = data.collections.find((c) => c.id === "journal-officiel")?.years ?? {};
    catalog = new Map(
      Object.entries(years).map(([y, issues]) => [
        Number(y),
        Object.entries(issues)
          .filter(([, langs]) => langs.fr)
          .map(([n]) => Number(n))
          .sort((a, b) => a - b),
      ]),
    );
  } catch (error) {
    console.warn(`  ! catalogue de jort.tn illisible (${error instanceof Error ? error.message : error}) : numéros essayés dans l'ordre`);
    catalog = null;
  }
  return catalog;
}

async function readIssue(feed: Feed, year: number, number: number, issue: Issue): Promise<Feed> {
  if (issue.number !== null && issue.number !== number) {
    console.warn(`  ! n° ${number}: the PDF says n° ${issue.number}; recorded as n° ${number}`);
  }
  issue.number = number;
  if (issue.sansTexte) console.warn(`  ! n° ${number}: numéro scanné (images), pas encore de texte OCR sur ocr.jort.tn : à relire plus tard (--reread)`);
  else if (!issue.entries.length) console.warn(`  ! n° ${number}: sommaire introuvable (mise en page inconnue) : à signaler`);
  saveSommaire(year, issue);
  const next = record(feed, year, issue);
  const found = next.hits.filter((h) => h.year === year && h.issue === number);
  const flag = found.some((h) => h.severity === "critique") ? " ← CRITIQUE" : found.some((h) => h.severity === "important") ? " ← important" : "";
  console.log(`  n° ${String(number).padStart(3, "0")} ${issue.date ?? ""}: ${issue.entries.length} textes (${issue.source ?? "pdf"}), ${found.length} à lire${flag}`);
  for (const h of found) console.log(`      [${h.severity}] p. ${h.page} ${h.title}`);
  return next;
}

async function scanYear(feed: Feed, year: number, from?: number, to?: number): Promise<Feed> {
  const read = new Set(feed.scanned[year] ?? []);
  const listed = (await catalogYears())?.get(year);
  if (listed && year < new Date().getFullYear()) {
    // A past year: its issues are those of the catalog.
    const todo = listed.filter((n) => (from === undefined ? !read.has(n) : n >= from) && (to === undefined || n <= to));
    console.log(`JORT ${year} : ${todo.length} numéros à lire sur ${listed.length}`);
    for (const [i, number] of todo.entries()) {
      const issue = await fetchIssue(year, number);
      if (!issue) {
        console.log(`  n° ${String(number).padStart(3, "0")}: absent`);
        continue;
      }
      feed = await readIssue(feed, year, number, issue);
      if (i % 10 === 9) saveFeed(feed); // now and then: an interrupted run keeps what it read
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    saveFeed(feed);
    return feed;
  }
  // This year (the catalog may lag behind by a few minutes), or no catalog: numbers in order.
  let number = from ?? (read.size ? Math.max(...read) + 1 : 1);
  const past = year < new Date().getFullYear();
  let misses = 0;
  let found = read.size; // issues of the year read, before and during this run
  console.log(`JORT ${year}, à partir du n° ${number}`);
  for (; to === undefined || number <= to; number++) {
    if (from === undefined && read.has(number)) continue;
    const issue = await fetchIssue(year, number);
    if (!issue) {
      // This year's next issue is not out yet; a past year may skip a number, and ends after a few.
      if (!past || ++misses >= MISSES) {
        console.log(`  n° ${String(number).padStart(3, "0")}: ${past ? (found ? "fin de l’année" : "année absente en français") : "pas encore publié"}, arrêt.`);
        break;
      }
      continue;
    }
    misses = 0;
    found++;
    feed = await readIssue(feed, year, number, issue);
    saveFeed(feed); // after each issue: an interrupted run keeps what it read
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return feed;
}

/** "1990-2023" or "1995,2000": the years, most recent first. */
function yearsOf(spec: string): number[] {
  const years = spec.split(",").flatMap((part) => {
    const [a, b] = part.split("-").map(Number);
    if (!a || (b !== undefined && !b)) throw new Error(`Années illisibles : « ${spec} » (exemple : 1990-2023)`);
    const [lo, hi] = b ? [Math.min(a, b), Math.max(a, b)] : [a, a];
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  });
  return [...new Set(years)].sort((x, y) => y - x);
}

const pad = (n: number) => String(n).padStart(3, "0");

/**
 * Sample old issues before reading whole years: does the French edition exist, how big is it,
 * can the server send part of a file (to download only the sommaire), is there a text layer, does
 * the sommaire read. The first pages' lines are kept in data/veille/probe/ to adapt the reading.
 */
async function probe(years: number[]): Promise<void> {
  mkdirSync(PROBE, { recursive: true });
  console.log("Année  n°   téléchargé  caractères p. 1-3   sommaire");
  for (const year of years.sort((a, b) => a - b)) {
    for (const number of [1, 40]) {
      const got = await openIssue(year, number, 3);
      if (!got) {
        console.log(`${year}  ${pad(number)}  absent`);
        writeFileSync(path.join(PROBE, `${year}-${pad(number)}.json`), JSON.stringify({ year, number, exists: false }) + "\n");
        continue;
      }
      const { lines: pages, bytes } = got;
      const chars = pages.map((lines) => lines.reduce((n, l) => n + l.text.length, 0));
      if (chars.reduce((a, b) => a + b, 0) < MIN_TEXT) {
        // A scan: its first two pages as images, to work out how to read such issues (OCR).
        const res = await fetch(fetchUrl(year, number), { headers: { "User-Agent": UA } });
        const data = new Uint8Array(await res.arrayBuffer());
        downloaded += data.length;
        const images = await pdfPageImages(data, [1, 2], 150, "image/jpeg");
        images.forEach((img, i) => writeFileSync(path.join(PROBE, `${year}-${pad(number)}-p${i + 1}.jpg`), img));
      }
      const issue = parseIssue(pages);
      writeFileSync(
        path.join(PROBE, `${year}-${pad(number)}.json`),
        JSON.stringify({
          year,
          number,
          exists: true,
          bytes,
          chars,
          parsed: { number: issue.number, date: issue.date, firstPage: issue.firstPage, entries: issue.entries.length },
          sample: issue.entries.slice(0, 6).map((e) => `${e.institution ?? "?"} | ${e.title}`),
          pages: pages.map((lines) => lines.map((l) => [Math.round(l.x), Math.round(l.y), l.text])),
        }) + "\n",
      );
      console.log(
        `${year}  ${pad(number)}  ${(bytes / 1e6).toFixed(2).padStart(7)} Mo  ${chars.join("/").padEnd(18)}  ${issue.entries.length} textes`,
      );
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }
  console.log(`\nTéléchargé : ${(downloaded / 1e6).toFixed(0)} Mo. Résultats dans data/veille/probe/ : envoyez-les (git add data/veille/probe, commit, push).`);
}

async function main(): Promise<void> {
  let feed = loadFeed();
  const stored = () =>
    existsSync(SOMMAIRES)
      ? readdirSync(SOMMAIRES)
          .filter((f) => /^\d{4}\.json$/.test(f))
          .map((f) => loadSommaires(Number(f.slice(0, 4))))
      : [];
  if (process.argv.includes("--list")) {
    const only = option("year") ? Number(option("year")) : undefined;
    for (const y of stored().filter((y) => !only || y.year === only)) {
      for (const issue of Object.values(y.issues).sort((a, b) => (a.number ?? 0) - (b.number ?? 0))) {
        console.log(`\nJORT n° ${issue.number}/${y.year} (${issue.date ?? "date inconnue"})`);
        for (const e of issue.entries) {
          const level = assess(e)?.severity ?? "-";
          console.log(`  [${level}] p. ${e.page} ${e.institution ?? "?"} | ${e.title}`);
        }
      }
    }
    return;
  }
  if (process.argv.includes("--reassess")) {
    // feed.json is derived from the stored sommaires: rebuilt from them alone, dated by the last read.
    const years = stored();
    const before = feed.hits.length;
    feed = reassess({ updated: null, scanned: {}, hits: [] }, years);
    feed.amendments = amendments(years, catalogue(feed.hits));
    const updated = years.map((y) => y.updated ?? "").sort().at(-1) || null;
    writeFeed({ ...feed, updated });
    const count = years.reduce((n, y) => n + Object.keys(y.issues).length, 0);
    console.log(
      `Règles appliquées à nouveau à ${count} numéros : ${before} → ${feed.hits.length} textes repérés, ${feed.amendments.length} modifiant un texte du référentiel.`,
    );
    return;
  }
  if (process.argv.includes("--probe")) {
    const spec = option("probe");
    const now = new Date().getFullYear();
    await probe(spec && !spec.startsWith("--") ? yearsOf(spec) : Array.from({ length: Math.floor((now - 1 - 1960) / 5) + 1 }, (_, i) => 1960 + 5 * i));
    return;
  }
  const file = option("file");
  const year = option("year") ? Number(option("year")) : undefined;
  if (process.argv.includes("--reread")) {
    // Issues read before the reading was improved: no text found (not a scan), or titles glued.
    const only = option("years") ? new Set(yearsOf(option("years")!)) : null;
    const glued = (i: Issue) => i.entries.some((e) => /\.{4,}\s*\d/.test(e.title));
    let done = 0;
    for (const y of stored().filter((y) => !only || only.has(y.year)).sort((a, b) => b.year - a.year)) {
      // Scans are read again too: their OCR text may have come out since.
      const todo = Object.values(y.issues).filter((i) => i.number !== null && (!i.entries.length || glued(i)));
      if (!todo.length) continue;
      console.log(`JORT ${y.year} : ${todo.length} numéros à relire`);
      for (const issue of todo) {
        const again = await fetchIssue(y.year, issue.number!);
        if (!again) continue;
        feed = await readIssue(feed, y.year, issue.number!, again);
        saveFeed(feed);
        done++;
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    }
    console.log(`${done} numéros relus.`);
  } else if (process.argv.includes("--ocr")) {
    // Issues read from their PDF: their OCR text often lists more (a PDF whose text is cut up).
    const only = option("years") ? new Set(yearsOf(option("years")!)) : null;
    let better = 0;
    for (const y of stored().filter((y) => !only || only.has(y.year)).sort((a, b) => b.year - a.year)) {
      const todo = Object.values(y.issues).filter((i) => i.number !== null && i.source !== "ocr");
      console.log(`JORT ${y.year} : ${todo.length} numéros lus dans le PDF`);
      for (const [i, issue] of todo.entries()) {
        const ocr = await openMarkdown(y.year, issue.number!);
        if (ocr && ocr.entries.length > issue.entries.length) {
          console.log(`  n° ${pad(issue.number!)}: ${issue.entries.length} → ${ocr.entries.length} textes`);
          feed = await readIssue(feed, y.year, issue.number!, ocr);
          better++;
        } else if (!issue.source) saveSommaire(y.year, { ...issue, source: "pdf" }); // checked: the PDF's reading stays
        if (i % 10 === 9) saveFeed(feed);
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }
    }
    console.log(`${better} numéros mieux lus dans le texte OCR.`);
  } else if (file) {
    const number = Number(option("number"));
    if (!year || !number) throw new Error("--file needs --year and --number");
    const issue = file.endsWith(".md")
      ? { ...parseMarkdown(readFileSync(file, "utf8")), source: "ocr" as const }
      : { ...parseIssue(await pdfLines(new Uint8Array(readFileSync(file)), SOMMAIRE_PAGES)), source: "pdf" as const };
    feed = await readIssue(feed, year, number, issue);
    saveFeed(feed);
  } else {
    const from = option("from") ? Number(option("from")) : undefined;
    const to = option("to") ? Number(option("to")) : undefined;
    const now = new Date();
    const years = option("years")
      ? yearsOf(option("years")!)
      : year
        ? [year]
        : now.getMonth() === 0
          ? [now.getFullYear() - 1, now.getFullYear()]
          : [now.getFullYear()];
    for (const y of years) feed = await scanYear(feed, y, from, to);
  }
  feed.amendments = amendments(stored(), catalogue(feed.hits));
  saveFeed(feed);
  const count = (s: string) => feed.hits.filter((h) => h.severity === s).length;
  console.log(
    `\n${feed.hits.length} textes repérés : ${count("critique")} critiques, ${count("important")} importants, ${count("information")} pour information. Détail : vue Veille réglementaire.`,
  );
  const scans = stored().reduce((n, y) => n + Object.values(y.issues).filter((i) => i.sansTexte).length, 0);
  if (scans) console.log(`${scans} numéros scannés sans texte OCR pour l’instant : --reread les relira quand ocr.jort.tn l’aura.`);
  if (downloaded) console.log(`Téléchargé : ${(downloaded / 1e6).toFixed(1)} Mo.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
