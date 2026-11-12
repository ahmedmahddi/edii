/**
 * POST /api/veille { scanned: { "2026": [1, 2, …] } }: the JORT issues published since those read
 * (lib/veille/live.ts), sommaires only, for the "Vérifier maintenant" button.
 *
 * When the deployment holds a GitHub token (VEILLE_GITHUB_TOKEN, with the right to run the
 * repository's workflows) and new issues are found, the weekly workflow is started at once, so
 * that they are stored and the site rebuilt with them (VEILLE_GITHUB_REPO "owner/name",
 * VEILLE_GITHUB_REF the branch it runs on, "main" by default).
 */
import { checkJort } from "@/lib/veille/live";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds: the catalog of jort.tn and a few OCR texts

type Enregistrement = "lance" | "non-configure" | "echec" | "inutile";

async function startWorkflow(): Promise<Enregistrement> {
  const token = process.env.VEILLE_GITHUB_TOKEN;
  const repo = process.env.VEILLE_GITHUB_REPO;
  if (!token || !repo) return "non-configure";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/veille.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "ABClassement veille" },
      body: JSON.stringify({ ref: process.env.VEILLE_GITHUB_REF ?? "main" }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.status === 204 ? "lance" : "echec";
  } catch {
    return "echec";
  }
}

export async function POST(request: Request): Promise<Response> {
  let scanned: Record<string, number[]> = {};
  try {
    const body = (await request.json()) as { scanned?: unknown };
    if (body.scanned && typeof body.scanned === "object") {
      for (const [year, numbers] of Object.entries(body.scanned as Record<string, unknown>))
        if (/^\d{4}$/.test(year) && Array.isArray(numbers)) scanned[year] = numbers.filter((n): n is number => Number.isInteger(n));
    }
  } catch {
    scanned = {};
  }
  try {
    const check = await checkJort(scanned);
    const enregistrement: Enregistrement = check.issues.some((i) => i.issue) ? await startWorkflow() : "inutile";
    return Response.json({ ...check, enregistrement });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
