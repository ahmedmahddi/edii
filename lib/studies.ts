/**
 * Which environmental study the ANPE (Agence nationale de protection de l'environnement) expects
 * for an establishment, under décret n° 2005-1991 du 11 juillet 2005 (data/eie.json).
 *
 * - Annexe 1 units need an étude d'impact sur l'environnement (art. 2): catégorie A gets the
 *   ANPE's avis within 21 working days, catégorie B within 3 months (art. 9). Annexe 2 units sign a
 *   cahier des charges (art. 3).
 * - The decree covers new units, and existing units that are extended, transformed or change
 *   their manufacturing process (art. 12).
 * - A unit already operating without that approval regularises with an étude de dépollution,
 *   on the ANPE's terms of reference (circulaire n° 27 du 7 novembre 2024; check it is in force).
 * - When neither annex applies, the promoter makes a demande d'avis to the ANPE.
 */
import data from "@/data/eie.json";

export type Annexe = "A" | "B" | "CDC";
export type Situation = "projet" | "extension" | "existant";
export type StudyKind = "eie_a" | "eie_b" | "cahier_des_charges" | "depollution" | "demande_avis";

export interface EieEntry {
  id: string; // "A14", "B6", "CDC11"
  annexe: Annexe;
  number: number;
  text: string;
  rubriques: string[]; // suggested EDII rubriques (data/eie-links.json), a reading to confirm
}

export const eie = data as unknown as { title: string; source: string; annexes: Record<Annexe, string>; entries: EieEntry[] };

export function eieEntry(id: string | undefined): EieEntry | undefined {
  return id ? eie.entries.find((e) => e.id === id) : undefined;
}

/** Entries suggested for a rubrique first, then the rest, in the decree's order. */
export function entriesFor(code: string): { suggested: EieEntry[]; others: EieEntry[] } {
  const suggested = eie.entries.filter((e) => e.rubriques.includes(code));
  return { suggested, others: eie.entries.filter((e) => !suggested.includes(e)) };
}

export const SITUATIONS: Record<Situation, string> = {
  projet: "Projet nouveau, pas encore réalisé",
  extension: "Unité existante : extension, transformation ou changement de procédé",
  existant: "Unité déjà en activité, sans étude d'impact ni cahier des charges (régularisation)",
};

export interface Study {
  kind: StudyKind;
  title: string;
  delay: string | null; // the ANPE's review time
  steps: string[];
  basis: string;
}

const EIE_STEPS = [
  "Faire élaborer l'étude par un bureau d'études ou des experts spécialisés (art. 2), selon les termes de référence sectoriels de l'ANPE (art. 6 et 7), aux frais du pétitionnaire.",
  "Contenu minimum (art. 6) : description de l'unité, état initial du site, effets prévisibles, mesures pour supprimer, réduire ou compenser ces effets et leur coût, plan de gestion environnementale.",
  "Déposer 3 exemplaires à l'ANPE et 1 exemplaire auprès de chaque ministère qui intervient dans l'autorisation (art. 8).",
  "Sans opposition notifiée par l'ANPE dans le délai, l'accord est tacite (art. 9) ; aucune autorisation de réalisation ne peut être délivrée avant (art. 5).",
];
const SENSITIVE_STEP =
  "Zone protégée ou sensible : l'ANPE demande l'avis du gestionnaire de la zone, qui a 15 jours ouvrables pour répondre (art. 10).";

export function study(kind: StudyKind, sensitive: boolean): Study {
  switch (kind) {
    case "eie_a":
      return {
        kind,
        title: "Étude d'impact sur l'environnement, catégorie A",
        delay: sensitive ? "3 mois ouvrables (zone protégée ou sensible, art. 9)" : "21 jours ouvrables (art. 9)",
        steps: sensitive ? [...EIE_STEPS, SENSITIVE_STEP] : EIE_STEPS,
        basis: "Décret n° 2005-1991, art. 2 et annexe 1, catégorie A",
      };
    case "eie_b":
      return {
        kind,
        title: "Étude d'impact sur l'environnement, catégorie B",
        delay: "3 mois ouvrables (art. 9)",
        steps: sensitive ? [...EIE_STEPS, SENSITIVE_STEP] : EIE_STEPS,
        basis: "Décret n° 2005-1991, art. 2 et annexe 1, catégorie B",
      };
    case "cahier_des_charges":
      return {
        kind,
        title: "Cahier des charges",
        delay: null,
        steps: [
          "Se procurer le cahier des charges de l'activité, approuvé par arrêté du ministre chargé de l'environnement (art. 3).",
          "Le signer et le faire légaliser ; en déposer 1 exemplaire à l'ANPE (sa direction régionale) et 1 auprès de chaque ministère concerné (art. 8).",
          "L'autorisation de réalisation est délivrée après réception du cahier des charges signé et légalisé (art. 5).",
        ],
        basis: "Décret n° 2005-1991, art. 3 et annexe 2",
      };
    case "depollution":
      return {
        kind,
        title: "Étude de dépollution",
        delay: null,
        steps: [
          "Demander à l'ANPE les termes de référence de l'étude de dépollution.",
          "Faire réaliser l'étude par un bureau d'études et la soumettre à l'approbation de l'ANPE.",
          "Mettre en œuvre le programme de dépollution approuvé (le FODEP peut en financer une partie).",
        ],
        basis: "Termes de référence de l'ANPE ; circulaire n° 27 du 7 novembre 2024 (régularisation des établissements classés)",
      };
    case "demande_avis":
      return {
        kind,
        title: "Demande d'avis",
        delay: null,
        steps: ["Adresser une demande d'avis à l'ANPE : l'activité ne relève ni de l'étude d'impact ni d'un cahier des charges."],
        basis: "Activité hors des annexes 1 et 2 du décret n° 2005-1991",
      };
  }
}

/** The study one activity calls for; entry is undefined when it is in neither annex. */
export function studyFor(entry: EieEntry | undefined, situation: Situation): StudyKind {
  if (!entry) return "demande_avis";
  if (situation === "existant") return "depollution";
  return entry.annexe === "A" ? "eie_a" : entry.annexe === "B" ? "eie_b" : "cahier_des_charges";
}

// Most demanding first: one étude d'impact covers the whole establishment.
const RANK: StudyKind[] = ["eie_b", "eie_a", "depollution", "cahier_des_charges", "demande_avis"];

export interface EstablishmentStudy {
  study: Study | null; // null until every activity's annex entry is chosen
  perActivity: (StudyKind | null)[];
  missing: number;
}

/**
 * entryIds: one per activity: an entry id, "none" (neither annex), or undefined (not chosen yet).
 */
export function establishmentStudy(entryIds: (string | undefined)[], situation: Situation, sensitive: boolean): EstablishmentStudy {
  const perActivity = entryIds.map((id) => {
    if (id === "none") return studyFor(undefined, situation);
    const entry = eieEntry(id);
    return entry ? studyFor(entry, situation) : null; // not chosen yet, or an id the decree does not have
  });
  const missing = perActivity.filter((k) => k === null).length;
  if (!perActivity.length || missing) return { study: null, perActivity, missing };
  const kind = RANK.find((k) => perActivity.includes(k))!;
  return { study: study(kind, sensitive), perActivity, missing };
}
