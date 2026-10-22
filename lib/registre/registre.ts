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
import { isoDate, kindOf } from "../veille/jort";
import { type Amendment, fold } from "../veille/watch";
import { applies, derivedFlags, type Site } from "./profil";
import { keysOf, namedKeys, proposals, type Texte } from "./referentiel";

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
  garde?: boolean; // kept although it no longer applies to the profile
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

/** A register of the same establishment, by name (case and accents aside). */
export function sameName(list: Registre[], nom: string): Registre | undefined {
  const n = fold(nom);
  return n ? list.find((r) => fold(r.nom) === n) : undefined;
}

/**
 * The register after its establishment's classification changed: category, rubriques, study and
 * sectors follow the new classification; workforce and the facts ticked by hand are kept, the facts
 * implied by new rubriques are added and those implied by rubriques gone are dropped. The texts that now apply come as new texts
 * (nouveautes), those that no longer do are flagged (plusApplicables).
 */
export function updateFromReport(reg: Registre, report: ClassificationReport, now = new Date()): Registre {
  const fresh = siteFromReport(report, reg.site.effectif, []);
  const before = derivedFlags(reg.site.sections);
  const after = derivedFlags(fresh.sections);
  // Facts implied by rubriques gone are dropped, those of new rubriques added; the rest is kept.
  const dropped = new Set(before.filter((f) => !after.includes(f)));
  const flags = [...new Set([...reg.site.flags.filter((f) => !dropped.has(f)), ...after.filter((f) => !before.includes(f))])];
  return {
    ...reg,
    nom: report.name || reg.nom,
    maj: now.toISOString(),
    classe: report.establishment.classe,
    etude: report.environment.study?.kind ?? null,
    situation: report.situation,
    activites: report.activities.map((a) => ({ code: a.rubrique.code, categorie: a.category })),
    restauration: report.restorationPath,
    site: { ...fresh, flags },
  };
}

/** Texts kept in the register that no longer apply to the site, unless kept on purpose or added by hand. */
export function plusApplicables(reg: Registre): Ligne[] {
  return reg.lignes.filter((l) => l.retenu && l.origine !== "ajoute" && !l.garde && !applies(l.texte.when, reg.site));
}

/** The JORT text that modifies a text of the register, as a text to add to it. */
export function texteFromAmendment(a: Amendment, modified: Texte, texts: Texte[]): Texte {
  const own = namedKeys(a.title)[0];
  const known = own ? texts.find((t) => keysOf(t).includes(own)) : undefined;
  if (known) return known;
  return {
    id: `jort-${a.id}`,
    type: kindOf(a.title) === "Autre" ? "Texte" : kindOf(a.title),
    numero: /n°\s*(\d{2,4}-\s?\d{1,5})/i.exec(a.title)?.[1].replace(/\s/g, ""),
    date: isoDate(a.title) ?? undefined,
    titre: a.title,
    domaine: modified.domaine,
    theme: modified.theme,
    when: modified.when,
    source: a.pdf,
    publie: `JORT n° ${a.issue}/${a.year}, p. ${a.page}`,
    origine: "jort",
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

/**
 * JORT texts that modify a text kept in the register, published since the register was created
 * and not yet taken into account. Those published before are the text's history (modifiePar), not
 * news: with decades of JORT read, every old text has some.
 */
export function alertes(reg: Registre, amendments: Amendment[]): Alerte[] {
  const since = reg.cree.slice(0, 10);
  return reg.lignes.flatMap((l) => {
    if (!l.retenu) return [];
    const keys = new Set(keysOf(l.texte));
    return amendments
      .filter((a) => !l.vus.includes(a.id) && (a.date ?? since) >= since && a.cites.some((k) => keys.has(k)))
      .map((amendment) => ({ ligne: l, amendment }));
  });
}

/** The JORT texts that modified a text before the register was created, newest first. */
export function modifiePar(reg: Registre, l: Ligne, amendments: Amendment[]): Amendment[] {
  const since = reg.cree.slice(0, 10);
  const keys = new Set(keysOf(l.texte));
  return amendments.filter((a) => (a.date ?? since) < since && a.cites.some((k) => keys.has(k)));
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
/** Sent on window when the registers are saved: what counts them (the menu's badge) counts again. */
export const CHANGED = "abclassement-registres";

/**
 * What calls for attention in every register: texts modified at the JORT, and evaluations late or
 * due within 30 days. Texts never evaluated are the register's first work, not a reminder: they
 * are left out.
 */
export function aTraiter(list: Registre[], amendments: Amendment[], today = new Date()): number {
  const late = (r: Registre) => dues(r, today).filter((l) => prochaine(l, today).etat !== "a-evaluer").length;
  return list.reduce((n, r) => n + late(r) + alertes(r, amendments).length, 0);
}

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
    window.dispatchEvent(new Event(CHANGED));
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
