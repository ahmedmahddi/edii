// Veille réglementaire: reading JORT sommaires and picking the texts that concern the app.
// The two issues are real ones, kept in data/sources: JORT n° 83 of 2006 and n° 18 of 2010; the
// OCR texts are the first pages of real issues from ocr.jort.tn, kept in data/sources/ocr.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { INSTITUTION, type Issue, isoDate, kindOf, parseIssue, pdfPage, pdfUrl, TEXT_START } from "@/lib/veille/jort";
import { ocrUrl, parseMarkdown, parseMarkdownStart } from "@/lib/veille/markdown";
import { frenchCitations } from "@/lib/veille/arabe";
import { repealClauses } from "@/lib/veille/abrogation";
import { namedKeys } from "@/lib/registre/referentiel";
import { decodeGlyphs, isGlyphCoded } from "@/lib/veille/glyphs";
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

  it("does not take the first line of a law for an institution, though it is as far left", () => {
    const lines = [
      { x: 60, y: 700, text: "Sommaire" },
      { x: 40, y: 680, text: "Loi n° 2025-9 du 21 mai 2025, portant réglementation des contrats de travail et" },
      { x: 60, y: 665, text: "interdiction de la sous-traitance de main-d'œuvre ............................ 1210" },
      { x: 40, y: 650, text: "Présidence de la République" },
      { x: 60, y: 635, text: "Décret n° 2025-263 du 26 mai 2025, portant ratification ........................ 1215" },
    ];
    const [law, decree] = parseIssue([lines]).entries;
    expect(law).toMatchObject({ institution: null, kind: "Loi", page: 1210, numbers: ["2025-9"] });
    expect(law.title).toBe("Loi n° 2025-9 du 21 mai 2025, portant réglementation des contrats de travail et interdiction de la sous-traitance de main-d'œuvre");
    expect(decree.institution).toBe("Présidence de la République");
  });

  it("reads the fonts of 2000-2005 that write glyph numbers instead of letters", () => {
    expect(isGlyphCoded("6RPPDLUH\u0003")).toBe(true);
    expect(isGlyphCoded("Sommaire")).toBe(false);
    expect(decodeGlyphs("6RPPDLUH\u0003")).toBe("Sommaire ");
    expect(decodeGlyphs("'pFUHWV\u0003HW\u0003$UUrWpV")).toBe("Décrets et Arrêtés");
    expect(decodeGlyphs("75$'8&7,21\u0003)5$1d$,6(")).toBe("TRADUCTION FRANÇAISE");
    expect(decodeGlyphs("'pFUHW\u0003QÉ\u0003\u001c\u001c\u0010\u0015\u001b\u0015\u0018")).toBe("Décret n° 99-2825");
    expect(decodeGlyphs("0LQLVWqUH\u0003GH\u0003O $JULFXOWXUH")).toBe("Ministère de l'Agriculture");
    expect(decodeGlyphs("FUpDWLRQ\u0003G pWDEOLVVHPHQWV\u0011\u0011\u0011\u0003 \u0014\u0013")).toBe("création d'établissements...  10");
  });

  it("puts a page number printed a little lower back on its title's line", () => {
    const lines = toLines([
      { str: "Nomination de chefs de service............", x: 129, y: 224, width: 300 },
      { str: "1068", x: 471, y: 221, width: 20 },
      { str: "Nomination d'ingénieurs généraux...........", x: 129, y: 211, width: 300 },
      { str: "1069", x: 471, y: 211, width: 20 },
    ]);
    expect(lines.map((l) => l.text)).toEqual(["Nomination de chefs de service............ 1068", "Nomination d'ingénieurs généraux........... 1069"]);
  });

  it("reads a real issue of 2000 sampled by the probe (glyph-numbered fonts, page numbers set lower)", () => {
    const probe = JSON.parse(readFileSync(path.join(__dirname, "..", "data", "veille", "probe", "2000-040.json"), "utf8"));
    // The probe kept lines; cut back into items, decoded as pdfLines does, then read again.
    const pages = probe.pages.map((p: [number, number, string][]) =>
      toLines(p.map(([x, y, t]) => ({ str: isGlyphCoded(t) ? decodeGlyphs(t) : t, x, y, width: t.length * 4.5 }))),
    );
    const issue = parseIssue(pages);
    expect([issue.number, issue.date, issue.firstPage]).toEqual([40, "2000-05-19", 1065]);
    expect(issue.entries.length).toBeGreaterThan(40);
    expect(issue.entries.filter((e) => /\.{4,}\s*\d/.test(e.title))).toEqual([]);
    expect(issue.entries[0]).toMatchObject({
      institution: "Premier Ministère",
      page: 1068,
      title: "Décret n° 2000-1073 du 17 mai 2000, relatif à l'octroi d'un congé aux agents publics candidats aux élections du 28 mai 2000",
    });
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

describe("reading a sommaire from the OCR text of ocr.jort.tn", () => {
  const ocr = (f: string) => readFileSync(path.join(__dirname, "..", "data", "sources", "ocr", f), "utf8");

  it("reads a scanned issue of 1960: titles over several lines, institutions in capitals", () => {
    const issue = parseMarkdown(ocr("1960-001.md"));
    expect([issue.number, issue.date]).toEqual([1, "1960-01-05"]);
    expect(issue.entries).toHaveLength(16);
    expect(issue.entries[0]).toMatchObject({
      section: "DECRETS ET ARRETES",
      institution: "SECRETARIAT D'ETAT AUX AFFAIRES ETRANGERES",
      kind: "Décret",
      numbers: ["59-387"],
      page: 2,
    });
    expect(issue.entries[0].title).toMatch(/^DECRET N° 59-387 du 31 décembre 1959 .* en service à l'étranger$/);
    expect(issue.entries.at(-1)).toMatchObject({ section: "AVIS ET COMMUNICATIONS", institution: "TRIBUNAL IMMOBILIER DE TUNISIE", title: "ANNONCES", page: 14 });
  });

  it("joins an institution set over two headings, and stops where the texts start (1965)", () => {
    const issue = parseMarkdown(ocr("1965-040.md"));
    expect(issue.entries).toHaveLength(17);
    expect(issue.entries[2].institution).toBe("SECRETARIAT D'ETAT AU PLAN ET A L'ECONOMIE NATIONALE");
    expect(issue.entries.at(-1)).toMatchObject({ title: "ANNONCES", page: 971 });
  });

  it("reads the sommaire of 1980, sections and institutions as headings", () => {
    const issue = parseMarkdown(ocr("1980-001.md"));
    expect(issue.entries).toHaveLength(24);
    const edi = issue.entries.find((e) => /établissements dangereux/.test(e.title))!;
    expect(edi).toMatchObject({ section: "Avis et Communications", institution: "Ministère de l'Industrie, des Mines et de l'Energie", page: 18 });
    // Notices of inquiries on given establishments: news, not an obligation for every site.
    expect(assess(edi)?.severity).toBe("information");
  });

  it("reads a sommaire laid out as a table (2023 n° 108)", () => {
    const issue = parseMarkdown(ocr("2023-108.md"));
    expect(issue.entries.flatMap((e) => e.numbers)).toEqual(["2023-588", "2023-589", "2023-590", "2023-591", "2023-592", "2006-1245"]);
    expect(issue.entries.map((e) => e.page)).toEqual([2397, 2397, 2398, 2399, 2402]);
  });

  it("keeps titles whose page number the OCR lost, with the next title's page (2024 n° 2)", () => {
    const issue = parseMarkdown(ocr("2024-002.md"));
    expect(issue.firstPage).toBe(25);
    expect(issue.entries).toHaveLength(27);
    expect(issue.entries.every((e) => e.page >= 25 && e.page <= 62)).toBe(true);
    expect(issue.entries.at(-1)).toMatchObject({ title: "Nomination d'un ingénieur général", page: 62 });
  });

  it("does not take a year closing a title for a page number", () => {
    const md = [
      "# Sommaire",
      "## Décrets et arrêtés",
      "### Ministère des Finances",
      "Arrêté de la ministre des finances du 2 janvier 2024, portant ouverture d'un concours au titre de l'année 2023",
      "Nomination d'un directeur 12",
    ].join("\n");
    const issue = parseMarkdown(md);
    expect(issue.entries.map((e) => e.page)).toEqual([12, 12]);
    expect(issue.entries[0].title).toMatch(/au titre de l'année 2023$/);
  });

  it("asks for the whole text when its beginning does not hold the whole sommaire", () => {
    const md = ocr("2024-002.md");
    expect(parseMarkdownStart(md.slice(0, 3000))).toBeNull();
    expect(parseMarkdownStart(md)?.entries).toHaveLength(27);
    expect(ocrUrl(1980, 1)).toBe("https://ocr.jort.tn/journal-officiel/fr/1980/001.md");
  });

  it("reads the Arabic edition filed in the French collection (2019 n° 24)", () => {
    const issue = parseMarkdown(ocr("2019-024-arabe.md"));
    expect(issue).toMatchObject({ arabe: true, number: 24, date: "2019-03-22" });
    expect(issue.entries.length).toBeGreaterThanOrEqual(15);
    const law = issue.entries[0];
    expect(law).toMatchObject({ kind: "Loi", numbers: ["2019-25"], page: 883, section: "القوانين" });
    // The law on food safety: found by the Arabic terms of the rules, as its French title would be.
    expect(assess(law)).toMatchObject({ severity: "important", domains: ["hygiene"] });
    const molluscs = issue.entries.find((e) => /الرخويات/.test(e.title))!;
    expect(molluscs).toMatchObject({ kind: "Arrêté", institution: "وزارة الفلاحة والموارد المائية والصيد البحري" });
    expect(parseMarkdown(ocr("1980-001.md")).arabe).toBeUndefined();
  });

  it("reads the texts an Arabic title names, as a French title would name them", () => {
    const title = "أمر عدد 758 لسنة 2023 مؤرخ في 8 ديسمبر 2023 يتعلق بتنقيح الأمر عدد 1991 لسنة 2005 المؤرخ في 11 جويلية 2005";
    expect(frenchCitations(title)).toMatch(/^decret n° 2023-758 يتعلق بتنقيح decret n° 2005-1991/);
    expect(assess({ title })?.severity).toBe("critique"); // it modifies the décret on impact studies
    expect(isoDate("قرار من وزير المالية مؤرخ في 15 مارس 2019")).toBe("2019-03-15");
    expect(kindOf("قانون أساسي عدد 5 لسنة 2026")).toBe("Loi organique");
    // Bricks and wages fold to the same letters: no "الآجر" among the terms.
    expect(assess({ title: "أمر عدد 66 لسنة 2026 مؤرخ في 30 أفريل 2026 يتعلق بضبط الأجر الأدنى الفلاحي المضمون" })?.matches.map((m) => m.rule)).toEqual(["salaire-minimum"]);
  });

  it("sees the end of a word after an accented letter", () => {
    expect(INSTITUTION.test("Assemblée des représentants du peuple")).toBe(true);
    expect(TEXT_START.test("Arrêté du ministre des finances")).toBe(true);
    expect(TEXT_START.test("Arrêtées")).toBe(false);
    expect(["DECRET N° 59-387", "ARRETE du Secrétaire d'Etat", "Décrets-lois", "LOI N° 62-42"].map(kindOf)).toEqual(["Décret", "Arrêté", "Décret-loi", "Loi"]);
  });
});

describe("finding the texts repealed as a whole", () => {
  const keys = (text: string) => repealClauses(text).map((r) => namedKeys(r.clause)[0]);

  it("reads the repeals of the bodies and titles of real texts", () => {
    expect(keys("Art. 4 - Sont abrogées les dispositions du décret n° 2008-452 du 18 février 2008 fixant l'organigramme du Centre")).toEqual(["n:decret:2008-452"]);
    expect(keys("Art. 26 - Sont abrogées toutes les dispositions antérieures contraires au présent décret, notamment le décret n° 78-452 du 26 avril 1978 portant statut particulier")).toEqual(["n:decret:78-452"]);
    expect(keys("Art. 19 - Est abrogé l'arrêté du Premier ministre du 30 janvier 1999, fixant les modalités d'organisation du concours externe")).toEqual(["d:arrete:1999-01-30"]);
    expect(keys("Art. 10 - Toutes les dispositions de l'arrêté du ministre des affaires étrangères du 16 septembre 2013, susvisé sont abrogées.")).toEqual(["d:arrete:2013-09-16"]);
    expect(keys("Art. 2 - Le présent arrêté abroge et remplace l'arrêté du ministre des affaires sociales et de la solidarité du 6 septembre 2002 susvisé.")).toEqual(["d:arrete:2002-09-06"]);
    expect(keys("Décret n° 2024-59 du 11 janvier 2024, abrogeant le décret gouvernemental n° 2018-484 du 4 juin 2018, portant changement de la vocation")).toEqual(["n:decret:2018-484"]);
    expect(keys("الفصل 5 - يلغى الأمر عدد 1991 لسنة 2005 المؤرخ في 11 جويلية 2005")).toEqual(["n:decret:2005-1991"]);
  });

  it("does not take the repeal of an article, a paragraph or an annex for the repeal of the text", () => {
    expect(repealClauses("Art. 2 - Sont abrogées les dispositions de l'article 6 de l'arrêté du 8 décembre 2022 susvisé.")).toEqual([]);
    expect(repealClauses("Article premier - Est abrogé le deuxième paragraphe de l'article 2 du décret Présidentiel n° 2022-677 du 3 août 2022")).toEqual([]);
    expect(repealClauses("Art. 3 - Est abrogée l'annexe n°4 du décret gouvernemental n° 2017-389 du 9 mars 2017 susvisé")).toEqual([]);
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
    // A text on an activity is important: it is ticked in the registers of the sites that carry it on.
    expect(assess({ title: "Arrêté du 9 mars 2026, portant approbation du cahier des charges relatif à l'exploitation des carrières" })).toMatchObject({ severity: "important", sectors: ["1700"] });
    expect(assess({ title: "Décret n° 2026-80, relatif à l'organisation des élevages avicoles" })).toMatchObject({ severity: "important", sectors: ["1100"] });
    expect(assess({ title: "Arrêté du 2 mars 2026, fixant les conditions de collecte et de trituration des olives et de stockage des grignons et des margines" })).toMatchObject({ severity: "important", domains: ["secteurs"], sectors: ["1200"] });
    expect(assess({ title: "Décret n° 2026-81, relatif au stockage des produits pétroliers" })).toMatchObject({ severity: "important", sectors: ["2500"] });
  });

  it("flags, among the 102 texts of JORT 2026 n° 1 to 5, the ones that concern establishments", () => {
    expect(assess({ title: "Arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime du 12 janvier 2026, modifiant et complétant l’arrêté du ministre de l'agriculture du 19 septembre 1998, fixant les modalités de contrôle sanitaire et de surveillance des conditions de production des produits de la pêche et de leur mise sur le marché" })).toMatchObject({ severity: "important", domains: ["hygiene", "secteurs"], sectors: expect.arrayContaining(["1200"]) });
    expect(assess({ title: "Arrêté conjoint de la ministre de l’industrie, des mines et de l’énergie, du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime et du ministre de l’équipement et de l’habitat du 31 décembre 2025, modifiant l’arrêté conjoint […] du 3 mai 2023 fixant les conditions et les critères du changement de vocation des terres agricoles sur lesquelles sont implantés des projets industriels" })).toMatchObject({ severity: "information", domains: ["etablissements-classes"] });
    expect(assess({ title: "Arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime du 31 décembre 2025, modifiant l’arrêté du ministre de l'agriculture et des ressources hydrauliques du 9 juillet 2005, portant approbation du cahier des charges types de la production animale selon le mode biologique" })).toMatchObject({ severity: "information", sectors: ["1100"] });
    expect(assess({ title: "Décret n° 2026-6 du 7 janvier 2026, relatif à l’approbation de la vente au dinar symbolique au profit de l’Agence foncière industrielle d’une parcelle de terre domaniale sise à la région de Bourbiaa dans la délégation de Mohammadia du gouvernorat de Ben Arous pour réaliser et aménager une zone industrielle" })?.severity).toBe("information");
    for (const title of [
      "Arrêté de la ministre des finances du 6 janvier 2026, complétant l’arrêté du 21 août 2023 relatif à la nomenclature des produits monopolisés et leurs prix",
      "Arrêté du ministre de l’agriculture, des ressources hydrauliques et de la pêche maritime du 9 janvier 2026, portant ouverture de la procédure de réaménagement foncier dans les périmètres publics irrigués situés au gouvernorat de Nabeul",
      "Arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche maritime du 12 janvier 2026, modifiant l’arrêté du ministre de l'agriculture, des ressources hydrauliques et de la pêche du 9 février 2016, fixant la durée de la période d'autorisation d'utilisation des semences et des produits de multiplication végétative non obtenus selon le mode de production biologique",
      "Arrêté du ministre des affaires sociales du 31 décembre 2025, fixant les modalités d’organisation du concours externe sur épreuves pour le recrutement de travailleurs sociaux conseillers du ministère des affaires sociales",
    ])
      expect(assess({ title }), title).toBeNull();
    expect(assess({ title: "Nomination d’un sous-directeur", institution: "Ministère de l’Environnement" })).toBeNull();
    expect(assess({ title: "Arrêté de la Cheffe du Gouvernement du 13 janvier 2026, fixant la procédure d’obtention des informations relatives au bénéficiaire effectif des personnes morales et des constructions juridiques" })).toMatchObject({ severity: "important", domains: ["finance"] });
  });

  it("follows droit du travail, code de la route and fiscalité (JORT 2025 and 2026)", () => {
    expect(assess({ title: "Loi n° 2025-9 du 21 mai 2025, portant réglementation des contrats de travail et interdiction de la sous-traitance de main-d'œuvre" })).toMatchObject({ severity: "important", domains: ["travail"] });
    expect(assess({ title: "Arrêté du ministre des affaires sociales du 16 avril 2025, portant agrément de l’avenant n° 17 à la convention collective sectorielle des pharmacies d’officines" })).toMatchObject({ severity: "important", domains: ["travail"] });
    expect(assess({ title: "Loi n° 2025-17 du 12 décembre 2025, portant loi de finances pour l’année 2026" })).toMatchObject({ severity: "important", domains: ["finance"] });
    expect(assess({ title: "Arrêté de la ministre des finances du 30 décembre 2025, fixant les calendriers de paiement des créances fiscales et des amendes fiscales administratives revenant à l’Etat, prévus par la loi n° 2025-17 du 12 décembre 2025 portant loi de finances pour l’année 2026" })?.domains).toEqual(["finance"]);
    expect(assess({ title: "Décret n° 2025-345 du 11 juillet 2025, modifiant et complétant le décret n° 2000-147 du 24 janvier 2000, fixant les règles techniques d'équipement et d'aménagement des véhicules" })).toMatchObject({ severity: "important", domains: ["route"] });
    expect(assess({ title: "Arrêté du ministre des transports du 30 septembre 2025, portant approbation de la modification du cahier des charges relatif à l’exercice par des personnes morales de l’activité de transport routier de marchandises pour le compte d’autrui" })?.domains).toEqual(["route"]);
    // An international agreement is information, however important its subject.
    expect(assess({ title: "Loi organique n° 2025-8 du 16 mai 2025, portant approbation de l’accord entre la République tunisienne et la République italienne relatif à la reconnaissance mutuelle des permis de conduire en vue de conversion" })).toMatchObject({ severity: "information", domains: ["route"] });
  });

  it("ignores one-off acts, State finances and awards", () => {
    for (const title of [
      "Arrêté de la ministre de l’industrie, des mines et de l’énergie du 5 mars 2026, portant institution d’un permis de recherche de substances minérales du 4 groupe (sel) dit permis « Sabkhet »",
      "Arrêté du ministre chargé à titre temporaire de diriger le ministère de l’industrie, des mines et de l’énergie du 5 mai 2026, portant autorisation de cession totale des droits et des obligations dans la concession d’exploitation d’hydrocarbures dite concession d’exploitation « Sabeh »",
      "Loi n° 2026-17 du 30 juillet 2026, portant approbation de la convention de garantie conclue le 3 novembre 2025 entre la République tunisienne et la Banque européenne pour la reconstruction et le développement relative au prêt accordé à la Compagnie des phosphates de Gafsa",
      "Décret n° 2026-11 du 13 janvier 2026, portant expropriation pour cause d’utilité publique d’une parcelle de terre sise à la région de Zitouna pour l’eau potable",
      "Arrêté de la ministre des finances du 28 avril 2025, portant virement de crédits entre programmes au titre du budget de l’Etat pour l’année 2024",
      "Situation générale décadaire de la Banque Centrale de Tunisie",
      "Décret n° 2025-111 du 7 février 2025, portant attribution des médailles du travail au titre de l’année 2023",
      "Arrêté du ministre des affaires sociales du 15 avril 2025, portant attribution du prix national de santé et de sécurité au travail au titre de l'année 2023",
    ])
      expect(assess({ title }), title).toBeNull();
  });

  it("leaves out the issuer: a ministry's name is not a subject", () => {
    expect(subject("Arrêté de la ministre de l'industrie, des mines et de l'énergie du 3 mars 2026, fixant le calendrier")).toBe("fixant le calendrier");
    expect(subject("Arrêté conjoint du ministre de l'agriculture et du ministre de la santé du 1er juin 2025, relatif à l'hygiène")).toBe("relatif a l'hygiene");
    expect(assess({ title: "Arrêté de la ministre de l'industrie, des mines et de l'énergie du 3 mars 2026, relatif au statut des ingénieurs" })).toBeNull();
  });

  it("counts a text found by its institution alone as information", () => {
    expect(assess({ title: "Décret n° 2026-90, portant création d'un conseil consultatif", institution: "Ministère de l'Environnement" })?.severity).toBe("information");
    // A ministry's own organisation is not reported at all.
    expect(assess({ title: "Décret n° 2026-91, fixant les attributions du ministère", institution: "Ministère de l'Environnement" })).toBeNull();
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
