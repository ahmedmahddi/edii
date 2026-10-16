// Veille réglementaire: reading JORT sommaires and picking the texts that concern the app.
// The two issues are real ones, kept in data/sources: JORT n° 83 of 2006 and n° 18 of 2010.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type Issue, isoDate, kindOf, parseIssue, pdfPage, pdfUrl } from "@/lib/veille/jort";
import { pdfLines, toLines } from "@/lib/veille/pdf";
import { assess, type Feed, hitsOf, record } from "@/lib/veille/watch";

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
  it("finds the one text of each issue, and nothing else", () => {
    const h2006 = hitsOf(2006, jort2006);
    const h2010 = hitsOf(2010, jort2010);
    expect(h2006.map((h) => h.title.slice(0, 31))).toEqual(["Décret n° 2006-2687 du 9 octobr"]);
    expect(h2010.map((h) => h.page)).toEqual([559]);
    expect(h2010[0]).toMatchObject({
      severity: "critique",
      pdf: "https://lake.jort.tn/journal-officiel/fr/2010/018.pdf#page=7",
      impacts: expect.arrayContaining(["nomenclature", "addition"]),
    });
  });

  it("marks as critique a text that cites a text the app is built on", () => {
    expect(assess({ title: "Arrêté du ministre de l'industrie du 3 mars 2026, modifiant l'arrêté du 15 novembre 2005 fixant la nomenclature des établissements dangereux, insalubres ou incommodes" })?.severity).toBe("critique");
    expect(assess({ title: "Décret n° 2026-100 du 2 février 2026, modifiant le décret n° 2005-1991 du 11 juillet 2005" })).toMatchObject({ severity: "critique", impacts: ["etude"] });
  });

  it("marks as important a text on one of the app's subjects", () => {
    expect(assess({ title: "Décret n° 2026-12, relatif à l'étude d'impact sur l'environnement des projets miniers" })).toMatchObject({ severity: "important", impacts: ["etude"] });
    expect(assess({ title: "Arrêté portant approbation du cahier des charges relatif aux mesures environnementales des huileries" })?.severity).toBe("important");
    expect(assess({ title: "Décret fixant la liste des DÉCHETS DANGEREUX" })?.severity).toBe("important");
  });

  it("ignores nominations, other cahiers des charges, and words that only contain a keyword", () => {
    expect(assess({ title: "Nomination d'un directeur à l'Agence nationale de protection de l'environnement" })).toBeNull();
    expect(assess({ title: "Arrêtés portant délégation de signature" })).toBeNull();
    expect(assess({ title: "Arrêté portant approbation du cahier des charges relatif au transport par taxi" })).toBeNull();
    expect(assess({ title: "Arrêté relatif à la campanpe annuelle" })).toBeNull(); // contains "anpe", not the word
  });

  it("records each issue once, newest first", () => {
    let feed: Feed = { updated: null, scanned: {}, hits: [] };
    feed = record(feed, 2006, jort2006);
    feed = record(feed, 2010, jort2010);
    feed = record(feed, 2010, jort2010); // read again: replaced, not duplicated
    expect(feed.scanned).toEqual({ "2006": [83], "2010": [18] });
    expect(feed.hits.map((h) => h.year)).toEqual([2010, 2006]);
  });
});
