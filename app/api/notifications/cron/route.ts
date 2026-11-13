/**
 * GET /api/notifications/cron: the weekly digest, called by Vercel Cron Jobs every Monday
 * (vercel.json), with "Authorization: Bearer <CRON_SECRET>". For each account that wants it, one
 * e-mail with what waits in the registers of its workspaces and the week's important JORT texts;
 * nothing is sent to an account with nothing to report, nor twice within six days.
 *
 *   ?dry=1    computes the e-mails and returns them, sends nothing (to check before going live)
 *   ?force=1  ignores the six days
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (to read every workspace), RESEND_API_KEY or BREVO_API_KEY, and
 * NOTIFY_FROM. The links lead to NEXT_PUBLIC_SITE_URL (else the address the cron called).
 */
import { all, serviceClient } from "@/lib/cloud/server";
import { digestRegistre, jortRecent, quiet, type WorkspaceDigest } from "@/lib/notify/digest";
import { renderDigest } from "@/lib/notify/email";
import { sendMail } from "@/lib/notify/send";
import { unsubscribeToken } from "@/lib/notify/token";
import type { Texte } from "@/lib/registre/referentiel";
import type { Ligne, Registre } from "@/lib/registre/registre";
import type { VeilleMeta } from "@/lib/veille/served";
import type { Amendment } from "@/lib/veille/watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SIX_DAYS = 6 * 24 * 3600 * 1000;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "non autorisé" }, { status: 401 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquants" }, { status: 500 });
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || url.origin).replace(/\/+$/, "");
  const now = new Date();

  try {
    const [profiles, memberships, organizations] = await Promise.all([
      all<{ id: string; email: string; full_name: string | null; notifications: boolean; notified_at: string | null }>((a, b) =>
        db.from("profiles").select("id, email, full_name, notifications, notified_at").eq("notifications", true).range(a, b),
      ),
      all<{ user_id: string; organization_id: string }>((a, b) => db.from("memberships").select("user_id, organization_id").range(a, b)),
      all<{ id: string; name: string }>((a, b) => db.from("organizations").select("id, name").range(a, b)),
    ]);
    // What the site serves of the veille (lib/veille/served.ts, built with the site).
    const served = async <T,>(file: string, empty: T): Promise<T> => {
      const res = await fetch(`${url.origin}/veille/${file}`, { signal: AbortSignal.timeout(20_000) });
      return res.ok ? ((await res.json()) as T) : empty;
    };
    const [meta, texts, amendments] = await Promise.all([
      served<VeilleMeta>("meta.json", { updated: null, scanned: {}, recent: [] }),
      served<Texte[]>("catalogue.json", []),
      served<Amendment[]>("amendements.json", []),
    ]);
    const jort = jortRecent(meta.recent, now);

    // One workspace at a time, only those someone will read.
    const wanted = new Set(profiles.map((p) => p.id));
    const digests = new Map<string, WorkspaceDigest>();
    for (const o of organizations) {
      if (!memberships.some((m) => m.organization_id === o.id && wanted.has(m.user_id))) continue;
      // The registers and their lines (lines in their own rows: supabase/migrations/…_lignes.sql).
      const [metas, lignes] = await Promise.all([
        all((a, b) => db.from("registres").select("id, data").eq("organization_id", o.id).range(a, b)),
        all((a, b) => db.from("registre_lignes").select("registre_id, data").eq("organization_id", o.id).range(a, b)),
      ]);
      const registres = metas.map((m) => ({
        ...(m.data as unknown as Registre),
        lignes: lignes.filter((l) => l.registre_id === m.id).map((l) => l.data as unknown as Ligne),
      }));
      digests.set(o.id, { id: o.id, nom: o.name, registres: registres.map((r) => digestRegistre(r, amendments, texts, now)) });
    }

    const report = { comptes: profiles.length, envoyes: 0, rien: 0, recents: 0, erreurs: [] as string[], apercu: [] as unknown[] };
    for (const p of profiles) {
      if (!force && p.notified_at && now.getTime() - new Date(p.notified_at).getTime() < SIX_DAYS) {
        report.recents++;
        continue;
      }
      const workspaces = memberships
        .filter((m) => m.user_id === p.id)
        .map((m) => digests.get(m.organization_id))
        .filter((w): w is WorkspaceDigest => !!w)
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
      const busy = workspaces.some((w) => w.registres.some((r) => !quiet(r)));
      if (!workspaces.length || (!busy && !jort.length)) {
        report.rien++;
        continue;
      }
      const unsubscribe = `${appUrl}/api/notifications/unsubscribe?u=${p.id}&t=${unsubscribeToken(p.id, secret)}`;
      const mail = renderDigest({ name: p.full_name, workspaces, jort, appUrl, unsubscribeUrl: unsubscribe, today: now });
      if (dry) {
        report.apercu.push({ to: p.email, subject: mail.subject, text: mail.text });
        continue;
      }
      const sent = await sendMail({ to: p.email, ...mail, unsubscribe });
      if (sent.ok) {
        report.envoyes++;
        await db.from("profiles").update({ notified_at: now.toISOString() }).eq("id", p.id);
      } else report.erreurs.push(`${p.email} : ${sent.error}`);
    }
    console.log(`Récapitulatif : ${report.envoyes} envoyé(s), ${report.rien} sans objet, ${report.recents} déjà envoyé(s), ${report.erreurs.length} erreur(s)`);
    return Response.json(report);
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)) || "erreur de lecture de la base";
    console.error(`Récapitulatif : ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }
}
