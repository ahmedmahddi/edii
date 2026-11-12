/**
 * GET /api/veille/cron: the daily reading of the JORT, called by Vercel Cron Jobs (vercel.json).
 * The issues published since those stored in the repository are read and committed to it
 * (lib/veille/store.ts); the commit makes Vercel rebuild the site with them.
 *
 * Vercel sends "Authorization: Bearer <CRON_SECRET>" when the deployment has a CRON_SECRET
 * variable; without it, or with another value, the call is refused.
 */
import { githubTarget, runVeille } from "@/lib/veille/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "non autorisé" }, { status: 401 });
  const target = githubTarget();
  if (!target) return Response.json({ error: "VEILLE_GITHUB_TOKEN et VEILLE_GITHUB_REPO manquants" }, { status: 500 });
  try {
    const run = await runVeille(target);
    console.log(
      `Veille : ${run.issues.filter((i) => i.issue).length} numéro(s) lu(s), ${run.stored.length} enregistré(s)` +
        (run.commit ? ` (commit ${run.commit.slice(0, 7)})` : "") +
        (run.remaining ? `, ${run.remaining} à lire au prochain passage` : ""),
    );
    return Response.json(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Veille : ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }
}
