/**
 * The register of one establishment: the texts that apply to it, each with its evaluation
 * (conformity, risk, action plan, who and when), built from its classification and site profile.
 *
 * From the référentiel and the JORT it tells:
 *   - the texts proposed when the register is created, and why;
 *   - the new texts that apply to the site, found since (to add or set aside);
 *   - the JORT texts that modify a text of the register;
 *   - the evaluations due, from the date of the last one and the frequency.
 * Registers are kept in this browser (localStorage); a backup file saves and restores them.
 */
import type { Classe } from "../classify";
import type { ClassificationReport } from "../report";
import type { Situation, StudyKind } from "../studies";
import type { Amendment } from "../veille/watch";
import { derivedFlags, type Site } from "./profil";
import { keysOf, proposals, type Texte } from "./referentiel";

export type Conformite = "" | "C" | "NC" | "NA";
export const CONFORMITES: Record<Conformite, string> = { "": "À évaluer", C: "Conforme", NC: "Non conforme", NA: "Non applicable" };

/** Months between two evaluations. */
export const FREQUENCES: Record<string, number> = { Mensuelle: 1, Trimestrielle: 3, Semestrielle: 6, Annuelle: 12, "Tous les deux ans": 24 };

export interface Ligne {
  texte: Texte; // as it was when added: the register keeps its texts if the référentiel changes
  retenu: boolean; // in the register; otherwise a suggestion left aside
  origine: "propose" | "suggere" | "ajoute";
  raisons: string[]; // why it applies
  conformite: Conformite;
  resume: string; // summary of the requirements
  risque: string;
  plan: string; // action plan when not conforming
  responsable: string;
  echeance: string; // ISO date
  frequence: string;
  evalue: string; // ISO date of the last evaluation, "" if never
  vus: string[]; // JORT modifications already taken into account
}

export interface Registre {
  id: string;
  nom: string;
  cree: string;
  maj: string;
  classe: Classe | null;
  etude: StudyKind | null;
  situation: Situation;
  activites: { code: string; categorie: Classe | null }[];
  restauration: string | null; // link back to the classification
  site: Site;
  lignes: Ligne[];
  ecartes: string[]; // ids of new texts set aside
}

const DEFAULT_FREQUENCE = "Annuelle";

/** What the classification says of the site; the consultant adds the rest. */
export function siteFromReport(report: ClassificationReport, effectif: number | null = null, flags?: string[]): Site {
  const sections = [...new Set(report.activities.map((a) => a.rubrique.section).filter((s): s is string => !!s))];
  return {
    classe: report.establishment.classe,
    sections,
    rubriques: [...new Set(report.activities.map((a) => a.rubrique.code))],
    etude: report.environment.study?.kind ?? null,
    effectif,
    flags: flags ?? derivedFlags(sections),
  };
}

function ligne(texte: Texte, raisons: string[], origine: Ligne["origine"], retenu: boolean): Ligne {
  return {
    texte,
    retenu,
    origine,
    raisons,
    conformite: "",
    resume: texte.resume ?? "",
    risque: texte.risque ?? "",
    plan: "",
    responsable: "",
    echeance: "",
    frequence: texte.frequence ?? DEFAULT_FREQUENCE,
    evalue: "",
    vus: [],
  };
}

export function createRegistre(report: ClassificationReport, site: Site, texts: Texte[], now = new Date()): Registre {
  const stamp = now.toISOString();
  return {
    id: `reg-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    nom: report.name || "Établissement sans nom",
    cree: stamp,
    maj: stamp,
    classe: report.establishment.classe,
    etude: report.environment.study?.kind ?? null,
    situation: report.situation,
    activites: report.activities.map((a) => ({ code: a.rubrique.code, categorie: a.category })),
    restauration: report.restorationPath,
    site,
    lignes: proposals(texts, site).map((p) => ligne(p.texte, p.reasons, p.proposed ? "propose" : "suggere", p.proposed)),
    ecartes: [],
  };
}

/** A text added by hand, from the référentiel or the JORT. */
export function addTexte(reg: Registre, texte: Texte): Registre {
  const existing = reg.lignes.find((l) => l.texte.id === texte.id);
  const lignes = existing
    ? reg.lignes.map((l) => (l === existing ? { ...l, retenu: true } : l))
    : [...reg.lignes, ligne(texte, ["Ajouté au registre"], "ajoute", true)];
  return { ...reg, lignes, ecartes: reg.ecartes.filter((id) => id !== texte.id) };
}

/** Texts that apply to the site and the register does not have yet (new JORT texts, a changed profile). */
export function nouveautes(reg: Registre, texts: Texte[]): ReturnType<typeof proposals> {
  const known = new Set([...reg.lignes.map((l) => l.texte.id), ...reg.ecartes]);
  const keys = new Set(reg.lignes.flatMap((l) => keysOf(l.texte)));
  return proposals(texts, reg.site).filter((p) => !known.has(p.texte.id) && !keysOf(p.texte).some((k) => keys.has(k)));
}

export interface Alerte {
  ligne: Ligne;
  amendment: Amendment;
}

/** JORT texts that modify a text kept in the register, not yet taken into account. */
export function alertes(reg: Registre, amendments: Amendment[]): Alerte[] {
  return reg.lignes.flatMap((l) => {
    if (!l.retenu) return [];
    const keys = new Set(keysOf(l.texte));
    return amendments.filter((a) => !l.vus.includes(a.id) && a.cites.some((k) => keys.has(k))).map((amendment) => ({ ligne: l, amendment }));
  });
}

const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

export type Etat = "a-evaluer" | "en-retard" | "bientot" | "a-jour";
export const ETATS: Record<Etat, string> = { "a-evaluer": "Jamais évalué", "en-retard": "Évaluation en retard", bientot: "À évaluer sous 30 jours", "a-jour": "À jour" };

/** When a text is next to be evaluated, and where that stands today. */
export function prochaine(l: Ligne, today = new Date()): { date: string | null; etat: Etat } {
  if (!l.evalue) return { date: null, etat: "a-evaluer" };
  const date = addMonths(l.evalue, FREQUENCES[l.frequence] ?? 12);
  const now = today.toISOString().slice(0, 10);
  const soon = addMonths(now, 1);
  return { date, etat: date < now ? "en-retard" : date <= soon ? "bientot" : "a-jour" };
}

/** The register's texts whose evaluation is due: never done, late, or within 30 days. */
export function dues(reg: Registre, today = new Date()): Ligne[] {
  return reg.lignes.filter((l) => l.retenu && prochaine(l, today).etat !== "a-jour");
}

// Kept in this browser. Reading may fail (private window, blocked storage): then nothing is kept.
const STORAGE = "abclassement-registres";

export function loadRegistres(): Registre[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRegistres(list: Registre[]): boolean {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** A backup file holds every register; restoring it adds or replaces registers by id. */
export function backup(list: Registre[]): string {
  return JSON.stringify({ app: "ABClassement", type: "registres", version: 1, saved: new Date().toISOString(), registres: list }, null, 1);
}

export function restore(current: Registre[], file: string): Registre[] {
  const data = JSON.parse(file);
  if (data?.type !== "registres" || !Array.isArray(data.registres)) throw new Error("Ce fichier n’est pas une sauvegarde des registres.");
  const byId = new Map(current.map((r) => [r.id, r]));
  for (const r of data.registres as Registre[]) byId.set(r.id, r);
  return [...byId.values()];
}
