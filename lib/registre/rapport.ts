/**
 * The compliance report of one establishment ("état de conformité"): what the register says on a
 * date, for a period. Pure: app/components/rapport-conformite.tsx lays it out for printing (PDF).
 */
import type { Amendment } from "@/lib/veille/watch";
import { rules } from "@/lib/veille/watch";
import type { Texte } from "./referentiel";
import { alertes, CONFORMITES, type Ligne, nouveautes, preuvesDe, prochaine, type Registre } from "./registre";

export interface RapportLigne {
  id: string; // the text's id: unique in a register (two texts may share a reference and a title)
  ref: string;
  titre: string;
  theme: string;
}
export interface RapportNC extends RapportLigne {
  depuis: string | null; // date of the evaluation that found it
  constat: string;
  action: string;
  responsable: string;
  echeance: string | null;
  etat: "en-retard" | "a-venir" | "a-planifier";
}
export interface RapportDomaine {
  domaine: string;
  label: string;
  total: number;
  C: number;
  NC: number;
  NA: number;
  aEvaluer: number;
  taux: number | null; // C / (C + NC), in %
}
export interface RapportTexte extends RapportLigne {
  conformite: string;
  evalue: string | null;
  prochaine: string | null;
  etat: string;
  preuves: string[];
}
export interface RapportConformite {
  date: string; // ISO date of the report
  depuis: string; // start of the period
  totaux: { applicables: number; evalues: number; C: number; NC: number; NA: number; aEvaluer: number; enRetard: number; bientot: number; taux: number | null; progression: number };
  domaines: RapportDomaine[];
  nonConformites: RapportNC[];
  actionsRealisees: (RapportLigne & { date: string })[];
  evaluationsPeriode: number;
  aVenir: (RapportLigne & { date: string | null; etat: "en-retard" | "bientot" })[];
  jort: { modifies: (RapportLigne & { amendment: string; par: string; jort: string })[]; nouveaux: number };
  textes: RapportTexte[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
export const refTexte = (l: Ligne) => [l.texte.type, l.texte.numero ? `n° ${l.texte.numero}` : "", l.texte.date ? `du ${l.texte.date.split("-").reverse().join("/")}` : ""].filter(Boolean).join(" ");
const base = (l: Ligne): RapportLigne => ({ id: l.texte.id, ref: refTexte(l), titre: l.texte.titre, theme: l.texte.theme });

export function rapportConformite(reg: Registre, amendments: Amendment[], texts: Texte[], today = new Date(), depuis?: string): RapportConformite {
  const date = iso(today);
  const from = depuis ?? iso(new Date(today.getTime() - 365 * 24 * 3600 * 1000));
  const lignes = reg.lignes.filter((l) => l.retenu);
  const count = (ls: Ligne[], c: string) => ls.filter((l) => l.conformite === c).length;
  const etats = new Map(lignes.map((l) => [l.texte.id, prochaine(l, today)]));
  const C = count(lignes, "C");
  const NC = count(lignes, "NC");
  const NA = count(lignes, "NA");
  const evalues = C + NC + NA;

  const domaines = [...new Set(lignes.map((l) => l.texte.domaine))]
    .map((d) => {
      const ls = lignes.filter((l) => l.texte.domaine === d);
      const c = count(ls, "C");
      const nc = count(ls, "NC");
      return { domaine: d, label: rules.domains[d] ?? (d || "Autres"), total: ls.length, C: c, NC: nc, NA: count(ls, "NA"), aEvaluer: ls.filter((l) => !l.conformite).length, taux: pct(c, c + nc) };
    })
    .sort((a, b) => b.NC - a.NC || b.total - a.total);

  const nonConformites: RapportNC[] = lignes
    .filter((l) => l.conformite === "NC")
    .map((l) => {
      const last = [...(l.historique ?? [])].reverse().find((e) => e.conformite === "NC");
      return {
        ...base(l),
        depuis: last?.date ?? (l.evalue || null),
        constat: last?.commentaire ?? "",
        action: l.plan,
        responsable: l.responsable,
        echeance: l.echeance || null,
        etat: !l.echeance ? ("a-planifier" as const) : l.echeance < date ? ("en-retard" as const) : ("a-venir" as const),
      };
    })
    .sort((a, b) => (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999"));

  const actionsRealisees = lignes
    .filter((l) => l.actionFaite && l.actionFaite >= from && l.actionFaite <= date)
    .map((l) => ({ ...base(l), date: l.actionFaite! }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const evaluationsPeriode = lignes.reduce((n, l) => n + (l.historique ?? []).filter((e) => e.date >= from && e.date <= date).length, 0);

  const aVenir = lignes
    .map((l) => ({ l, p: etats.get(l.texte.id)! }))
    .filter(({ p }) => p.etat === "en-retard" || p.etat === "bientot")
    .map(({ l, p }) => ({ ...base(l), date: p.date, etat: p.etat as "en-retard" | "bientot" }))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));

  const modifies = alertes(reg, amendments).map(({ ligne, amendment }) => ({ ...base(ligne), amendment: amendment.id, par: amendment.title, jort: `JORT n° ${amendment.issue}/${amendment.year}` }));

  const textes: RapportTexte[] = lignes.map((l) => {
    const p = etats.get(l.texte.id)!;
    return {
      ...base(l),
      conformite: l.conformite ? CONFORMITES[l.conformite] : "À évaluer",
      evalue: l.evalue || null,
      prochaine: p.date,
      etat: p.etat,
      preuves: preuvesDe(l).map((x) => (x.texte ? `${x.nom} : ${x.texte}` : x.nom)),
    };
  });

  return {
    date,
    depuis: from,
    totaux: {
      applicables: lignes.length,
      evalues,
      C,
      NC,
      NA,
      aEvaluer: lignes.length - evalues,
      enRetard: aVenir.filter((x) => x.etat === "en-retard").length,
      bientot: aVenir.filter((x) => x.etat === "bientot").length,
      taux: pct(C, C + NC),
      progression: pct(evalues, lignes.length) ?? 0,
    },
    domaines,
    nonConformites,
    actionsRealisees,
    evaluationsPeriode,
    aVenir,
    jort: { modifies, nouveaux: texts.length ? nouveautes(reg, texts).length : 0 },
    textes,
  };
}
