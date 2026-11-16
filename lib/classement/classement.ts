/**
 * A classification kept: an establishment's activities (rubrique, case, quantity, ANPE entry), its
 * situation, and the synthesis once validated. Listed in Classement, opened again to change it,
 * and linked to the register it started.
 */
import { classifyEstablishment, type Activity } from "@/lib/establishment";
import type { Classe } from "@/lib/classify";
import { type ClassificationReport, reportFingerprint } from "@/lib/report";
import { establishmentStudy, type Situation, type StudyKind } from "@/lib/studies";

export interface Classement {
  id: string;
  nom: string;
  cree: string;
  maj: string;
  activites: Activity[];
  situation: Situation;
  sensible: boolean; // may affect a protected or sensitive area
  synthese: ClassificationReport | null; // the validated synthesis, if any
  registre: string | null; // the register it started
}

export function nouveauClassement(now = new Date(), init: Partial<Pick<Classement, "nom" | "activites" | "situation" | "sensible">> = {}): Classement {
  const stamp = now.toISOString();
  return {
    id: `cl-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    nom: init.nom ?? "",
    cree: stamp,
    maj: stamp,
    activites: init.activites ?? [],
    situation: init.situation ?? "projet",
    sensible: init.sensible ?? false,
    synthese: null,
    registre: null,
  };
}

export type Statut = "brouillon" | "valide" | "a-revalider";
export const STATUTS: Record<Statut, string> = { brouillon: "Brouillon", valide: "Synthèse validée", "a-revalider": "À revalider" };

/** The synthesis no longer matches the dossier (an activity, a quantity, the name changed since). */
export const synthesePerimee = (c: Classement) =>
  !!c.synthese && c.synthese.fingerprint !== reportFingerprint(c.activites, c.situation, c.sensible, c.nom);

/** Where a classification stands, for the list: its category, its study, its synthesis. */
export function etatClassement(c: Classement): { classe: Classe | null; complete: boolean; etude: StudyKind | null; manquantes: number; statut: Statut } {
  const est = classifyEstablishment(c.activites);
  const study = establishmentStudy(
    c.activites.map((a) => a.eie),
    c.situation,
    c.sensible,
  );
  return {
    classe: est.classe,
    complete: est.complete,
    etude: study.study?.kind ?? null,
    manquantes: study.missing,
    statut: !c.synthese ? "brouillon" : synthesePerimee(c) ? "a-revalider" : "valide",
  };
}

/** Nothing entered yet: not worth keeping when left. */
export const vide = (c: Classement) => !c.activites.length && !c.nom.trim() && !c.synthese;

/** A copy to start a variant from (another site, another scenario): no synthesis, no register. */
export function dupliquer(c: Classement, now = new Date()): Classement {
  return { ...nouveauClassement(now), nom: c.nom ? `${c.nom} (copie)` : "", activites: c.activites.map((a) => ({ ...a })), situation: c.situation, sensible: c.sensible };
}
