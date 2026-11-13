/**
 * The digest as an e-mail: HTML with inline styles (what mail clients keep), and plain text.
 */
import type { Hit } from "@/lib/veille/watch";
import { type DigestItem, quiet, type WorkspaceDigest } from "./digest";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dateFr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const SHOWN = 5;

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDigest({
  name,
  workspaces,
  jort,
  appUrl,
  unsubscribeUrl,
  today = new Date(),
}: {
  name: string | null;
  workspaces: WorkspaceDigest[];
  jort: Hit[];
  appUrl: string;
  unsubscribeUrl: string;
  today?: Date;
}): DigestEmail {
  const regs = workspaces.flatMap((w) => w.registres.filter((r) => !quiet(r)));
  const retard = regs.reduce((n, r) => n + r.retard.length, 0);
  const actions = regs.reduce((n, r) => n + r.actions.length, 0);
  const subject =
    retard || actions
      ? `ABClassement : ${[retard ? plural(retard, "évaluation en retard", "évaluations en retard") : "", actions ? plural(actions, "action à suivre", "actions à suivre") : ""].filter(Boolean).join(", ")}`
      : jort.length
        ? `ABClassement : ${plural(jort.length, "nouveau texte important", "nouveaux textes importants")} au JORT`
        : "ABClassement : votre récapitulatif de la semaine";

  const text: string[] = [`Bonjour${name ? ` ${name}` : ""},`, "", `Votre récapitulatif ABClassement du ${dateFr(today.toISOString().slice(0, 10))}.`, ""];
  const html: string[] = [];
  const h2 = (s: string) => `<h2 style="font-size:17px;margin:24px 0 8px;color:#0f172a">${esc(s)}</h2>`;
  const p = (s: string, color = "#334155") => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${color}">${s}</p>`;
  const list = (items: DigestItem[], label: (i: DigestItem) => string) => {
    const shown = items.slice(0, SHOWN);
    const more = items.length - shown.length;
    return (
      `<ul style="margin:4px 0 10px;padding-left:18px;font-size:14px;line-height:1.5;color:#334155">${shown.map((i) => `<li>${esc(i.titre)} <span style="color:#64748b">— ${esc(label(i))}</span></li>`).join("")}` +
      `${more > 0 ? `<li style="color:#64748b">et ${more} autre${more > 1 ? "s" : ""}</li>` : ""}</ul>`
    );
  };
  const tlist = (items: DigestItem[], label: (i: DigestItem) => string) =>
    items
      .slice(0, SHOWN)
      .map((i) => `  - ${i.titre} (${label(i)})`)
      .concat(items.length > SHOWN ? [`  - et ${items.length - SHOWN} autre(s)`] : []);

  for (const w of workspaces) {
    const active = w.registres.filter((r) => !quiet(r));
    if (!active.length) continue;
    if (workspaces.length > 1) {
      html.push(`<p style="margin:28px 0 0;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#0a6ed1;font-weight:600">${esc(w.nom)}</p>`);
      text.push(`== ${w.nom} ==`, "");
    }
    for (const r of active) {
      html.push(h2(r.nom));
      text.push(r.nom.toUpperCase());
      if (r.retard.length) {
        html.push(p(`<strong style="color:#c2362f">${plural(r.retard.length, "évaluation en retard", "évaluations en retard")}</strong>`));
        html.push(list(r.retard, (i) => (i.date ? `prévue le ${dateFr(i.date)}` : "")));
        text.push(`${plural(r.retard.length, "évaluation en retard", "évaluations en retard")} :`, ...tlist(r.retard, (i) => (i.date ? `prévue le ${dateFr(i.date)}` : "")));
      }
      if (r.actions.length) {
        html.push(p(`<strong style="color:#9a6200">${plural(r.actions.length, "action à suivre", "actions à suivre")}</strong>${r.actionsDepassees ? ` (${r.actionsDepassees} échéance${r.actionsDepassees > 1 ? "s" : ""} dépassée${r.actionsDepassees > 1 ? "s" : ""})` : ""}`));
        const label = (i: DigestItem) => [i.date ? `échéance ${dateFr(i.date)}` : "à planifier", i.responsable].filter(Boolean).join(" · ");
        html.push(list(r.actions, label));
        text.push(`${plural(r.actions.length, "action à suivre", "actions à suivre")} :`, ...tlist(r.actions, label));
      }
      if (r.bientot.length) {
        html.push(p(`<strong>${plural(r.bientot.length, "évaluation", "évaluations")} à faire sous 30 jours</strong>`));
        html.push(list(r.bientot, (i) => (i.date ? `avant le ${dateFr(i.date)}` : "")));
        text.push(`${plural(r.bientot.length, "évaluation", "évaluations")} à faire sous 30 jours :`, ...tlist(r.bientot, (i) => (i.date ? `avant le ${dateFr(i.date)}` : "")));
      }
      const jortLine = [r.jort ? `${plural(r.jort, "texte du registre modifié", "textes du registre modifiés")} au JORT` : "", r.nouveaux ? `${plural(r.nouveaux, "nouveau texte applicable", "nouveaux textes applicables")}` : ""].filter(Boolean).join(" · ");
      if (jortLine) {
        html.push(p(`<strong style="color:#0a6ed1">${esc(jortLine)}</strong> : à examiner dans le registre.`));
        text.push(`${jortLine} : à examiner dans le registre.`);
      }
      text.push("");
    }
  }

  if (jort.length) {
    html.push(h2("Au Journal officiel cette semaine"));
    html.push(
      `<ul style="margin:4px 0 10px;padding-left:18px;font-size:14px;line-height:1.5;color:#334155">${jort
        .slice(0, SHOWN)
        .map((h) => `<li>${h.severity === "critique" ? '<strong style="color:#c2362f">Critique</strong> · ' : ""}<a href="${esc(h.pdf)}" style="color:#0a6ed1">${esc(h.title)}</a> <span style="color:#64748b">— JORT n° ${h.issue}/${h.year}</span></li>`)
        .join("")}${jort.length > SHOWN ? `<li style="color:#64748b">et ${jort.length - SHOWN} autre${jort.length - SHOWN > 1 ? "s" : ""}</li>` : ""}</ul>`,
    );
    text.push("AU JOURNAL OFFICIEL CETTE SEMAINE", ...jort.slice(0, SHOWN).map((h) => `  - ${h.title} (JORT n° ${h.issue}/${h.year})`), "");
  }

  text.push(`Ouvrir ABClassement : ${appUrl}`, "", `Ne plus recevoir ce récapitulatif : ${unsubscribeUrl}`);
  const body = `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#eef1f6">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<p style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-.03em;color:#0f172a"><span style="color:#0a6ed1">ABC</span>lassement<span style="color:#9aa6b2">.</span></p>
<div style="background:#ffffff;border-radius:16px;padding:24px;border:1px solid #e2e8f0">
${p(`Bonjour${name ? ` ${esc(name)}` : ""},`)}
${p(`Voici ce qui vous attend cette semaine (${esc(dateFr(today.toISOString().slice(0, 10)))}).`, "#64748b")}
${html.join("\n")}
<p style="margin:24px 0 0"><a href="${esc(appUrl)}" style="display:inline-block;background:#0a6ed1;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:12px">Ouvrir ABClassement</a></p>
</div>
<p style="margin:16px 4px 0;font-size:12px;line-height:1.5;color:#64748b">Vous recevez ce récapitulatif chaque lundi parce que vous êtes membre d’un espace ABClassement. <a href="${esc(unsubscribeUrl)}" style="color:#64748b">Ne plus le recevoir</a> · réactivable dans Mon compte.</p>
</div></body></html>`;
  return { subject, html: body, text: text.join("\n") };
}
