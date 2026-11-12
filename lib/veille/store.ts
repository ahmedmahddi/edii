/**
 * The JORT issues read on the server stored in the repository, without GitHub Actions: the files
 * the weekly script writes (data/veille/sommaires/<year>.json and data/veille/fiches/<year>.json)
 * are updated through GitHub's REST API and committed on the deployed branch; Vercel then rebuilds
 * the site, whose prebuild turns the sommaires into the feed (scripts/veille.ts --reassess).
 *
 * Used by the daily Vercel Cron Job (app/api/veille/cron) and by the "Vérifier maintenant" button
 * (app/api/veille). It needs, on the deployment:
 *   VEILLE_GITHUB_TOKEN  a fine-grained token on the repository with "Contents: read and write"
 *   VEILLE_GITHUB_REPO   "owner/name"
 *   VEILLE_GITHUB_REF    the branch Vercel deploys ("main" by default)
 */
import { bodies, compact, type FicheData, readFiche } from "./fiche";
import type { Issue } from "./jort";
import { checkJort, type LiveCheck, type LiveIssue } from "./live";
import { ocrUrl } from "./markdown";
import { hitsOf, type Sommaires } from "./watch";

type Fetch = typeof fetch;

export interface GitHubTarget {
  token: string;
  repo: string; // "owner/name"
  ref: string; // branch
}

/** The repository to store into, from the deployment's environment; null when not configured. */
export function githubTarget(env: Record<string, string | undefined> = process.env): GitHubTarget | null {
  const token = env.VEILLE_GITHUB_TOKEN;
  const repo = env.VEILLE_GITHUB_REPO;
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo, ref: env.VEILLE_GITHUB_REF || "main" };
}

export interface Stored {
  stored: { year: number; number: number }[]; // issues added to the repository, oldest first
  commit: string | null; // the commit that added them
}

type FichesFile = { year: number; issues: Record<string, Record<string, FicheData>> };

const sommairesPath = (year: number) => `data/veille/sommaires/${year}.json`;
const fichesPath = (year: number) => `data/veille/fiches/${year}.json`;
const byNumber = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => Number(a) - Number(b)));

/** A small client for the parts of GitHub's REST API used here. */
function github(target: GitHubTarget, fetchImpl: Fetch) {
  const call = async (path: string, init: RequestInit = {}, accept = "application/vnd.github+json") => {
    const res = await fetchImpl(`https://api.github.com/repos/${target.repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${target.token}`,
        Accept: accept,
        "User-Agent": "ABClassement veille",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    return res;
  };
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const res = await call(path, init);
    if (!res.ok) throw new Error(`GitHub : HTTP ${res.status} (${init?.method ?? "GET"} ${path.split("?")[0]})`);
    return (await res.json()) as T;
  };
  return {
    /** The commit the branch points at. */
    head: async () => (await json<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(target.ref)}`)).object.sha,
    /** A file's text at a commit; null when it does not exist. Raw: files of a few megabytes too. */
    read: async (path: string, sha: string): Promise<string | null> => {
      const res = await call(`/contents/${path}?ref=${sha}`, {}, "application/vnd.github.raw+json");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`GitHub : HTTP ${res.status} en lisant ${path}`);
      return res.text();
    },
    /** One commit on top of `parent` with the files given; false when the branch moved meanwhile. */
    commit: async (parent: string, files: Record<string, string>, message: string): Promise<string | false> => {
      const base = await json<{ tree: { sha: string } }>(`/git/commits/${parent}`);
      const tree = await json<{ sha: string }>(`/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: base.tree.sha,
          tree: Object.entries(files).map(([path, content]) => ({ path, mode: "100644", type: "blob", content })),
        }),
      });
      const commit = await json<{ sha: string }>(`/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.sha, parents: [parent] }),
      });
      const res = await call(`/git/refs/heads/${encodeURIComponent(target.ref)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
      if (res.status === 422 || res.status === 409) return false; // not a fast-forward: someone pushed
      if (!res.ok) throw new Error(`GitHub : HTTP ${res.status} en mettant à jour ${target.ref}`);
      return commit.sha;
    },
  };
}

