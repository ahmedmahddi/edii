// EDII classification. Expected categories are read off the scanned official texts.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { additionGroup, classify, type Input, nomenclature, rubrique, search, variants } from "@/lib/classify";
import { type Activity, classifyEstablishment, decodeActivities, encodeActivities } from "@/lib/establishment";
import { eie, eieEntry, entriesFor, establishmentStudy, studyFor } from "@/lib/studies";

function classe(code: string, input: Input = {}) {
  const rub = rubrique(code);
  if (!rub) throw new Error(`no rubrique ${code}`);
  const out = classify(rub, input);
  return out.status === "classified" ? out.classe : out.status;
}

describe("thresholds", () => {
  it("1101 bovins: veaux de boucherie", () => {
    const veaux = variants(rubrique("1101")!).find((v) => v.startsWith("1) veaux"))!;
    expect(classe("1101", { quantity: 250, unit: "animaux", variant: veaux })).toBe(1);
    expect(classe("1101", { quantity: 200, unit: "animaux", variant: veaux })).toBe(2); // "de plus de 200" excludes 200
    expect(classe("1101", { quantity: 30, unit: "animaux", variant: veaux })).toBe(3);
    expect(classe("1101", { quantity: 5, unit: "animaux", variant: veaux })).toBe("NC");
  });

  it("1101 bovins: vaches laitières", () => {
    const vaches = variants(rubrique("1101")!).find((v) => v.startsWith("2) vaches"))!;
    expect(classe("1101", { quantity: 81, unit: "vaches", variant: vaches })).toBe(1);
    expect(classe("1101", { quantity: 50, unit: "vaches", variant: vaches })).toBe(2);
  });

  it("2502 acétylène, with unit conversion", () => {
    expect(classe("2502", { quantity: 60, unit: "t" })).toBe(1);
    expect(classe("2502", { quantity: 5000, unit: "kg" })).toBe(2);
    expect(classe("2502", { quantity: 1, unit: "t" })).toBe(2); // "supérieure ou égale à 1 t"
    expect(classe("2502", { quantity: 500, unit: "kg" })).toBe(3);
    expect(classe("2502", { quantity: 50, unit: "kg" })).toBe("NC");
    expect(classe("2502", { quantity: 5, unit: "m3" })).toBe("unit_mismatch");
  });

  it("1214 lait, thresholds in litres", () => {
    expect(classe("1214", { quantity: 40000, unit: "l" })).toBe(2);
    expect(classe("1214", { quantity: 30, unit: "m3" })).toBe(3); // "≤ 30 000 l"
    expect(classe("1214", { quantity: 500, unit: "l" })).toBe("NC");
  });

  it("asks for a quantity when the category depends on one", () => {
    expect(classe("2502")).toBe("needs_quantity");
  });

  it("classifies without a quantity when the rubrique has no threshold", () => {
    expect(classe("1401")).toBe(1); // accumulateurs et piles
  });
});

describe("amendments", () => {
  it("2105 is the 2010 version (10 t), not the 2005 one (50 t)", () => {
    const rub = rubrique("2105")!;
    expect(rub.source).toBe("2010");
    expect(rub.replaces).toBe("2005");
    expect(classe("2105", { quantity: 10, unit: "t" })).toBe(1);
    expect(classe("2105", { quantity: 9, unit: "t" })).toBe(2);
  });

  it("2505 gaz inflammables liquéfiés is the 2012 version", () => {
    const rub = rubrique("2505")!;
    expect(rub.source).toBe("2012");
    const vrac = variants(rub).find((v) => v.includes("réservoirs fixes"))!;
    expect(classe("2505", { quantity: 150, unit: "m3", variant: vrac })).toBe(1);
    expect(classe("2505", { quantity: 10, unit: "m3", variant: vrac })).toBe(2);
  });

  it("new rubriques from 2010 and 2012 are in force", () => {
    expect(rubrique("1419 bis 2")?.source).toBe("2010");
    expect(classe("1426")).toBe(1); // hydrocarbures, quelle que soit la capacité (2012)
  });

  it("a definition points to its sub-rubriques", () => {
    const out = classify(rubrique("2722")!);
    expect(out.status).toBe("definition");
    expect(out.status === "definition" && out.related).toEqual(["2722 bis 1", "2722 bis 2"]);
  });
});

