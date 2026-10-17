// From a classification to the establishment's register: the texts that apply and why, the JORT
// texts that modify them, and the evaluations due.
import { describe, expect, it } from "vitest";
import { applies, derivedFlags, type Site } from "@/lib/registre/profil";
import { amendments, catalogue, citedKeys, keysOf, namedKeys, proposals, REFERENTIEL, type Texte } from "@/lib/registre/referentiel";
import {
  addTexte,
  alertes,
  aTraiter,
  backup,
  createRegistre,
  dues,
  nouveautes,
  plusApplicables,
  prochaine,
  restore,
  sameName,
  siteFromReport,
  texteFromAmendment,
  updateFromReport,
} from "@/lib/registre/registre";
import { createClassificationReport } from "@/lib/report";
import { ligneRow } from "@/lib/veille/registre";
import { assess, type Hit, type Sommaires } from "@/lib/veille/watch";

const site = (patch: Partial<Site> = {}): Site => ({ classe: 2, sections: ["1200"], rubriques: ["1214"], etude: "eie_a", effectif: 40, flags: [], ...patch });

const LAIT = { code: "1214", variant: 0, quantity: "50000", eie: "A14" };
const GPL = { code: "2505", variant: 0, quantity: "50000", eie: "CDC11" };

function report(activities = [LAIT, GPL]) {
  const r = createClassificationReport(
    activities,
    "projet",
    false,
    "Laiterie du Cap Bon",
  );
  if (!r.ok) throw new Error(r.issues.join("; "));
  return r.report;
}

function hit(title: string, year = 2026, issue = 40, page = 900): Hit {
  return { id: `${year}-${issue}-${page}-0`, year, issue, date: `${year}-05-02`, pdf: `https://lake.jort.tn/journal-officiel/fr/${year}/0${issue}.pdf`, page, institution: null, kind: title.split(" ")[0], title, ...assess({ title })! };
}

describe("the site profile", () => {
  it("knows from the classification what it can, and ticks the facts the rubriques imply", () => {
    const s = siteFromReport(report());
    expect(s).toMatchObject({ classe: 2, sections: ["1200", "2500"], rubriques: ["1214", "2505"], etude: "eie_a", effectif: null });
    expect(s.flags).toEqual(["hydrocarbures", "denrees"]);
    expect(derivedFlags(["2600"])).toEqual(["rayonnements"]);
  });

  it("tells why a text applies, or that it does not", () => {
    expect(applies(["effectif"], site())).toEqual(["Personnel salarié"]);
    expect(applies(["effectif:50"], site())).toBeNull();
    expect(applies(["categorie:1", "secteur:1200"], site())).toEqual(["Secteur Agroalimentaire"]);
    expect(applies(["classe+vehicules"], site())).toBeNull();
    expect(applies(["classe+vehicules"], site({ flags: ["vehicules"] }))).toEqual(["Établissement classé", "Véhicules ou engins de l’entreprise"]);
    expect(applies(["etude:eie"], site())).toEqual(["Étude d’impact"]);
    expect(applies(["classe"], site({ classe: "NC" }))).toBeNull();
    expect(applies(undefined, site())).toBeNull();
  });
});

