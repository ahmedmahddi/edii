import { describe, expect, it } from "vitest";
import { rapportConformite } from "@/lib/registre/rapport";
import { evaluer, type Ligne, preuveTexte, type Registre } from "@/lib/registre/registre";

const today = new Date("2026-11-13T10:00:00Z");
const ligne = (id: string, domaine: string, patch: Partial<Ligne> = {}): Ligne =>
  ({ texte: { id, titre: `Texte ${id}`, type: "Décret", numero: `2000-${id}`, date: "2000-09-12", theme: "T", domaine, when: [] }, retenu: true, origine: "propose", raisons: [], conformite: "", resume: "", risque: "", plan: "", responsable: "", echeance: "", frequence: "Annuelle", evalue: "", vus: [], ...patch }) as never;
const at = (iso: string) => new Date(iso);

describe("the compliance report", () => {
  const a = evaluer(ligne("1", "securite"), { conformite: "C", date: "2026-10-01", preuves: [preuveTexte("Contrat", "n° 14")] }, at("2026-10-01T09:00:00Z"));
  const nc = evaluer(ligne("2", "securite"), { conformite: "NC", date: "2026-09-01", commentaire: "Registre absent", action: { plan: "Ouvrir le registre", responsable: "M. R", echeance: "2026-10-15" } }, at("2026-09-01T09:00:00Z"));
  const fixed = evaluer(evaluer(ligne("3", "environnement"), { conformite: "NC", date: "2026-03-01" }, at("2026-03-01T09:00:00Z")), { conformite: "C", date: "2026-06-01" }, at("2026-06-01T09:00:00Z"));
  const late = ligne("4", "environnement", { conformite: "C", evalue: "2025-10-01" });
  const reg: Registre = { id: "r", nom: "Usine", cree: "2025-01-01", maj: "2026-11-01", classe: null, etude: null, situation: "existant", activites: [], restauration: null, site: {} as never, lignes: [a, nc, fixed, late, ligne("5", "securite"), ligne("6", "securite", { retenu: false })], ecartes: [] };
  const r = rapportConformite(reg, [], [], today);

  it("sums up the register", () => {
    expect(r.totaux).toMatchObject({ applicables: 5, evalues: 4, C: 3, NC: 1, NA: 0, aEvaluer: 1, enRetard: 1, taux: 75, progression: 80 });
    expect(r.depuis).toBe("2025-11-13");
  });

  it("lists the non-conformities with their action, overdue first", () => {
    expect(r.nonConformites).toEqual([
      expect.objectContaining({ titre: "Texte 2", constat: "Registre absent", action: "Ouvrir le registre", responsable: "M. R", echeance: "2026-10-15", etat: "en-retard", depuis: "2026-09-01", ref: "Décret n° 2000-2 du 12/09/2000" }),
    ]);
  });

  it("counts the actions done and the evaluations of the period, by domain", () => {
    expect(r.actionsRealisees.map((x) => [x.titre, x.date])).toEqual([["Texte 3", "2026-06-01"]]);
    expect(r.evaluationsPeriode).toBe(4);
    expect(r.domaines.find((d) => d.domaine === "securite")).toMatchObject({ total: 3, C: 1, NC: 1, aEvaluer: 1, taux: 50 });
    expect(r.aVenir.map((x) => [x.titre, x.etat])).toEqual([["Texte 4", "en-retard"]]);
    expect(r.textes.find((t) => t.titre === "Texte 1")!.preuves).toEqual(["Contrat : n° 14"]);
  });

  it("takes a period", () => {
    expect(rapportConformite(reg, [], [], today, "2026-08-01").evaluationsPeriode).toBe(2);
    expect(rapportConformite(reg, [], [], today, "2026-08-01").actionsRealisees).toEqual([]);
  });
});