describe("search and rules", () => {
  it("finds by code and by words, ignoring accents", () => {
    expect(search("2722 bis").map((r) => r.code)).toEqual(["2722 bis 1", "2722 bis 2"]);
    expect(search("peroxydes organiques").map((r) => r.code)).toContain("2104");
    expect(search("elevage bovins").map((r) => r.code)[0]).toBe("1101");
  });

  it("knows the addition-rule groups of art. 2 bis", () => {
    expect(additionGroup("2725")).toBe(1);
    expect(additionGroup("2715")).toBe(2);
    expect(additionGroup("2505")).toBe(3);
    expect(additionGroup("2506")).toBeNull();
  });
});

describe("establishment with several activities", () => {
  const veaux = variants(rubrique("1101")!).findIndex((v) => v.startsWith("1) veaux"));

  it("takes the most severe category of its activities", () => {
    const est = classifyEstablishment([
      { code: "1101", variant: veaux, quantity: "30", unit: "animaux" }, // 3ème
      { code: "2502", quantity: "5", unit: "t" }, // 2ème
    ]);
    expect(est.results.map((r) => r.classe)).toEqual([3, 2]);
    expect(est.classe).toBe(2);
    expect(est.complete).toBe(true);
    expect(est.decidedBy).toEqual(["rubrique 2502"]);
  });

  it("is incomplete while an activity lacks its case or quantity", () => {
    const est = classifyEstablishment([{ code: "1101", quantity: "30", unit: "animaux" }, { code: "2502", quantity: "500", unit: "kg" }]);
    expect(est.results[0].needsVariant).toBe(true);
    expect(est.classe).toBe(3); // at least, from 2502
    expect(est.complete).toBe(false);
  });

  it("is non classé when every activity is below its thresholds", () => {
    const est = classifyEstablishment([{ code: "2502", quantity: "50", unit: "kg" }]);
    expect(est.classe).toBe("NC");
  });

  it("uses the case the user picks when the text, not a number, decides", () => {
    const rub = rubrique("2501")!;
    const gaz = variants(rub).findIndex((v) => v === "");
    const picked = rub.items.findIndex((i) => i.criterion.startsWith("2) pour l'obtention d'acétylène gazeux"));
    const est = classifyEstablishment([{ code: "2501", variant: gaz, picked }]);
    expect(est.classe).toBe(2);
  });

  it("round-trips through the URL form", () => {
    const list: Activity[] = [
      { code: "2722 bis 1", variant: 1, quantity: "1 500", unit: "kg", picked: -1 },
      { code: "1401" },
    ];
    expect(decodeActivities(encodeActivities(list))).toEqual([list[0], { code: "1401", variant: undefined, quantity: undefined, unit: undefined, picked: undefined }]);
    expect(decodeActivities("9999~~~~|1401~~~~")).toHaveLength(1); // unknown codes are dropped
  });
});

