/**
 * Where a register stands, in figures: what the home, the list of registers and the register's own
 * header show. One function, so the three never disagree.
 */
import type { Texte } from "@/lib/registre/referentiel";
import { alertes, dues, nouveautes, prochaine, type Registre } from "@/lib/registre/registre";
import type { Amendment } from "@/lib/veille/watch";

export interface EtatRegistre {
  retenus: number; // texts in the register
  evalues: number;
  conformes: number;
  nonConformes: number;
  nonApplicables: number;
  retard: number; // evaluations late
  aFaire: number; // never evaluated, or due within 30 days
  jort: number; // texts of the register modified at the JORT
  nouveaux: number; // new texts that apply to the site
  progress: number; // % of texts evaluated
  taux: number | null; // % conforming among the texts evaluated C or NC
}

export function etatRegistre(reg: Registre, amendments: Amendment[], texts: Texte[], today = new Date()): EtatRegistre {
  const retenus = reg.lignes.filter((l) => l.retenu);
  const due = dues(reg, today);
  const count = (c: string) => retenus.filter((l) => l.conformite === c).length;
  const conformes = count("C");
  const nonConformes = count("NC");
  const evalues = retenus.filter((l) => l.conformite).length;
  return {
    retenus: retenus.length,
    evalues,
    conformes,
    nonConformes,
    nonApplicables: count("NA"),
    retard: due.filter((l) => prochaine(l, today).etat === "en-retard").length,
    aFaire: due.filter((l) => prochaine(l, today).etat !== "en-retard").length,
    jort: alertes(reg, amendments).length,
    nouveaux: texts.length ? nouveautes(reg, texts).length : 0,
    progress: retenus.length ? Math.round((evalues / retenus.length) * 100) : 0,
    taux: conformes + nonConformes ? Math.round((conformes / (conformes + nonConformes)) * 100) : null,
  };
}

/** Nothing waits: no evaluation late or due, no non-conformity, nothing new from the JORT. */
export const aJour = (e: EtatRegistre) => !e.retard && !e.aFaire && !e.nonConformes && !e.jort && !e.nouveaux;
