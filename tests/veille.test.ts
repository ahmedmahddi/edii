// Veille réglementaire: reading JORT sommaires and picking the texts that concern the app.
// The two issues are real ones, kept in data/sources: JORT n° 83 of 2006 and n° 18 of 2010.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type Issue, isoDate, kindOf, parseIssue, pdfPage, pdfUrl } from "@/lib/veille/jort";
import { pdfLines, toLines } from "@/lib/veille/pdf";
import { assess, type Feed, hitsOf, reassess, record, subject } from "@/lib/veille/watch";

const source = (f: string) => new Uint8Array(readFileSync(path.join(__dirname, "..", "data", "sources", f)));
let jort2006: Issue;
let jort2010: Issue;

beforeAll(async () => {
  jort2006 = parseIssue(await pdfLines(source("2006-10-09-decret-2006-2687.pdf"), 8));
  jort2010 = parseIssue(await pdfLines(source("2010-02-23-arrete-modificatif.pdf"), 8));
});

describe("reading a JORT sommaire", () => {
  it("reads the issue number, date and first page", () => {
    expect([jort2006.number, jort2006.date, jort2006.firstPage]).toEqual([83, "2006-10-17", 3585]);
    expect([jort2010.number, jort2010.date, jort2010.firstPage]).toEqual([18, "2010-03-02", 553]);
  });

  it("lists every text of the sommaire, with its institution, kind and page", () => {
    expect(jort2006.entries).toHaveLength(14);
    expect(jort2010.entries).toHaveLength(29);
    const decree = jort2006.entries.find((e) => e.numbers.includes("2006-2687"))!;
    expect(decree).toMatchObject({
      page: 3591,
      kind: "Décret",
      institution: "Ministère de l'Industrie, de l'Energie et des Petites et Moyennes Entreprises",
    });
    expect(decree.title).toMatch(/^Décret n° 2006-2687 du 9 octobre 2006, relatif aux procédures .* établissements dangereux, insalubres ou incommodes$/);
  });

  it("joins a title printed over several lines, and an institution over two", () => {
    const female = jort2006.entries.find((e) => e.page === 3595 && e.kind === "Arrêté" && /femme/i.test(e.title))!;
    expect(female.institution).toBe("Ministère des Affaires de la Femme, de la Famille, de l'Enfance et des Personnes Agées");
    expect(female.title).toMatch(/classification des documents spécifiques au services centraux du ministère$/);
  });

  it("puts back page numbers that the PDF splits into overlapping pieces", () => {
    const line = toLines([
      { str: "médecine ......", x: 128, y: 644, width: 300 },
      { str: "3", x: 471, y: 644.5, width: 5 },
      { str: "5 5", x: 476, y: 644.5, width: 16 },
      { str: "9", x: 482, y: 644.5, width: 5 },
    ]);
    expect(line[0].text).toMatch(/3595$/);
  });

  it("knows an institution heading by its words when it is not less indented (JORT 2026 n° 2)", () => {
    const lines = [
      { x: 60, y: 700, text: "Sommaire" },
      { x: 40, y: 680, text: "Ministère de l'Emploi et de la Formation Professionnelle" },
      { x: 60, y: 665, text: "Nomination d'un chef de service ............................ 29" },
      { x: 120, y: 650, text: "Instance Supérieure Indépendante pour les Elections" },
      { x: 60, y: 635, text: "Décision de l'Instance supérieure indépendante pour les élections n° 2026-1" },
      { x: 60, y: 620, text: "du 5 janvier 2026, portant déclaration des résultats ................... 30" },
    ];
    const [, isie] = parseIssue([lines]).entries;
    expect(isie).toMatchObject({ institution: "Instance Supérieure Indépendante pour les Elections", kind: "Décision", page: 30 });
    expect(isie.title).toMatch(/^Décision de l'Instance .* portant déclaration des résultats$/);
  });

  it("knows dates, kinds of text and where an issue is published", () => {
    expect(isoDate("Mardi 16 rabia I 1431 – 2 mars 2010")).toBe("2010-03-02");
    expect(isoDate("1er juillet 1991")).toBe("1991-07-01");
    expect(kindOf("Arrêtés du ministre du tourisme")).toBe("Arrêté");
    expect(kindOf("Décret-loi n° 2011-115")).toBe("Décret-loi");
    expect(kindOf("Liste de promotion")).toBe("Autre");
    expect(pdfUrl(2025, 92)).toBe("https://lake.jort.tn/journal-officiel/fr/2025/092.pdf");
    expect(pdfPage({ firstPage: 553 }, 559)).toBe(7);
    expect(pdfPage({ firstPage: null }, 559)).toBeNull();
  });
});

describe("picking the texts that concern the app", () => {
  it("finds, in two real issues, exactly the texts on the domains followed", () => {
    const h2006 = hitsOf(2006, jort2006);
    const h2010 = hitsOf(2010, jort2010);
    expect(h2006.map((h) => [h.page, h.severity])).toEqual([[3591, "critique"]]);
    expect(h2010.map((h) => [h.page, h.severity])).toEqual([
      [557, "information"], // convention sur la sûreté nucléaire
      [558, "information"], // statut de l'Agence internationale de l'énergie atomique
      [559, "critique"], // the arrêté amending the nomenclature
    ]);
    expect(h2010[2]).toMatchObject({
      pdf: "https://lake.jort.tn/journal-officiel/fr/2010/018.pdf#page=7",
      domains: ["etablissements-classes"],
      impacts: expect.arrayContaining(["nomenclature", "addition"]),
    });
    expect(h2010[0]).toMatchObject({ domains: ["produits-dangereux"], sectors: ["2600"] });
  });

  it("marks as critique a text that cites a text the app is built on", () => {
    expect(assess({ title: "Arrêté du ministre de l'industrie du 3 mars 2026, modifiant l'arrêté du 15 novembre 2005 fixant la nomenclature des établissements dangereux, insalubres ou incommodes" })?.severity).toBe("critique");
    expect(assess({ title: "Décret n° 2026-100 du 2 février 2026, modifiant le décret n° 2005-1991 du 11 juillet 2005" })).toMatchObject({ severity: "critique", impacts: ["etude"] });
  });

  it("follows santé et sécurité au travail, hygiène and sécurité incendie", () => {
    expect(assess({ title: "Décret n° 2026-40 du 12 janvier 2026, relatif à la médecine du travail" })).toMatchObject({ severity: "important", domains: ["sst"] });
    expect(assess({ title: "Arrêté du ministre des affaires sociales du 2 mai 2026, fixant la liste des maladies professionnelles" })?.domains).toEqual(["sst"]);
    expect(assess({ title: "Arrêté du 5 juin 2026, relatif aux équipements de protection individuelle" })?.domains).toEqual(["sst"]);
    expect(assess({ title: "Arrêté du ministre de la santé du 1er juin 2026, fixant les règles d'hygiène applicables aux établissements de restauration" })).toMatchObject({ severity: "important", domains: ["hygiene"] });
    expect(assess({ title: "Décret n° 2026-55, relatif à la prévention des incendies dans les établissements industriels" })?.domains).toEqual(["incendie"]);
  });

  it("follows the environment and the sectors of the nomenclature", () => {
    expect(assess({ title: "Arrêté du 4 avril 2026, fixant les valeurs limites des rejets d'effluents dans le milieu hydrique" })).toMatchObject({ severity: "important", domains: ["environnement"] });
    expect(assess({ title: "Décret n° 2026-70, relatif à la gestion des déchets d'emballages" })).toMatchObject({ domains: ["environnement"], sectors: ["1500"] });
    expect(assess({ title: "Arrêté du 9 mars 2026, portant approbation du cahier des charges relatif à l'exploitation des carrières" })).toMatchObject({ severity: "information", sectors: ["1700"] });
    expect(assess({ title: "Décret n° 2026-80, relatif à l'organisation des élevages avicoles" })).toMatchObject({ severity: "information", sectors: ["1100"] });
    expect(assess({ title: "Décret n° 2026-81, relatif au stockage des produits pétroliers" })).toMatchObject({ severity: "important", sectors: ["2500"] });
  });

  it("flags, among the 102 texts of JORT 2026 n° 1 to 5, the four that concern establishments", () => {
    expect(assess({ title: "Arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime du 12 janvier 2026, modifiant et complétant l’arrêté du ministre de l'agriculture du 19 septembre 1998, fixant les modalités de contrôle sanitaire et de surveillance des conditions de production des produits de la pêche et de leur mise sur le marché" })).toMatchObject({ severity: "important", domains: ["hygiene", "secteurs"], sectors: ["1200"] });
    expect(assess({ title: "Arrêté conjoint de la ministre de l’industrie, des mines et de l’énergie, du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime et du ministre de l’équipement et de l’habitat du 31 décembre 2025, modifiant l’arrêté conjoint […] du 3 mai 2023 fixant les conditions et les critères du changement de vocation des terres agricoles sur lesquelles sont implantés des projets industriels" })).toMatchObject({ severity: "information", domains: ["etablissements-classes"] });
    expect(assess({ title: "Arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime du 31 décembre 2025, modifiant l’arrêté du ministre de l'agriculture et des ressources hydrauliques du 9 juillet 2005, portant approbation du cahier des charges types de la production animale selon le mode biologique" })).toMatchObject({ severity: "information", sectors: ["1100"] });
    expect(assess({ title: "Décret n° 2026-6 du 7 janvier 2026, relatif à l’approbation de la vente au dinar symbolique au profit de l’Agence foncière industrielle d’une parcelle de terre domaniale sise à la région de Bourbiaa dans la délégation de Mohammadia du gouvernorat de Ben Arous pour réaliser et aménager une zone industrielle" })?.severity).toBe("information");
    for (const title of [
      "Arrêté de la ministre des finances du 6 janvier 2026, complétant l’arrêté du 21 août 2023 relatif à la nomenclature des produits monopolisés et leurs prix",
      "Arrêté du ministre de l’agriculture, des ressources hydrauliques et de la pêche maritime du 9 janvier 2026, portant ouverture de la procédure de réaménagement foncier dans les périmètres publics irrigués situés au gouvernorat de Nabeul",
      "Arrêté de la Cheffe du Gouvernement du 13 janvier 2026, fixant la procédure d’obtention des informations relatives au bénéficiaire effectif des personnes morales et des constructions juridiques",
      "Arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime du 12 janvier 2026, modifiant l’arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche du 9 février 2016, fixant la durée de la période d'autorisation d'utilisation des semences et des produits de multiplication végétative non obtenus selon le mode de production biologique",
      "Arrêté du ministre des affaires sociales du 31 décembre 2025, fixant les modalités d’organisation du concours externe sur épreuves pour le recrutement de travailleurs sociaux conseillers du ministère des affaires sociales",
    ])
      expect(assess({ title }), title).toBeNull();
    expect(assess({ title: "Nomination d’un sous-directeur", institution: "Ministère de l’Environnement" })).toBeNull();
  });

  it("leaves out the issuer: a ministry's name is not a subject", () => {
    expect(subject("Arrêté de la ministre de l'industrie, des mines et de l'énergie du 3 mars 2026, fixant le calendrier")).toBe("fixant le calendrier");
    expect(subject("Arrêté conjoint du ministre de l'agriculture et du ministre de la santé du 1er juin 2025, relatif à l'hygiène")).toBe("relatif a l'hygiene");
    expect(assess({ title: "Arrêté de la ministre de l'industrie, des mines et de l'énergie du 3 mars 2026, relatif au statut des ingénieurs" })).toBeNull();
  });

  it("counts a text found by its institution alone as information", () => {
    expect(assess({ title: "Décret n° 2026-90, fixant les attributions du ministère", institution: "Ministère de l'Environnement" })?.severity).toBe("information");
  });

  it("ignores nominations, concours, prices, other cahiers des charges, and words that only contain a keyword", () => {
    expect(assess({ title: "Nomination d'un directeur à l'Agence nationale de protection de l'environnement" })).toBeNull();
    expect(assess({ title: "Arrêtés portant délégation de signature" })).toBeNull();
    expect(assess({ title: "Arrêté du 2 mars 2026, portant ouverture d'un concours interne pour le recrutement d'inspecteurs du travail" })).toBeNull();
    expect(assess({ title: "Arrêté du 2 mars 2026, fixant le prix de vente de l'huile d'olive" })).toBeNull();
    expect(assess({ title: "Arrêté portant approbation du cahier des charges relatif au transport par taxi" })).toBeNull();
    expect(assess({ title: "Arrêté relatif à la campanpe annuelle" })).toBeNull(); // contains "anpe", not the word
  });

  it("records each issue once, newest first, and applies edited rules again from stored sommaires", () => {
    let feed: Feed = { updated: null, scanned: {}, hits: [] };
    feed = record(feed, 2006, jort2006);
    feed = record(feed, 2010, jort2010);
    feed = record(feed, 2010, jort2010); // read again: replaced, not duplicated
    expect(feed.scanned).toEqual({ "2006": [83], "2010": [18] });
    expect(feed.hits.map((h) => h.year)).toEqual([2010, 2010, 2010, 2006]);
    const again = reassess({ ...feed, hits: [] }, [
      { year: 2006, issues: { "83": jort2006 } },
      { year: 2010, issues: { "18": jort2010 } },
    ]);
    expect(again.hits.map((h) => h.id)).toEqual(feed.hits.map((h) => h.id));
  });
});