describe("règle d'addition (arrêté 2010, art. 2 bis)", () => {
  it("moves the establishment up when Σ q/Q of the next category exceeds 1", () => {
    // acétylène 30 t and hydrogène 30 t are each 2ème; with the 1ère thresholds (50 t each): 0.6 + 0.6 = 1.2
    const est = classifyEstablishment([
      { code: "2502", quantity: "30", unit: "t" },
      { code: "2509", quantity: "30", unit: "t" },
    ]);
    expect(est.results.map((r) => r.classe)).toEqual([2, 2]);
    const [g] = est.additions;
    expect(g.group).toBe(3);
    expect(g.target).toBe(1);
    expect(g.sum).toBeCloseTo(1.2);
    expect(g.upgraded).toBe(true);
    expect(est.classe).toBe(1);
    expect(est.decidedBy).toEqual(["règle d'addition, groupe 3"]);
  });

  it("leaves the category alone when Σ q/Q ≤ 1", () => {
    const est = classifyEstablishment([
      { code: "2502", quantity: "20", unit: "t" },
      { code: "2509", quantity: "20", unit: "t" },
    ]);
    expect(est.additions[0].sum).toBeCloseTo(0.8);
    expect(est.additions[0].upgraded).toBe(false);
    expect(est.classe).toBe(2);
  });

  it("classes in 3ème substances that are each below their own threshold", () => {
    // acétylène 60 kg (3ème from 100 kg) + hydrogène 20 kg (3ème from 30 kg): 0.6 + 0.667 > 1
    const est = classifyEstablishment([
      { code: "2502", quantity: "60", unit: "kg" },
      { code: "2509", quantity: "20", unit: "kg" },
    ]);
    expect(est.results.map((r) => r.classe)).toEqual(["NC", "NC"]);
    expect(est.additions[0].target).toBe(3);
    expect(est.classe).toBe(3);
  });

  it("only adds up substances of the same group", () => {
    const est = classifyEstablishment([
      { code: "2502", quantity: "30", unit: "t" }, // group 3
      { code: "2720", quantity: "40", unit: "t" }, // group 2
    ]);
    expect(est.additions).toEqual([]);
    expect(est.classe).toBe(2);
  });

  it("cannot go above 1ère", () => {
    const est = classifyEstablishment([
      { code: "2502", quantity: "60", unit: "t" },
      { code: "2509", quantity: "10", unit: "t" },
    ]);
    expect(est.additions[0].target).toBeNull();
    expect(est.classe).toBe(1);
  });
});

