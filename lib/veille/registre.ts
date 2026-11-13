/**
 * Export of veille hits as rows of a QSE "registre de veille légale et réglementaire" (the
 * ID-QSE-002 layout: Système, Domaine, Type, Réf, Titre, Résumé exigence, Conformité, Fréquence
 * d'évaluation, Risque, Plan d'action en cas de NC, Responsable et échéance), so that the texts
 * found can be pasted into an existing register. What only a reader can write (the summary of the
 * requirement, conformity, risk, action plan) is left to fill; an establishment's register
 * (lib/registre/registre.ts) is exported with its evaluation.
 */
import type ExcelJS from "exceljs";
import type { Ligne } from "../registre/registre";
import { isoDate } from "./jort";
import { type Amendment, type Hit, rules } from "./watch";

export const COLUMNS = [
  ["SYSTEME", 18],
  ["DOMAINE", 35],
  ["TYPE", 21],
  ["REF TYPE", 44],
  ["TITRE", 68],
  ["RESUME EXIGENCE", 85],
  ["CONFORMITE", 15],
  ["Fréquence d'évaluation", 21],
  ["RISQUE", 52],
  ["Plan d'action en cas de NC", 31],
  ["Responsable et échéance", 13],
] as const;

export interface RegisterRow {
  systeme: string;
  domaine: string;
  type: string;
  ref: string;
  titre: string;
  resume: string;
  conformite: string; // C, NC, Non applicable
  frequence: string;
  risque: string;
  plan: string;
  responsable: string; // and échéance
  url: string | undefined;
}

/** "2025-07-11" → "11-07-2025", as dates are written in the register. */
const dmy = (iso: string) => iso.split("-").reverse().join("-");

/** "Décret n° 2025-345 du 11-07-2025", "Arrêté du 12-01-2026". */
export function reference(hit: Pick<Hit, "kind" | "title">): string {
  const number = /n°\s*(\d{2,4}-\d{1,5})/i.exec(hit.title)?.[1];
  const date = isoDate(hit.title); // the first date of a title is the text's own
  const kind = hit.kind === "Autre" ? "" : hit.kind;
  return [kind, number ? `n° ${number}` : "", date ? `du ${dmy(date)}` : ""].filter(Boolean).join(" ") || hit.title;
}

/** The register's SYSTEME for domains of the veille. */
export function systeme(domains: string[]): string {
  // "HSST & Environnement" and "Environnement" make "HSST & Environnement", not the name twice.
  return [...new Set(domains.flatMap((d) => (rules.registre.systemes[d] ?? rules.domains[d] ?? d).split(" & ")))].join(" & ");
}

export function registerRow(hit: Hit): RegisterRow {
  // The register names one domain: the first rule matched, references aside.
  const ruleLabels = hit.matches.filter((m) => !m.rule.startsWith("ref-")).map((m) => m.label);
  const source = `JORT n° ${hit.issue}/${hit.year}${hit.date ? ` du ${dmy(hit.date)}` : ""}, p. ${hit.page}`;
  return {
    systeme: systeme(hit.domains),
    domaine: ruleLabels[0] ?? hit.matches[0]?.label ?? "",
    type: hit.kind === "Autre" ? "" : hit.kind,
    ref: reference(hit),
    titre: hit.title,
    resume: `À compléter après lecture du texte. Source : ${source}.`,
    conformite: "",
    frequence: rules.registre.frequence,
    risque: "",
    plan: "",
    responsable: "",
    url: hit.pdf,
  };
}

const CONFORMITE: Record<string, string> = { C: "C", NC: "NC", NA: "Non applicable" };

/** Where a text stands: repealed, overtaken, or modified since it was published. */
export interface Statut {
  abroge?: Amendment;
  remplacePar?: string;
  modifie?: Amendment[]; // oldest first
}

/** "Décret n° 2008-2565 du 07-07-2008": a JORT text named shortly, by its kind, number and date. */
export function shortRef(title: string): string {
  const kind = /^[^\p{L}]*(d[ée]cret-loi|d[ée]cret|arr[êe]t[ée]|loi|d[ée]cision|circulaire)s?(?!\p{L})/iu.exec(title)?.[1];
  const ref = reference({ kind: kind ? kind[0].toUpperCase() + kind.slice(1).toLowerCase() : "Autre", title });
  return ref === title ? (title.length > 90 ? `${title.slice(0, 89)}…` : title) : ref;
}

/** The lines the résumé column adds for a text's state: « Abrogé par … », « Modifié par … ». */
export function statutLines(s: Statut | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  if (s.abroge) out.push(`Abrogé par : ${shortRef(s.abroge.title)} (JORT n° ${s.abroge.issue}/${s.abroge.year}).`);
  if (s.remplacePar) out.push(`Remplacé par : ${s.remplacePar}.`);
  const m = s.modifie ?? [];
  if (m.length) {
    // The latest ones matter most: a register cell is not the place for a text's whole history.
    const shown = m.slice(-6).map((a) => shortRef(a.title));
    out.push(`Modifié par : ${m.length > 6 ? `${m.length - 6} textes antérieurs, puis ` : ""}${shown.join(" ; ")}.`);
  }
  return out;
}

/**
 * A line of an establishment's register, with its evaluation. What the consultant has not written
 * yet comes from the text's fiche (lib/veille/fiche.ts), when given.
 */
