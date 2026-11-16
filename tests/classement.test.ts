import { describe, expect, it } from "vitest";
import { dupliquer, etatClassement, nouveauClassement, synthesePerimee, vide } from "@/lib/classement/classement";
import { createClassificationReport } from "@/lib/report";

describe("a classification kept", () => {
  const now = new Date("2026-11-16T09:00:00Z");

  it("starts empty, a draft", () => {
    const c = nouveauClassement(now);
    expect(vide(c)).toBe(true);
    expect(etatClassement(c)).toMatchObject({ classe: null, statut: "brouillon" });
  });

  it("follows its activities, and its synthesis until the dossier changes", () => {
    const c = nouveauClassement(now, { nom: "Laiterie", activites: [{ code: "1214", quantity: "50000", eie: "none" }] });
    expect(etatClassement(c).classe).not.toBeNull();
    const r = createClassificationReport(c.activites, c.situation, c.sensible, c.nom);
    expect(r.ok).toBe(true);
    const validated = { ...c, synthese: r.ok ? r.report : null };
    expect(etatClassement(validated).statut).toBe("valide");
    const changed = { ...validated, activites: [{ ...validated.activites[0]!, quantity: "100" }] };
    expect(synthesePerimee(changed)).toBe(true);
    expect(etatClassement(changed).statut).toBe("a-revalider");
  });

  it("is copied without its synthesis nor its register", () => {
    const c = { ...nouveauClassement(now, { nom: "Site A", activites: [{ code: "1214" }] }), registre: "reg-1" };
    const d = dupliquer(c, now);
    expect(d).toMatchObject({ nom: "Site A (copie)", synthese: null, registre: null });
    expect(d.id).not.toBe(c.id);
    expect(d.activites).toEqual(c.activites);
  });
});
