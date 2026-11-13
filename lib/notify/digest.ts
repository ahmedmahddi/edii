/**
 * The weekly digest: what each register has waiting (evaluations late or due within 30 days,
 * actions of non-conformities to plan or overdue, texts modified at the JORT, new texts that apply),
 * and the important texts of the Journal officiel published in the past week. Pure: the cron route
 * (app/api/notifications/cron) reads the data and sends the e-mails (lib/notify/email.ts, send.ts).
 */
import type { Texte } from "@/lib/registre/referentiel";
import { alertes, nouveautes, prochaine, type Registre } from "@/lib/registre/registre";
import type { Amendment, Hit } from "@/lib/veille/watch";

export interface DigestItem {
  titre: string;
  date: string | null; // next evaluation, or the action's deadline
  responsable?: string;
}

export interface RegistreDigest {
  id: string;
  nom: string;
  retard: DigestItem[]; // evaluations late
  bientot: DigestItem[]; // evaluations due within 30 days
  actions: DigestItem[]; // non-conformities whose action is overdue, due within 14 days, or not planned
  actionsDepassees: number;
  jort: number; // texts of the register modified at the JORT
  nouveaux: number; // new texts that apply to the site
  aEvaluer: number; // texts never evaluated (shown as a count only: a new register has them all)
}

export interface WorkspaceDigest {
  id: string;
  nom: string;
  registres: RegistreDigest[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
};

export function digestRegistre(reg: Registre, amendments: Amendment[], texts: Texte[], today = new Date()): RegistreDigest {
  const now = iso(today);
  const soon = addDays(now, 14);
  const retard: DigestItem[] = [];
  const bientot: DigestItem[] = [];
  const actions: DigestItem[] = [];
  let actionsDepassees = 0;
  let aEvaluer = 0;
  for (const l of reg.lignes) {
    if (!l.retenu) continue;
    const next = prochaine(l, today);
    if (next.etat === "en-retard") retard.push({ titre: l.texte.titre, date: next.date });
    else if (next.etat === "bientot") bientot.push({ titre: l.texte.titre, date: next.date });
    else if (next.etat === "a-evaluer") aEvaluer++;
    if (l.conformite === "NC" && !l.actionFaite && (!l.echeance || l.echeance <= soon)) {
      if (l.echeance && l.echeance < now) actionsDepassees++;
      actions.push({ titre: l.texte.titre, date: l.echeance || null, responsable: l.responsable || undefined });
    }
  }
  const byDate = (a: DigestItem, b: DigestItem) => (a.date ?? "9999").localeCompare(b.date ?? "9999");
  return {
    id: reg.id,
    nom: reg.nom,
    retard: retard.sort(byDate),
    bientot: bientot.sort(byDate),
    actions: actions.sort(byDate),
    actionsDepassees,
    jort: alertes(reg, amendments).length,
    nouveaux: texts.length ? nouveautes(reg, texts).length : 0,
    aEvaluer,
  };
}

/** Nothing to tell about this register this week. */
export const quiet = (d: RegistreDigest) => !d.retard.length && !d.bientot.length && !d.actions.length && !d.jort && !d.nouveaux;

/** The important texts of the Journal officiel published in the `days` before today, newest first. */
export function jortRecent(hits: Hit[], today = new Date(), days = 7): Hit[] {
  const from = addDays(iso(today), -days);
  return hits
    .filter((h) => h.severity !== "information" && h.date && h.date > from && h.date <= iso(today))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.issue - a.issue);
}
