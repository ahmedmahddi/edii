/**
 * POST /api/veille { scanned: { "2026": [1, 2, …] } }: the JORT issues published since those read
 * (lib/veille/live.ts), sommaires only, for the "Vérifier maintenant" button.
 *
 * When the deployment can write to the repository (VEILLE_GITHUB_TOKEN, VEILLE_GITHUB_REPO,
 * VEILLE_GITHUB_REF: lib/veille/store.ts), the issues found are also committed to it at once, as the
 * daily run does, so that the site is rebuilt with them for everyone.
 */
import { checkJort } from "@/lib/veille/live";
import { githubTarget, storeIssues } from "@/lib/veille/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds: the catalog of jort.tn and a few OCR texts

type Enregistrement = "enregistre" | "deja" | "non-configure" | "echec" | "inutile";

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
  let check;
  try {
    check = await checkJort(scanned);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
  let enregistrement: Enregistrement = "inutile";
  if (check.issues.some((i) => i.issue)) {
    const target = githubTarget();
    if (!target) enregistrement = "non-configure";
    else {
      try {
        // Only the issues the repository does not have yet are written (another check may have).
        enregistrement = (await storeIssues(target, check.issues)).stored.length ? "enregistre" : "deja";
      } catch (error) {
        console.error(`Veille : ${error instanceof Error ? error.message : String(error)}`);
        enregistrement = "echec";
      }
    }
  }
  return Response.json({ ...check, enregistrement });
}