export function ligneRow(l: Ligne, fiche?: { resume: string; risque: string; plan: string }, statut?: Statut): RegisterRow {
  const t = l.texte;
  const ref = [t.type, t.numero ? `n° ${t.numero}` : "", t.date ? `du ${dmy(t.date)}` : ""].filter(Boolean).join(" ");
  const evaluated = l.evalue ? `Dernière évaluation : ${dmy(l.evalue)}.` : "";
  return {
    systeme: systeme([t.domaine]),
    domaine: t.theme,
    type: t.type,
    ref,
    titre: t.titre,
    resume: [l.resume || fiche?.resume, ...statutLines(statut), t.publie ? `Source : ${t.publie}.` : ""].filter(Boolean).join("\n"),
    conformite: CONFORMITE[l.conformite] ?? "",
    frequence: [l.frequence, evaluated].filter(Boolean).join("\n"),
    risque: l.risque || fiche?.risque || "",
    plan: l.plan || fiche?.plan || "",
    responsable: [l.responsable, l.echeance ? dmy(l.echeance) : ""].filter(Boolean).join(" / "),
    url: t.source,
  };
}

/** The register sheet, laid out like ID-QSE-002, with one row per text. */
export function fillRegister(workbook: ExcelJS.Workbook, rows: RegisterRow[], today: Date, establishment = ""): void {
  const ws = workbook.addWorksheet("Liste des textes applicables", {
    views: [{ state: "frozen", ySplit: 3, zoomScale: 80 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const date = today.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const font = { name: "Times New Roman", size: 10 };
  const thin = { style: "thin" as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };

  ws.columns = COLUMNS.map(([, width]) => ({ width }));
  ws.mergeCells("A1:B1");
  ws.mergeCells("C1:F1");
  ws.mergeCells("G1:K1");
  ws.mergeCells("A2:K2");
  ws.getCell("A1").value = establishment;
  ws.getCell("C1").value = "REGISTRE DE VEILLE LEGALE, REGLEMENTAIRE ET NORMATIVE";
  ws.getCell("G1").value = `Date : ${date}\nID-QSE-002`;
  ws.getCell("A2").value = `DATE DE MISE A JOUR  ${date}`;
  ws.getRow(1).height = 66;
  ws.getRow(2).height = 33;
  for (const ref of ["A1", "C1", "G1"]) Object.assign(ws.getCell(ref), { font: { ...font, bold: true }, alignment: center, border });
  Object.assign(ws.getCell("A2"), { font: { ...font, size: 18, bold: true }, alignment: center, border });

  const header = ws.getRow(3);
  COLUMNS.forEach(([label], i) => {
    Object.assign(header.getCell(i + 1), {
      value: label,
      font: { ...font, bold: true },
      alignment: center,
      border,
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCD5B4" } },
    });
  });

  for (const r of rows) {
    const titre = r.url ? { text: r.titre, hyperlink: r.url } : r.titre;
    const row = ws.addRow([r.systeme, r.domaine, r.type, r.ref, titre, r.resume, r.conformite, r.frequence, r.risque, r.plan, r.responsable]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = col === 5 && r.url ? { ...font, color: { argb: "FF1F4E79" }, underline: true } : font;
      cell.alignment = [5, 6, 9, 10].includes(col) ? { ...center, horizontal: "left" } : center;
      cell.border = border;
    });
  }
  ws.autoFilter = { from: "A3", to: `K${Math.max(3, ws.rowCount)}` };
}

/** One recorded evaluation, for the "Historique des évaluations" sheet. */
export interface HistoriqueRow {
  texte: string;
  ref: string;
  date: string; // ISO
  conformite: string;
  par: string;
  commentaire: string;
  preuves: string[];
}

export function historiqueRows(l: Ligne): HistoriqueRow[] {
  const ref = [l.texte.type, l.texte.numero ? `n° ${l.texte.numero}` : ""].filter(Boolean).join(" ");
  return (l.historique ?? []).map((e) => ({
    texte: l.texte.titre,
    ref,
    date: e.date,
    conformite: CONFORMITE[e.conformite] ?? "À évaluer",
    par: e.par,
    commentaire: e.commentaire,
    preuves: e.preuves.map((p) => (p.url ? `${p.nom} : ${p.url}` : p.texte ? `${p.nom} : ${p.texte}` : p.nom)),
  }));
}

/** A second sheet: every evaluation recorded, text by text, newest first: the audit trail. */
export function fillHistorique(workbook: ExcelJS.Workbook, rows: HistoriqueRow[]): void {
  const ws = workbook.addWorksheet("Historique des évaluations", { views: [{ state: "frozen", ySplit: 1 }] });
  const font = { name: "Times New Roman", size: 10 };
  const thin = { style: "thin" as const };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  ws.columns = [{ width: 14 }, { width: 60 }, { width: 24 }, { width: 16 }, { width: 24 }, { width: 50 }, { width: 50 }];
  const header = ws.addRow(["Date", "Texte", "Référence", "Conformité", "Évalué par", "Commentaire", "Preuves"]);
  header.eachCell((cell) => Object.assign(cell, { font: { ...font, bold: true }, border, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCD5B4" } } }));
  for (const r of [...rows].sort((a, b) => b.date.localeCompare(a.date))) {
    const row = ws.addRow([dmy(r.date), r.texte, r.ref, r.conformite, r.par, r.commentaire, r.preuves.join("\n")]);
    row.eachCell({ includeEmpty: true }, (cell) => Object.assign(cell, { font, border, alignment: { vertical: "top", wrapText: true } }));
  }
  ws.autoFilter = { from: "A1", to: `G${Math.max(1, ws.rowCount)}` };
}