describe("the référentiel", () => {
  it("is seeded with curated texts, each with a kind, a domain and unique keys", () => {
    expect(REFERENTIEL.length).toBeGreaterThan(70);
    const keys = REFERENTIEL.flatMap(keysOf);
    expect(new Set(keys).size).toBe(keys.length);
    expect(REFERENTIEL.find((t) => t.numero === "2006-2687")).toMatchObject({ domaine: "etablissements-classes", when: ["classe"] });
  });

  it("knows a text by its number, or by its kind and date, and what a title modifies", () => {
    expect(namedKeys("Décret n° 2025-345 du 11 juillet 2025, modifiant le décret n° 2000-147 du 24 janvier 2000")).toEqual(["n:decret:2025-345", "n:decret:2000-147"]);
    expect(citedKeys("Arrêté du ministre des affaires sociales du 2 mai 2026, modifiant l'arrêté du 10 janvier 1995, fixant la liste des maladies professionnelles")).toEqual(["d:arrete:1995-01-10"]);
    expect(citedKeys("Décret n° 2026-144 du 20 juillet 2026, portant prorogation des délais d'application du décret n° 2013- 5183 du 18 novembre 2013")).toEqual(["n:decret:2013-5183"]);
    expect(citedKeys("Loi n° 2024-2 du 4 janvier 2024, modifiant la loi n° 96-41 du 10 juin 1996 relative aux déchets")).toEqual(["n:loi:96-41"]);
  });

  it("adds the texts the veille finds, unless already curated, with the conditions of the rule that found them", () => {
    const law = hit("Loi n° 2025-9 du 21 mai 2025, portant réglementation des contrats de travail et interdiction de la sous-traitance de main-d'œuvre", 2025, 61, 1210);
    const vehicles = hit("Décret n° 2025-345 du 11 juillet 2025, modifiant et complétant le décret n° 2000-147 du 24 janvier 2000, fixant les règles techniques d'équipement et d'aménagement des véhicules");
    const texts = catalogue([law, vehicles]);
    expect(texts.length).toBe(REFERENTIEL.length + 1);
    expect(texts.find((t) => t.numero === "2025-9")).toMatchObject({ origine: "referentiel", source: law.pdf, publie: "JORT n° 61/2025, p. 1210" });
    expect(texts.find((t) => t.numero === "2025-345")).toMatchObject({ origine: "jort", domaine: "route", when: ["vehicules"], niveau: "important" });
  });

  it("finds, in the sommaires read, the JORT texts that modify a text of the référentiel, and only those", () => {
    const entry = (title: string, page: number) => ({ institution: null, section: null, title, page, kind: "Arrêté", numbers: [] });
    const years: Sommaires[] = [
      {
        year: 2025,
        issues: {
          "115": {
            number: 115,
            date: "2025-09-23",
            firstPage: 2327,
            entries: [
              entry("Arrêté conjoint du ministre des affaires sociales et du ministre de la santé du 18 septembre 2025, modifiant et complétant l'arrêté du 10 janvier 1995, fixant la liste des maladies professionnelles", 2331),
              // same kind and date as a text of the référentiel, another subject: not it
              entry("Arrêté du ministre des affaires étrangères du 3 avril 2025, modifiant l’arrêté du 10 janvier 1995 fixant les modalités d'organisation du concours interne", 2340),
              entry("Arrêté du ministre de l'éducation du 2 avril 2025, modifiant l’arrêté du 12 mai 2024 relatif aux lycées pilotes", 2341),
            ],
          },
        },
      },
    ];
    const found = amendments(years, REFERENTIEL);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ cites: ["d:arrete:1995-01-10"], page: 2331, pdf: "https://lake.jort.tn/journal-officiel/fr/2025/115.pdf#page=5" });
  });
});

