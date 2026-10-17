/**
 * Export of veille hits as rows of a QSE "registre de veille légale et réglementaire" (the
 * ID-QSE-002 layout: Système, Domaine, Type, Réf, Titre, Résumé exigence, Conformité, Fréquence
 * d'évaluation, Risque, Plan d'action en cas de NC, Responsable et échéance), so that the texts
 * found can be pasted into an existing register. What only a reader can write (the summary of the
 * requirement, conformity, risk, action plan) is left to fill.
 */
import type ExcelJS from "exceljs";
import { isoDate } from "./jort";
import { type Hit, rules } from "./watch";

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
  frequence: string;
  url: string;
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

export function registerRow(hit: Hit): RegisterRow {
  // "HSST & Environnement" and "Environnement" make "HSST & Environnement", not the name twice.
  const systems = [...new Set(hit.domains.flatMap((d) => (rules.registre.systemes[d] ?? rules.domains[d] ?? d).split(" & ")))];
  // The register names one domain: the first rule matched, references aside.
  const ruleLabels = hit.matches.filter((m) => !m.rule.startsWith("ref-")).map((m) => m.label);
  const source = `JORT n° ${hit.issue}/${hit.year}${hit.date ? ` du ${dmy(hit.date)}` : ""}, p. ${hit.page}`;
  return {
    systeme: systems.join(" & "),
    domaine: ruleLabels[0] ?? hit.matches[0]?.label ?? "",
    type: hit.kind === "Autre" ? "" : hit.kind,
    ref: reference(hit),
    titre: hit.title,
    resume: `À compléter après lecture du texte. Source : ${source}.`,
    frequence: rules.registre.frequence,
    url: hit.pdf,
  };
}

/** The register sheet, laid out like ID-QSE-002, with one row per hit. */
export function fillRegister(workbook: ExcelJS.Workbook, hits: Hit[], today: Date): void {
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

  for (const hit of hits) {
    const r = registerRow(hit);
    const row = ws.addRow([r.systeme, r.domaine, r.type, r.ref, { text: r.titre, hyperlink: r.url }, r.resume, "", r.frequence, "", "", ""]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = col === 5 ? { ...font, color: { argb: "FF1F4E79" }, underline: true } : font;
      cell.alignment = col === 5 || col === 6 ? { ...center, horizontal: "left" } : center;
      cell.border = border;
    });
  }
  ws.autoFilter = { from: "A3", to: `K${Math.max(3, ws.rowCount)}` };
}
