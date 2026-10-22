/**
 * The site profile a register is built from: what the classification already says (category,
 * rubriques, sectors, ANPE study) and what only the consultant knows (workforce, vehicles,
 * equipment, products, discharges…). A text of the référentiel applies when one of its conditions
 * holds for the profile.
 *
 * Conditions (a text lists several: any of them is enough; "a+b" needs both):
 *   tous                    every establishment
 *   classe                  a classified establishment (1ère, 2ème or 3ème catégorie)
 *   categorie:1             that category
 *   secteur:1200            a rubrique of that section of the nomenclature
 *   rubrique:2505           that rubrique
 *   etude:eie_a, etude:eie  that ANPE study (eie: A or B), see lib/studies.ts
 *   effectif, effectif:50   at least one employee, at least 50
 *   vehicules, …            a fact of the profile (FLAGS)
 */
import type { Classe } from "../classify";
import { SECTORS } from "../sectors";
import type { StudyKind } from "../studies";

export interface Flag {
  id: string;
  label: string;
  group: string;
  sections?: string[]; // ticked by default when the establishment has a rubrique of these sections
}

export const FLAG_GROUPS = ["Transport et véhicules", "Équipements", "Produits et matières", "Rejets et nuisances", "Site et activité"];

export const FLAGS: Flag[] = [
  { id: "vehicules", label: "Véhicules ou engins de l’entreprise", group: "Transport et véhicules" },
  { id: "transport-marchandises", label: "Transport de marchandises", group: "Transport et véhicules" },
  { id: "transport-personnel", label: "Transport du personnel ou de personnes", group: "Transport et véhicules" },
  { id: "transport-matieres-dangereuses", label: "Transport de matières dangereuses", group: "Transport et véhicules" },

  { id: "appareils-pression", label: "Appareils à pression (chaudières, compresseurs, réservoirs d’air)", group: "Équipements" },
  { id: "levage", label: "Appareils de levage (ponts roulants, chariots élévateurs, ascenseurs)", group: "Équipements" },
  { id: "groupe-electrogene", label: "Groupe électrogène, poste de transformation", group: "Équipements" },
  { id: "froid", label: "Installations frigorifiques ou de climatisation (fluides frigorigènes)", group: "Équipements" },
  { id: "rayonnements", label: "Sources radioactives, appareils à rayons X", group: "Équipements", sections: ["2600"] },

  { id: "produits-chimiques", label: "Produits chimiques dangereux", group: "Produits et matières", sections: ["1400", "2100", "2200", "2300", "2700"] },
  { id: "hydrocarbures", label: "Stockage ou distribution d’hydrocarbures, de gaz", group: "Produits et matières", sections: ["2500"] },
  { id: "explosifs", label: "Explosifs, artifices", group: "Produits et matières", sections: ["2400"] },
  { id: "denrees", label: "Denrées alimentaires (production, transformation, stockage)", group: "Produits et matières", sections: ["1200"] },
  { id: "animaux", label: "Animaux (élevage, abattage)", group: "Produits et matières", sections: ["1100"] },

  { id: "rejets-eau", label: "Rejets d’eaux usées industrielles", group: "Rejets et nuisances" },
  { id: "emissions-air", label: "Émissions atmosphériques (cheminées, fours, chaudières)", group: "Rejets et nuisances" },
  { id: "dechets-dangereux", label: "Déchets dangereux (huiles, solvants, emballages souillés…)", group: "Rejets et nuisances", sections: ["1500"] },
  { id: "bruit", label: "Bruit ou vibrations vers le voisinage", group: "Rejets et nuisances" },

  { id: "erp", label: "Locaux recevant du public", group: "Site et activité" },
  { id: "restauration", label: "Cantine, restauration du personnel", group: "Site et activité" },
  { id: "import-export", label: "Importation ou exportation", group: "Site et activité" },
  { id: "forage", label: "Forage, prélèvement d’eau", group: "Site et activité" },
  { id: "energie", label: "Forte consommation d’énergie (audit énergétique)", group: "Site et activité" },
  { id: "chantier", label: "Bâtiment et travaux publics, chantiers", group: "Site et activité" },
  { id: "hotellerie", label: "Hôtellerie, tourisme, restauration", group: "Site et activité" },
  { id: "sante", label: "Établissement de santé, laboratoire d’analyses", group: "Site et activité" },
  { id: "commerce", label: "Commerce, distribution", group: "Site et activité" },
];

const FLAG = new Map(FLAGS.map((f) => [f.id, f]));

export interface Site {
  classe: Classe | null;
  sections: string[]; // "1200"
  rubriques: string[]; // "1214"
  etude: StudyKind | null;
  effectif: number | null;
  flags: string[];
}

/** The flags the rubriques suggest, ticked when a register is created. */
export function derivedFlags(sections: string[]): string[] {
  return FLAGS.filter((f) => f.sections?.some((s) => sections.includes(s))).map((f) => f.id);
}

const STUDIES: Record<string, string> = {
  eie: "Étude d’impact",
  eie_a: "Étude d’impact, catégorie A",
  eie_b: "Étude d’impact, catégorie B",
  cahier_des_charges: "Cahier des charges",
  depollution: "Étude de dépollution",
  demande_avis: "Demande d’avis",
};

/** One condition, in words: why a text was proposed. */
export function conditionLabel(condition: string): string {
  const [key, value] = condition.split(":");
  switch (key) {
    case "tous":
      return "Tout établissement";
    case "classe":
      return "Établissement classé";
    case "categorie":
      return `${value}${value === "1" ? "ère" : "ème"} catégorie`;
    case "secteur":
      return `Secteur ${SECTORS[value]?.[0] ?? value}`;
    case "rubrique":
      return `Rubrique ${value}`;
    case "etude":
      return STUDIES[value] ?? value;
    case "effectif":
      return value ? `Effectif d’au moins ${value}` : "Personnel salarié";
    default:
      return FLAG.get(condition)?.label ?? condition;
  }
}

function holds(condition: string, site: Site): boolean {
  const [key, value] = condition.split(":");
  switch (key) {
    case "tous":
      return true;
    case "classe":
      return site.classe !== null && site.classe !== "NC";
    case "categorie":
      return String(site.classe) === value;
    case "secteur":
      return site.sections.includes(value);
    case "rubrique":
      return site.rubriques.includes(value);
    case "etude":
      return value === "eie" ? site.etude === "eie_a" || site.etude === "eie_b" : site.etude === value;
    case "effectif":
      return (site.effectif ?? 0) >= (value ? Number(value) : 1);
    default:
      return site.flags.includes(condition);
  }
}

/** Why a text applies to the site (the conditions met, in words), or null when it does not. */
export function applies(when: string[] | undefined, site: Site): string[] | null {
  const reasons = new Set<string>();
  for (const alternative of when ?? []) {
    const parts = alternative.split("+");
    if (parts.every((p) => holds(p, site))) for (const p of parts) reasons.add(conditionLabel(p));
  }
  return reasons.size ? [...reasons] : null;
}
