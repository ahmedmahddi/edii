import { describe, expect, it } from "vitest";
import { mergeRegistre } from "@/lib/registre/merge";
import { evaluer, type Ligne, preuveTexte, type Registre } from "@/lib/registre/registre";

const ligne = (id: string): Ligne =>
  ({ texte: { id, titre: id, type: "Décret", theme: "T", domaine: "securite", when: [] }, retenu: true, origine: "propose", raisons: [], conformite: "", resume: "", risque: "", plan: "", responsable: "", echeance: "", frequence: "Annuelle", evalue: "", vus: [] }) as never;
const base: Registre = { id: "r", nom: "Usine", cree: "2026-01-01", maj: "2026-01-01T00:00:00Z", classe: null, etude: null, situation: "existant", activites: [], restauration: null, site: { effectif: 10 } as never, lignes: [ligne("a"), ligne("b"), ligne("c")], ecartes: [] };
const at = (iso: string) => new Date(iso);
const setLine = (r: Registre, id: string, fn: (l: Ligne) => Ligne): Registre => ({ ...r, lignes: r.lignes.map((l) => (l.texte.id === id ? fn(l) : l)) });

describe("two people on the same register", () => {
  it("keeps both people's work on different texts", () => {
    const mine = setLine(base, "a", (l) => evaluer(l, { conformite: "C", date: "2026-11-13", par: "Alice" }, at("2026-11-13T10:00:00Z")));
    const theirs = setLine(base, "b", (l) => evaluer(l, { conformite: "NC", date: "2026-11-13", par: "Bob", action: { plan: "Former", responsable: "Bob" } }, at("2026-11-13T10:01:00Z")));
    const m = mergeRegistre(base, mine, theirs);
    expect(m.lignes.find((l) => l.texte.id === "a")!.conformite).toBe("C");
    expect(m.lignes.find((l) => l.texte.id === "b")).toMatchObject({ conformite: "NC", plan: "Former", responsable: "Bob" });
  });

  it("on the same text, keeps every evaluation and evidence, and the latest result", () => {
    const mine = setLine(base, "a", (l) => evaluer(l, { conformite: "NC", date: "2026-11-13", par: "Alice", preuves: [preuveTexte("Photo", "atelier")] }, at("2026-11-13T10:00:00Z")));
    const theirs = setLine(base, "a", (l) => ({ ...evaluer(l, { conformite: "C", date: "2026-11-13", par: "Bob" }, at("2026-11-13T10:05:00Z")), responsable: "Bob" }));
    const m = mergeRegistre(base, mine, theirs).lignes.find((l) => l.texte.id === "a")!;
    expect(m.historique!.map((e) => e.par)).toEqual(["Alice", "Bob"]);
    expect(m.conformite).toBe("C"); // Bob evaluated last
    expect(m.responsable).toBe("Bob"); // changed on one side only
    expect(m.historique![0].preuves[0].texte).toBe("atelier");
  });

  it("keeps changes to different fields of the same text", () => {
    const mine = setLine(base, "c", (l) => ({ ...l, resume: "Résumé d'Alice" }));
    const theirs = setLine(base, "c", (l) => ({ ...l, echeance: "2026-12-01" }));
    expect(mergeRegistre(base, mine, theirs).lignes.find((l) => l.texte.id === "c")).toMatchObject({ resume: "Résumé d'Alice", echeance: "2026-12-01" });
  });

  it("keeps texts added on either side, the name changed on one, texts set aside on both", () => {
    const mine = { ...base, nom: "Usine de Sfax", lignes: [...base.lignes, ligne("x")], ecartes: ["n1"] };
    const theirs = { ...base, lignes: [...base.lignes, ligne("y")], ecartes: ["n2"] };
    const m = mergeRegistre(base, mine, theirs);
    expect(m.nom).toBe("Usine de Sfax");
    expect(m.lignes.map((l) => l.texte.id)).toEqual(["a", "b", "c", "y", "x"]);
    expect(m.ecartes.sort()).toEqual(["n1", "n2"]);
  });

  it("takes the other side when only it changed", () => {
    const theirs = { ...base, nom: "Renommé" };
    expect(mergeRegistre(base, base, theirs)).toBe(theirs);
    expect(mergeRegistre(base, theirs, base)).toBe(theirs);
  });
});
