/**
 * The JORT read at once, on demand ("Vérifier maintenant"): the issues published since the feed
 * was built, read from their OCR text on ocr.jort.tn, sommaire only. The server reads them (the OCR
 * texts cannot be read from a browser: no CORS); the page applies the rules to them, as the weekly
 * run does (lib/veille/watch.ts), and keeps them until the next deployment carries them.
 *
 * No file is written here: the weekly run (npm run veille, .github/workflows/veille.yml) stores
 * the sommaires in the repository.
 */
import type { Issue } from "./jort";
import { ocrUrl, parseMarkdown, parseMarkdownStart } from "./markdown";
import { type Feed, record } from "./watch";

export const CATALOG_URL = "https://index.jort.tn/catalog";
const OCR_START = 1 << 16; // the first bytes of an OCR text: the sommaire, mostly
const AHEAD = 3; // numbers tried past the last one the catalog lists (it lags by a few hours)

/** A published issue the feed does not have yet; `issue` is null when its text is not out yet. */
export interface LiveIssue {
  year: number;
  number: number;
  issue: Issue | null;
}

export interface LiveCheck {
  checked: string; // ISO date and time of the check
  issues: LiveIssue[]; // oldest first
  remaining: number; // issues left to read (more than one check reads at a time)
}

type Fetch = typeof fetch;

/** The French issues of each year in the catalog of jort.tn; null when it cannot be read. */
async function catalogYears(fetchImpl: Fetch): Promise<Map<number, number[]> | null> {
  try {
    const res = await fetchImpl(CATALOG_URL, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { collections: { id: string; years: Record<string, Record<string, { fr?: unknown }>> }[] };
    const years = data.collections.find((c) => c.id === "journal-officiel")?.years ?? {};
    return new Map(
      Object.entries(years).map(([y, issues]) => [
        Number(y),
        Object.entries(issues)
          .filter(([, langs]) => langs.fr)
          .map(([n]) => Number(n))
          .sort((a, b) => a - b),
      ]),
    );
  } catch {
    return null;
  }
}

/** An issue's sommaire from its OCR text; null when the text is not published (yet). */
export async function readOcrSommaire(year: number, number: number, fetchImpl: Fetch = fetch): Promise<Issue | null> {
  const get = async (range?: string) => {
    const res = await fetchImpl(ocrUrl(year, number), { headers: range ? { Range: range } : {}, signal: AbortSignal.timeout(20_000) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ocr.jort.tn : HTTP ${res.status} pour le n° ${number}/${year}`);
    return { text: await res.text(), whole: res.status === 200 };
  };
  const start = await get(`bytes=0-${OCR_START - 1}`);
  // Not there, or an HTML page in place of the text.
  if (!start || (/^\s*</.test(start.text) && !/<!--\s*page/.test(start.text))) return null;
  const issue = (start.whole ? parseMarkdown(start.text) : parseMarkdownStart(start.text)) ?? parseMarkdown((await get())?.text ?? "");
  return { ...issue, number, source: "ocr" };
}

/**
 * The issues published since those `scanned` (year → numbers read), this year's and, in January,
 * last year's: the catalog's, then the next numbers in case it lags. At most `max` are read; the
 * rest are counted in `remaining`.
 */
export async function checkJort(
  scanned: Record<string, number[]>,
  { now = new Date(), max = 8, fetchImpl = fetch }: { now?: Date; max?: number; fetchImpl?: Fetch } = {},
): Promise<LiveCheck> {
  const year = now.getFullYear();
  const years = now.getMonth() === 0 ? [year - 1, year] : [year];
  const catalog = await catalogYears(fetchImpl);
  const todo: { year: number; number: number; listed: boolean }[] = [];
  for (const y of years) {
    const read = new Set(scanned[String(y)] ?? []);
    const listed = catalog?.get(y) ?? [];
    for (const n of listed) if (!read.has(n)) todo.push({ year: y, number: n, listed: true });
    // Past the last known number (the catalog may lag, or could not be read).
    const last = Math.max(0, ...listed, ...read);
    for (let n = last + 1; n <= last + AHEAD; n++) todo.push({ year: y, number: n, listed: false });
  }
  const issues: LiveIssue[] = [];
  let remaining = 0;
  for (const year of years) {
    for (const t of todo.filter((x) => x.year === year)) {
      if (issues.length >= max) {
        if (t.listed) remaining++;
        continue;
      }
      const issue = await readOcrSommaire(t.year, t.number, fetchImpl);
      if (issue) issues.push({ year: t.year, number: t.number, issue });
      else if (t.listed) issues.push({ year: t.year, number: t.number, issue: null }); // published, text not out yet
      else break; // past the end of what is published
    }
  }
  return { checked: now.toISOString(), issues, remaining };
}

/** The feed with the issues of a check added (those it already has are left as they are). */
export function withLive(feed: Feed, issues: LiveIssue[]): Feed {
  let next = feed;
  for (const { year, issue } of issues) {
    if (!issue || issue.number === null || (feed.scanned[String(year)] ?? []).includes(issue.number)) continue;
    next = record(next, year, issue);
  }
  return next;
}
