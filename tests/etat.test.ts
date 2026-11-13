import { describe, expect, it } from "vitest";
import { aJour, etatRegistre } from "@/lib/registre/etat";
import { EMPTY_SITE } from "@/lib/registre/profil";
import { REFERENTIEL } from "@/lib/registre/referentiel";
import { createRegistre, evaluer, type Registre } from "@/lib/registre/registre";

describe("where a register stands", () => {
  const now = new Date("2026-06-01T09:00:00Z");
  const base = createRegistre(null, { ...EMPTY_SITE, flags: ["vehicules"] }, REFERENTIEL, now, "Site");
  const ids = base.lignes.filter((l) => l.retenu).map((l) => l.texte.id);

  it("counts a new register as all to do", () => {
    const e = etatRegistre(base, [], [], now);
    expect(e.retenus).toBe(ids.length);
    expect(e.aFaire).toBe(ids.length);
    expect(e).toMatchObject({ evalues: 0, progress: 0, taux: null, retard: 0 });
    expect(aJour(e)).toBe(false);
  });

  it("follows evaluations: conforming, non conforming, late", () => {
    const on = (r: Registre, id: string, fn: Parameters<typeof evaluer>[1]): Registre => ({
      ...r,
      lignes: r.lignes.map((l) => (l.texte.id === id ? evaluer(l, fn) : l)),
    });
    let r = on(base, ids[0]!, { conformite: "C", date: "2026-05-20", commentaire: "", par: "", preuves: [] });
    r = on(r, ids[1]!, { conformite: "NC", date: "2026-05-20", commentaire: "", par: "", preuves: [], action: { risque: "", plan: "", responsable: "", echeance: "" } });
    r = on(r, ids[2]!, { conformite: "C", date: "2024-01-10", commentaire: "", par: "", preuves: [] });
    const e = etatRegistre(r, [], [], now);
    expect(e).toMatchObject({ evalues: 3, conformes: 2, nonConformes: 1, retard: 1, taux: 67 });
    expect(e.aFaire).toBe(ids.length - 3);
    expect(e.progress).toBe(Math.round((3 / ids.length) * 100));
  });
});
