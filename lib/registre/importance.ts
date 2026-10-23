/**
 * How important a text is for a given site: the order of its register, most important first, with
 * the reasons shown to the consultant. Nothing here is particular to a sector: every signal comes
 * from the text (its kind, domain, wording, how often later texts cite it, whether it is in force)
 * and from the site's own profile (its activities, category, study, workforce and facts), so the
 * ranking follows any establishment the app classifies.
 *
 * Points, out of about 100:
 *   - a text the app is built on (nomenclature, procedures, impact study): 40; curated: 20 (4 for
 *     taxes and finance, only suggested);
 *   - on one of the site's activities (an act-* rule whose conditions hold): 25;
 *     through one of its facts, rubriques, category or study (hydrocarbons, discharges, 1st
 *     category…): 16, 5 when it is only beside the process (vehicles, transport, trade);
 *     conditions every site or employer meets (all, classified, workforce): 0;
 *   - cited by later JORT titles: up to 20 (6 × log2(1 + n)), less than an activity: a law
 *     everyone cites does not come before the texts on what the site does;
 *   - kind: code 20, law 14, décret-loi 12, décret 9, arrêté 5, circulaire or décision 3;
 *   - domain, as a QSE register weighs it: établissements classés 12 … finance 0, road −4;
 *   - wording: general rules ("fixant les règles", "relatif à la prévention"…) +5; a body's
 *     composition or organisation, a creation, a ratification, a temporary measure −6; a text
 *     that only modifies another −8;
 *   - recent: +4 since 2015, +2 since 2000.
 */
import { applies, conditionLabel, type Site } from "./profil";
import { keysOf, type Texte } from "./referentiel";
import { fold, rules } from "../veille/watch";

export interface Importance {
  score: number;
  raisons: string[]; // the main ones, most weighty first ("cité par 14 textes", "votre activité")
}

const KIND: [RegExp, number, string][] = [
  [/^loi/, 14, "loi"],
  [/^decret-loi|^decrets?-lois?/, 12, "décret-loi"],
  [/^decret/, 9, "décret"],
  [/^arrete/, 5, "arrêté"],
  [/^(circulaire|decision)/, 3, ""],
];
// A law that brings in a code (the labour code, the water code…), not a text that cites one.
const CODE = /^(?:loi|decret-loi)\b[^,]{0,80},? portant (?:promulgation|approbation|refonte) du code\b/;

const DOMAIN: Record<string, number> = {
  "etablissements-classes": 12,
  environnement: 10,
  sst: 10,
  incendie: 9,
  "produits-dangereux": 9,
  hygiene: 7,
  secteurs: 6,
  travail: 6,
  route: -4, // reached only through the site's vehicles
  finance: 0,
};

// The texts the app itself is built on: the nomenclature and its amendments, the procedures for
// classified establishments, the impact study.
const BASE = new Set(["d:arrete:2005-11-15", "d:arrete:2010-02-23", "d:arrete:2012-10-24", "n:decret:2006-2687", "n:decret:2005-1991"]);
const SUGGESTED = new Set(rules.registre.suggere ?? []);

const GENERAL = /\b(fixant les (?:regles|conditions|normes|valeurs limites|prescriptions|mesures|modalites)|relatif a la (?:prevention|protection|securite|gestion|lutte|reglementation)|portant reglementation|reglementant|obligations?|cahier des charges|valeurs limites)\b/;
const ONE_OFF = /\b(composition|attributions|organisation administrative|portant (?:re)?organisation|reorganisation|portant creation|creation d'un|designation|delimitation|perimetre|campagne|approbation du plan|liste des (?:membres|agents)|exceptionnel(?:le)?|provisoire|autorisant l'etat|ratifiant|portant ratification|adhesion|adherer)\b/;
const MODIFIES = /\b(modifiant|completant|portant modification|abrogeant|prorogeant|rectificatif)\b/;
// Conditions every site, or every employer, meets: they say nothing of this site in particular.
const GENERIC = (c: string) => c === "tous" || c === "classe" || c === "effectif" || c.startsWith("effectif:");
// What the site has beside its process (vehicles, transport, trade): it counts, less than what it
// makes, discharges or stores.
const SIDE = new Set(["vehicules", "transport-marchandises", "transport-personnel", "import-export", "commerce"]);

export function importance(t: Texte, site: Site): Importance {
  const parts: [number, string][] = [];
  const add = (points: number, raison = "") => parts.push([points, raison]);
  const title = fold(t.titre);

  if (t.niveau === "critique" || keysOf(t).some((k) => BASE.has(k))) add(40, "texte de base de l’application");
  else if (t.origine === "referentiel") add(SUGGESTED.has(t.domaine) ? 4 : 20, "texte du référentiel");

  const activity = applies(t.activites, site);
  if (t.activites?.length && activity) add(25, `votre activité : ${t.theme}`);
  else {
    const specific = (t.when ?? []).filter((c) => !GENERIC(c) && applies([c], site));
    const core = specific.find((c) => !SIDE.has(c));
    if (specific.length) add(core ? 16 : 5, `votre site : ${conditionLabel(core ?? specific[0]).toLowerCase()}`);
  }

  if (t.cite) add(Math.min(20, Math.round(6 * Math.log2(1 + t.cite))), t.cite >= 3 ? `cité par ${t.cite} textes` : "");

  const kind = KIND.find(([re]) => re.test(fold(t.type)) || re.test(title));
  if (CODE.test(title)) add(20, "code");
  else if (kind) add(kind[1], kind[2]);
  add(DOMAIN[t.domaine] ?? 4);

  if (MODIFIES.test(title)) add(-8);
  else if (GENERAL.test(title)) add(5, "règles générales");
  if (ONE_OFF.test(title)) add(-6);

  const year = Number((t.date ?? "").slice(0, 4));
  if (year >= 2015) add(4, "récent");
  else if (year >= 2000) add(2);

  const score = Math.max(0, parts.reduce((n, [p]) => n + p, 0));
  const raisons = parts
    .filter(([p, r]) => p > 0 && r)
    .sort((a, b) => b[0] - a[0])
    .map(([, r]) => r);
  return { score, raisons };
}