describe("an establishment's register", () => {
  const texts = catalogue([]);
  const now = new Date("2026-10-17T12:00:00");

  it("proposes the texts that apply, with why, and nothing for a fact the site does not have", () => {
    const reg = createRegistre(report(), site({ flags: ["vehicules"] }), texts, now);
    const ids = reg.lignes.filter((l) => l.retenu).map((l) => l.texte.id);
    expect(ids).toEqual(expect.arrayContaining(["decret-2006-2687", "arrete-2005-11-15", "decret-2005-1991", "loi-66-27", "loi-99-71", "arrete-1995-01-10"]));
    expect(ids).not.toContain("decret-62-129"); // appareils de levage: not ticked
    expect(ids).not.toContain("loi-2007-34"); // qualité de l'air: no emissions declared
    expect(reg.lignes.find((l) => l.texte.id === "loi-99-71")?.raisons).toEqual(["Véhicules ou engins de l’entreprise"]);
    expect(reg).toMatchObject({ nom: "Laiterie du Cap Bon", classe: 2, etude: "eie_a" });
  });

  it("brings the register's summary and risk from the référentiel, and exports with the evaluation", () => {
    const reg = createRegistre(report(), site(), texts, now);
    const l = reg.lignes.find((x) => x.texte.id === "decret-2006-2687")!;
    expect(l.resume.length).toBeGreaterThan(20);
    const row = ligneRow({ ...l, conformite: "NC", evalue: "2026-03-01", responsable: "R QSE", echeance: "2026-12-31", plan: "Mettre à jour l'étude de dangers" });
    expect(row).toMatchObject({ systeme: "HSST & Environnement", ref: "Décret n° 2006-2687 du 09-10-2006", conformite: "NC", responsable: "R QSE / 31-12-2026", plan: "Mettre à jour l'étude de dangers" });
    expect(row.frequence).toBe("Annuelle\nDernière évaluation : 01-03-2026.");
  });

  it("says when an evaluation is due", () => {
    const reg = createRegistre(report(), site(), texts, now);
    const l = reg.lignes[0];
    expect(prochaine(l, now)).toEqual({ date: null, etat: "a-evaluer" });
    expect(prochaine({ ...l, evalue: "2026-03-01" }, now)).toEqual({ date: "2027-03-01", etat: "a-jour" });
    expect(prochaine({ ...l, evalue: "2025-11-01" }, now)).toEqual({ date: "2026-11-01", etat: "bientot" });
    expect(prochaine({ ...l, evalue: "2025-06-01", frequence: "Semestrielle" }, now)).toEqual({ date: "2025-12-01", etat: "en-retard" });
    const evaluated = { ...reg, lignes: reg.lignes.map((x) => ({ ...x, evalue: "2026-10-01" })) };
    expect(dues(evaluated, now)).toEqual([]);
  });

  it("alerts when the JORT modifies one of its texts, until it is taken into account", () => {
    const reg = createRegistre(report(), site(), texts, now);
    const a = { id: "2025-115-2331-0", year: 2025, issue: 115, date: "2025-09-23", page: 2331, title: "Arrêté … modifiant l'arrêté du 10 janvier 1995", pdf: "x", cites: ["d:arrete:1995-01-10"] };
    expect(alertes(reg, [a]).map((x) => x.ligne.texte.id)).toEqual(["arrete-1995-01-10"]);
    const seen = { ...reg, lignes: reg.lignes.map((l) => (l.texte.id === "arrete-1995-01-10" ? { ...l, vus: [a.id] } : l)) };
    expect(alertes(seen, [a])).toEqual([]);
  });

  it("offers the new texts that apply, and takes a text added by hand", () => {
    const reg = createRegistre(report(), site(), texts, now);
    expect(nouveautes(reg, texts)).toEqual([]);
    const news = catalogue([hit("Décret n° 2026-120 du 2 mai 2026, relatif à la médecine du travail")]);
    expect(nouveautes(reg, news).map((p) => p.texte.numero)).toEqual(["2026-120"]);
    const levage = texts.find((t) => t.id === "decret-62-129") as Texte;
    const added = addTexte(reg, levage);
    expect(added.lignes.at(-1)).toMatchObject({ retenu: true, origine: "ajoute" });
    expect(proposals(texts, reg.site).length).toBeGreaterThan(40);
  });

  it("is saved to and restored from a backup file", () => {
    const reg = createRegistre(report(), site(), texts, now);
    expect(restore([], backup([reg]))).toEqual([reg]);
    expect(() => restore([], "{}")).toThrow(/sauvegarde/);
  });

  it("finds the register of the same establishment, whatever the case and accents", () => {
    const reg = createRegistre(report(), site(), texts, now);
    expect(sameName([reg], "  laiterie du cap bon")?.id).toBe(reg.id);
    expect(sameName([reg], "LAITERIE DU CAP BÔN")?.id).toBe(reg.id);
    expect(sameName([reg], "Autre usine")).toBeUndefined();
  });

  it("follows a changed classification, keeps the evaluations, and flags the texts that no longer apply", () => {
    const start = siteFromReport(report(), 40, ["vehicules", "hydrocarbures", "denrees"]);
    let reg = createRegistre(report(), start, catalogue([hit("Décret n° 2026-81, relatif au stockage des produits pétroliers")]), now);
    const petroleum = reg.lignes.find((l) => l.texte.numero === "2026-81")!;
    expect(petroleum.retenu).toBe(true);
    reg = { ...reg, lignes: reg.lignes.map((l) => (l.texte.id === "decret-2006-2687" ? { ...l, conformite: "C" as const, evalue: "2026-10-01" } : l)) };

    const updated = updateFromReport(reg, report([LAIT]), now);
    expect(updated.site).toMatchObject({ rubriques: ["1214"], sections: ["1200"], effectif: 40 });
    expect(updated.site.flags).toEqual(["vehicules", "denrees"]); // hydrocarbures came with 2505
    expect(updated.lignes.find((l) => l.texte.id === "decret-2006-2687")).toMatchObject({ conformite: "C", evalue: "2026-10-01" });
    expect(plusApplicables(updated).map((l) => l.texte.numero)).toEqual(["2026-81"]);
    const kept = { ...updated, lignes: updated.lignes.map((l) => (l.texte.numero === "2026-81" ? { ...l, garde: true } : l)) };
    expect(plusApplicables(kept)).toEqual([]);
  });

  it("adds the JORT text that modifies one of its texts", () => {
    const reg = createRegistre(report(), site(), texts, now);
    const list = reg.lignes.find((l) => l.texte.id === "arrete-1995-01-10")!.texte;
    const a = { id: "2025-115-2331-0", year: 2025, issue: 115, date: "2025-09-23", page: 2331, title: "Arrêté conjoint du ministre des affaires sociales et du ministre de la santé du 18 septembre 2025, modifiant et complétant l'arrêté du 10 janvier 1995, fixant la liste des maladies professionnelles", pdf: "https://lake.jort.tn/x.pdf#page=5", cites: ["d:arrete:1995-01-10"] };
    const t = texteFromAmendment(a, list, texts);
    expect(t).toMatchObject({ type: "Arrêté", date: "2025-09-18", domaine: "sst", when: ["effectif"], source: a.pdf, publie: "JORT n° 115/2025, p. 2331" });
    expect(addTexte(reg, t).lignes.at(-1)).toMatchObject({ retenu: true, origine: "ajoute" });
  });

  it("counts, for the menu, the modified texts and the late evaluations, not the texts never evaluated", () => {
    const reg = createRegistre(report(), site(), texts, now);
    const a = { id: "x", year: 2025, issue: 1, date: null, page: 1, title: "", pdf: "", cites: ["d:arrete:1995-01-10"] };
    expect(aTraiter([reg], [], now)).toBe(0);
    expect(aTraiter([reg], [a], now)).toBe(1);
    const late = { ...reg, lignes: reg.lignes.map((l, i) => (i < 3 ? { ...l, evalue: "2024-01-01" } : l)) };
    expect(aTraiter([late], [], now)).toBe(3);
  });
});
