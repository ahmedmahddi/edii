/**
 * Veille réglementaire: read the JORT issues not read yet and record the texts that concern the
 * app in data/veille/feed.json (shown on the /veille page).
 *
 *   npm run veille                         new issues of the current year (and of last year in January)
 *   npm run veille -- --year 2025          new issues of 2025
 *   npm run veille -- --year 2025 --from 1 --to 40     re-read issues 1 to 40 of 2025
 *   npm run veille -- --file jort.pdf --year 2010 --number 18   read a PDF already on disk
 *
 * Issues are numbered from 1 each year at https://lake.jort.tn/journal-officiel/fr/<year>/<nnn>.pdf;
 * the first number that is not there yet ends the run. Only the sommaire (first pages) is read.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseIssue, pdfUrl } from "../lib/veille/jort";
import { pdfLines } from "../lib/veille/pdf";
import { type Feed, record } from "../lib/veille/watch";

const FEED = path.join(process.cwd(), "data", "veille", "feed.json");
const SOMMAIRE_PAGES = 8;
const PAUSE_MS = 400; // between downloads, to stay gentle with the server

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadFeed(): Feed {
  if (!existsSync(FEED)) return { updated: null, scanned: {}, hits: [] };
  return JSON.parse(readFileSync(FEED, "utf8")) as Feed;
}

function saveFeed(feed: Feed): void {
  writeFileSync(FEED, JSON.stringify({ ...feed, updated: new Date().toISOString() }, null, 1) + "\n");
}

/** The issue's PDF, or null when it is not published (yet). */
async function download(year: number, number: number): Promise<Uint8Array | null> {
  const url = pdfUrl(year, number);
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "ABClassement veille réglementaire" } });
  } catch (error) {
    const reason = error instanceof Error && error.cause instanceof Error ? error.cause.message : String(error);
    throw new Error(`Impossible de joindre lake.jort.tn (${reason}). Vérifiez la connexion Internet, puis relancez : ce qui a déjà été lu est gardé.`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());
  // A missing issue can also come back as an HTML page.
  if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") return null;
  return data;
}

async function readIssue(feed: Feed, year: number, number: number, data: Uint8Array): Promise<Feed> {
  const issue = parseIssue(await pdfLines(data, SOMMAIRE_PAGES));
  if (issue.number !== null && issue.number !== number) {
    console.warn(`  ! n° ${number}: the PDF says n° ${issue.number}; recorded as n° ${number}`);
  }
  issue.number = number;
  if (!issue.entries.length) console.warn(`  ! n° ${number}: no sommaire found (scanned issue, or a new layout)`);
  const next = record(feed, year, issue);
  const found = next.hits.filter((h) => h.year === year && h.issue === number);
  const flag = found.some((h) => h.severity === "critique") ? " ← CRITIQUE" : "";
  console.log(`  n° ${String(number).padStart(3, "0")} ${issue.date ?? ""}: ${issue.entries.length} textes, ${found.length} à lire${flag}`);
  for (const h of found) console.log(`      [${h.severity}] p. ${h.page} ${h.title.slice(0, 110)}`);
  return next;
}

async function scanYear(feed: Feed, year: number, from?: number, to?: number): Promise<Feed> {
  const read = new Set(feed.scanned[year] ?? []);
  let number = from ?? (read.size ? Math.max(...read) + 1 : 1);
  console.log(`JORT ${year}, à partir du n° ${number}`);
  for (; to === undefined || number <= to; number++) {
    if (from === undefined && read.has(number)) continue;
    const data = await download(year, number);
    if (!data) {
      console.log(`  n° ${String(number).padStart(3, "0")}: pas encore publié, arrêt.`);
      break;
    }
    feed = await readIssue(feed, year, number, data);
    saveFeed(feed); // after each issue: an interrupted run keeps what it read
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }
  return feed;
}

async function main(): Promise<void> {
  let feed = loadFeed();
  const file = option("file");
  const year = option("year") ? Number(option("year")) : undefined;
  if (file) {
    const number = Number(option("number"));
    if (!year || !number) throw new Error("--file needs --year and --number");
    feed = await readIssue(feed, year, number, new Uint8Array(readFileSync(file)));
    saveFeed(feed);
  } else {
    const from = option("from") ? Number(option("from")) : undefined;
    const to = option("to") ? Number(option("to")) : undefined;
    const now = new Date();
    const years = year ? [year] : now.getMonth() === 0 ? [now.getFullYear() - 1, now.getFullYear()] : [now.getFullYear()];
    for (const y of years) feed = await scanYear(feed, y, from, to);
  }
  const critical = feed.hits.filter((h) => h.severity === "critique").length;
  console.log(`\n${feed.hits.length} textes à lire dans la veille, dont ${critical} critiques. Détail : page /veille.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