it("data/nomenclature.json matches the OCR output and corrections", () => {
  const file = path.join(__dirname, "..", "data", "nomenclature.json");
  const before = readFileSync(file, "utf8");
  try {
    execFileSync("python3", ["-I", path.join(__dirname, "..", "data", "pipeline", "parse.py")], { stdio: "pipe" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // no python: CI runs this check
    throw e;
  }
  expect(readFileSync(file, "utf8"), "data/nomenclature.json is stale: run `npm run data:parse` and commit").toBe(before);
});

describe("études ANPE (décret n° 2005-1991)", () => {
  it("has every entry of the decree's annexes", () => {
    const count = (k: string) => eie.entries.filter((e) => e.annexe === k).length;
    expect([count("A"), count("B"), count("CDC")]).toEqual([24, 26, 18]);
    expect(eieEntry("B19")?.text).toBe("Unités de tannerie et de mégisserie");
    expect(eieEntry("CDC6")?.text).toBe("Les unités de trituration d'olive (huileries)");
  });

  it("suggests entries for a rubrique with their conditions, and keeps every entry available", () => {
    const { suggested, others } = entriesFor("1213"); // huiles végétales
    expect(suggested.map((s) => s.entry.id)).toEqual(["CDC6", "CDC7", "A14"]);
    expect(suggested[0].when).toMatch(/trituration d'olives/);
    expect(suggested.length + others.length).toBe(eie.entries.length);
  });

  it("covers every activity rubrique: suggestions with a condition, or a note", () => {
    for (const r of nomenclature.rubriques.filter((r) => r.kind === "activity")) {
      const s = eie.suggestions[r.code];
      expect(s, r.code).toBeDefined();
      expect(s.links.length > 0 || !!s.note, r.code).toBe(true);
      for (const l of s.links) expect(l.when, `${r.code} → ${l.entry}`).not.toBe("");
    }
  });

  it("follows the activity's case", () => {
    const [fabrication, stockage] = variants(rubrique("2101")!);
    expect(entriesFor("2101", fabrication).suggested.map((s) => s.entry.id)).toEqual(["B6"]);
    expect(entriesFor("2101", stockage).suggested.map((s) => s.entry.id)).toEqual(["CDC14"]);
    expect(entriesFor("2101").suggested.map((s) => s.entry.id)).toEqual(["B6", "CDC14"]);
  });

  it("does not send substance use or ancillary activities to an entry of their own", () => {
    expect(entriesFor("1612").suggested).toEqual([]); // réfrigération
    expect(entriesFor("1612").note).toMatch(/activité principale/);
    expect(entriesFor("2104").suggested.map((s) => s.entry.id)).toEqual(["CDC14"]); // peroxydes, emploi et stockage
    expect(entriesFor("2105").suggested.map((s) => s.entry.id)).toEqual(["A24"]); // peroxydes, fabrication
    expect(entriesFor("1725").suggested).toEqual([]); // dépôt de ciments, plâtres…
  });

  it("picks the study for one activity", () => {
    expect(studyFor(eieEntry("A3"), "projet")).toBe("eie_a");
    expect(studyFor(eieEntry("B19"), "projet")).toBe("eie_b");
    expect(studyFor(eieEntry("CDC8"), "projet")).toBe("cahier_des_charges");
    expect(studyFor(eieEntry("B19"), "extension")).toBe("eie_b"); // art. 12
    expect(studyFor(eieEntry("A3"), "existant")).toBe("depollution");
    expect(studyFor(eieEntry("CDC8"), "existant")).toBe("depollution");
    expect(studyFor(undefined, "projet")).toBe("demande_avis");
    expect(studyFor(undefined, "existant")).toBe("demande_avis");
  });

  it("keeps the most demanding study for the establishment", () => {
    expect(establishmentStudy(["CDC8", "A14", "none"], "projet", false).study?.kind).toBe("eie_a");
    expect(establishmentStudy(["A14", "B19"], "projet", false).study?.kind).toBe("eie_b");
    expect(establishmentStudy(["CDC8", "none"], "projet", false).study?.kind).toBe("cahier_des_charges");
    expect(establishmentStudy(["none"], "existant", false).study?.kind).toBe("demande_avis");
  });

  it("gives the ANPE review time of art. 9, longer near a protected area", () => {
    expect(establishmentStudy(["A14"], "projet", false).study?.delay).toMatch(/^21 jours ouvrables/);
    expect(establishmentStudy(["A14"], "projet", true).study?.delay).toMatch(/^3 mois ouvrables/);
    expect(establishmentStudy(["B19"], "projet", false).study?.delay).toMatch(/^3 mois ouvrables/);
  });

  it("waits until every activity's entry is chosen, and ignores unknown ids", () => {
    expect(establishmentStudy(["A14", undefined], "projet", false)).toMatchObject({ study: null, missing: 1 });
    expect(establishmentStudy(["Z99"], "projet", false)).toMatchObject({ study: null, missing: 1 });
  });

  it("keeps the chosen entry in the URL form", () => {
    const list: Activity[] = [{ code: "1213", quantity: "5", unit: "t/j", eie: "CDC6" }];
    expect(decodeActivities(encodeActivities(list))[0].eie).toBe("CDC6");
  });
});

it("data/eie.json matches the decree and data/eie-links.json", () => {
  const file = path.join(__dirname, "..", "data", "eie.json");
  const before = readFileSync(file, "utf8");
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "pipe" });
    execFileSync("python3", ["-I", path.join(__dirname, "..", "data", "pipeline", "eie.py")], { stdio: "pipe" });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // no python or no pdftotext (poppler-utils)
    throw e;
  }
  expect(readFileSync(file, "utf8"), "data/eie.json is stale: run `npm run data:eie` and commit").toBe(before);
});