/** The fiches of an issue's texts that concern the app, read in its whole OCR text (as npm run veille --fiches). */
async function fichesOf(year: number, issue: Issue, fetchImpl: Fetch): Promise<Record<string, FicheData>> {
  const hits = hitsOf(year, issue);
  if (!hits.length || issue.number === null) return {};
  let text: string | null = null;
  try {
    const res = await fetchImpl(ocrUrl(year, issue.number), { signal: AbortSignal.timeout(30_000) });
    if (res.ok) text = await res.text();
  } catch {
    text = null; // the fiches stay to be read by npm run veille -- --fiches
  }
  if (!text || !/<!--\s*page/.test(text)) return {};
  const cuts = bodies(
    text,
    issue.entries.map((e) => ({ title: e.title, page: issue.firstPage !== null && e.page ? e.page - issue.firstPage : null })),
  );
  return Object.fromEntries(
    hits.map((h) => {
      const entry = h.id.split("-").at(-1)!;
      return [entry, compact(readFiche(cuts[Number(entry)] ?? null))];
    }),
  );
}

/**
 * Store the issues read (those the repository does not have yet) with the fiches of their texts,
 * in one commit. Nothing is written when they are all there already.
 */
export async function storeIssues(
  target: GitHubTarget,
  issues: LiveIssue[],
  { fetchImpl = fetch, now = new Date() }: { fetchImpl?: Fetch; now?: Date } = {},
): Promise<Stored> {
  const gh = github(target, fetchImpl);
  const read = issues.filter((i): i is LiveIssue & { issue: Issue } => i.issue !== null);
  if (!read.length) return { stored: [], commit: null };
  const fiches = new Map<string, Record<string, FicheData>>(); // read once, kept across a retry
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = await gh.head();
    const files: Record<string, string> = {};
    const stored: Stored["stored"] = [];
    for (const year of [...new Set(read.map((i) => i.year))].sort()) {
      const text = await gh.read(sommairesPath(year), head);
      const all: Sommaires = text ? JSON.parse(text) : { year, issues: {} };
      const added = read.filter((i) => i.year === year && !(String(i.number) in all.issues));
      if (!added.length) continue;
      const fichesText = await gh.read(fichesPath(year), head);
      const fichesFile: FichesFile = fichesText ? JSON.parse(fichesText) : { year, issues: {} };
      for (const { number, issue } of added) {
        all.issues[String(number)] = { ...issue, number };
        const key = `${year}-${number}`;
        if (!fiches.has(key)) fiches.set(key, await fichesOf(year, { ...issue, number }, fetchImpl));
        const f = fiches.get(key)!;
        if (Object.keys(f).length) fichesFile.issues[String(number)] = { ...(fichesFile.issues[String(number)] ?? {}), ...f };
        stored.push({ year, number });
      }
      // The same layout as scripts/veille.ts writes them.
      files[sommairesPath(year)] = JSON.stringify({ year, updated: now.toISOString(), issues: byNumber(all.issues) }) + "\n";
      if (added.some(({ number }) => Object.keys(fiches.get(`${year}-${number}`) ?? {}).length))
        files[fichesPath(year)] = JSON.stringify({ year, issues: byNumber(fichesFile.issues) }) + "\n";
    }
    if (!stored.length) return { stored, commit: null };
    const list = stored.map((s) => `${s.number}/${s.year}`).join(", ");
    const commit = await gh.commit(head, files, `Veille : JORT n° ${list} (lecture automatique du ${now.toISOString().slice(0, 10)})`);
    if (commit) return { stored, commit };
  }
  throw new Error("GitHub : la branche a changé pendant l’enregistrement, réessayez");
}

/**
 * The daily run: the issues published since those stored in the repository, read and stored.
 * The issues of this year (and of last year in January), as npm run veille.
 */
export async function runVeille(
  target: GitHubTarget,
  { fetchImpl = fetch, now = new Date(), max = 6 }: { fetchImpl?: Fetch; now?: Date; max?: number } = {},
): Promise<LiveCheck & Stored> {
  const gh = github(target, fetchImpl);
  const head = await gh.head();
  const years = now.getMonth() === 0 ? [now.getFullYear() - 1, now.getFullYear()] : [now.getFullYear()];
  const scanned: Record<string, number[]> = {};
  for (const year of years) {
    const text = await gh.read(sommairesPath(year), head);
    scanned[String(year)] = text ? Object.keys((JSON.parse(text) as Sommaires).issues).map(Number) : [];
  }
  const check = await checkJort(scanned, { now, max, fetchImpl });
  return { ...check, ...(await storeIssues(target, check.issues, { fetchImpl, now })) };
}
