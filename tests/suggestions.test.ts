import { describe, expect, it } from "vitest";
import { EMPTY_SITE } from "@/lib/registre/profil";
import { proposals, REFERENTIEL, type Texte } from "@/lib/registre/referentiel";
import { compacter, createRegistre, intacte, nouveautes, setLigne, suggestions } from "@/lib/registre/registre";

describe("suggestions are computed, not kept", () => {
  const site = { ...EMPTY_SITE, flags: ["vehicules"], effectif: 25 };
  const now = new Date("2026-06-01T09:00:00Z");
  // JORT texts that apply to every site, proposed only where a fact the site lacks is ticked.
  const jort: Texte[] = [1, 2, 3].map((i) => ({
    id: `jort-2026-10-${i}`,
    type: "Arrêté",
    titre: `Arrêté n° ${i} du 2 mars 2026, relatif aux impôts`,
    domaine: "finance",
    theme: "Impôts et taxes",
    when: ["tous"],
    coche: ["levage"],
    origine: "jort",
  }));
  const texts = [...REFERENTIEL, ...jort];
  const reg = createRegistre(null, site, texts, now, "Site");
  const all = proposals(texts, site);

  it("keeps only the proposed texts in a new register", () => {
    expect(reg.lignes.length).toBe(all.filter((p) => p.proposed).length);
    expect(reg.lignes.every((l) => l.retenu && l.origine === "propose")).toBe(true);
  });

  it("proposes the others as suggestions, and not as news", () => {
    const s = suggestions(reg, texts);
    expect(s.length).toBe(all.filter((p) => !p.proposed).length);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((l) => !l.retenu && l.origine === "suggere" && intacte(l))).toBe(true);
    expect(nouveautes(reg, texts)).toEqual([]);
  });

  it("makes a suggestion acted on a line of the register", () => {
    const s = suggestions(reg, texts)[0]!;
    const next = setLigne(reg, s, (l) => ({ ...l, retenu: true }));
    expect(next.lignes).toHaveLength(reg.lignes.length + 1);
    expect(suggestions(next, texts).some((l) => l.texte.id === s.texte.id)).toBe(false);
  });

  it("drops from a register of before the suggestions nobody touched, and keeps the others", () => {
    const [a, b] = suggestions(reg, texts);
    const before = { ...reg, lignes: [...reg.lignes, a!, { ...b!, responsable: "M. Rebaii" }] };
    const after = compacter(before);
    expect(after.lignes.map((l) => l.texte.id)).toEqual([...reg.lignes.map((l) => l.texte.id), b!.texte.id]);
    expect(compacter(reg)).toBe(reg);
  });
});
