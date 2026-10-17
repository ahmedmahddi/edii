// Export of veille hits to the QSE register (ID-QSE-002 layout).
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { COLUMNS, fillRegister, reference, registerRow } from "@/lib/veille/registre";
import { assess, type Hit } from "@/lib/veille/watch";

function hit(title: string, extra: Partial<Hit> = {}): Hit {
  return {
    id: "2025-075-1712-0",
    year: 2025,
    issue: 75,
    date: "2025-07-15",
    pdf: "https://lake.jort.tn/journal-officiel/fr/2025/075.pdf#page=4",
    page: 1712,
    institution: "Ministère des Transports",
    kind: "Décret",
    title,
    ...assess({ title })!,
    ...extra,
  };
}

const vehicles = hit(
  "Décret n° 2025-345 du 11 juillet 2025, modifiant et complétant le décret n° 2000-147 du 24 janvier 2000, fixant les règles techniques d'équipement et d'aménagement des véhicules",
);

describe("register rows", () => {
  it("writes the reference as the register does", () => {
    expect(reference(vehicles)).toBe("Décret n° 2025-345 du 11-07-2025");
    expect(reference({ kind: "Arrêté", title: "Arrêté du ministre de la santé du 14 mai 2026, fixant la liste des substituts du lait maternel" })).toBe("Arrêté du 14-05-2026");
    expect(reference({ kind: "Loi organique", title: "Loi organique n° 2025-8 du 16 mai 2025, portant approbation de l’accord" })).toBe("Loi organique n° 2025-8 du 16-05-2025");
  });

  it("names the register's système and domaine, and leaves to fill what only a reader can write", () => {
    expect(registerRow(vehicles)).toEqual({
      systeme: "Codes et recueils",
      domaine: "Véhicules, visite technique",
      type: "Décret",
      ref: "Décret n° 2025-345 du 11-07-2025",
      titre: vehicles.title,
      resume: "À compléter après lecture du texte. Source : JORT n° 75/2025 du 15-07-2025, p. 1712.",
      frequence: "Annuelle",
      url: vehicles.pdf,
    });
    const classified = hit("Arrêté du ministre de l'industrie du 3 mars 2026, modifiant l'arrêté du 15 novembre 2005 fixant la nomenclature des établissements dangereux, insalubres ou incommodes", { kind: "Arrêté" });
    expect(registerRow(classified)).toMatchObject({ systeme: "HSST & Environnement", domaine: "Établissements classés" });
  });

  it("builds the sheet: title rows, the eleven columns, one row per text with a link to the JORT", async () => {
    const workbook = new ExcelJS.Workbook();
    fillRegister(workbook, [vehicles], new Date("2026-10-17T12:00:00"));
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await workbook.xlsx.writeBuffer());
    const ws = read.getWorksheet("Liste des textes applicables")!;
    expect(ws.getCell("C1").value).toBe("REGISTRE DE VEILLE LEGALE, REGLEMENTAIRE ET NORMATIVE");
    expect(ws.getCell("A2").value).toBe("DATE DE MISE A JOUR  17/10/2026");
    expect(ws.getRow(3).values).toEqual([undefined, ...COLUMNS.map(([label]) => label)]);
    expect(ws.getCell("A4").value).toBe("Codes et recueils");
    expect(ws.getCell("E4").value).toEqual({ text: vehicles.title, hyperlink: vehicles.pdf });
    expect(ws.getCell("H4").value).toBe("Annuelle");
    expect(ws.getCell("G4").value).toBe("");
  });
});

describe("the texts of a real register (ID-QSE-002), as the JORT titled them", () => {
  it("would have flagged them when they were published", () => {
    const expected: [string, string][] = [
      ["Arrêté du ministre de l'intérieur du 16 septembre 2013, fixant le contenu du plan intérieur d'intervention", "incendie"],
      ["Décret n° 2004-1876 du 11 août 2004, relatif à la conformité des locaux et à l'attestation de prévention", "incendie"],
      ["Décret n° 2005-3395 du 26 décembre 2005, fixant les conditions et les modalités de collecte des accumulateurs et piles usagés", "environnement"],
      ["Décret n° 2022-335 du 14 février 2022, fixant le seuil à partir duquel la consommation des eaux est soumise à un diagnostic technique, périodique et obligatoire", "environnement"],
      ["Décret n° 98-2248 du 16 novembre 1998, fixant les lieux affectés à l'usage collectif dans lesquels il est interdit de fumer", "hygiene"],
      ["Arrêté du ministre de la santé du 1er décembre 2015, fixant la liste des maladies transmissibles à déclaration obligatoire", "hygiene"],
      ["Loi n° 2018-35 du 11 juin 2018, relative à la responsabilité sociale des entreprises", "travail"],
      ["Arrêté du ministre des affaires sociales du 21 décembre 1994, fixant le modèle des formules de déclaration des travailleurs nouvellement recrutés et de déclaration trimestrielle des salaires", "travail"],
      ["Arrêté du ministre de la formation professionnelle et de l'emploi du 8 août 2017, fixant les critères pour bénéficier du contrat KARAMA", "travail"],
      ["Décret n° 2000-152 du 24 janvier 2000, fixant la liste des pièces nécessaires pour la mise en circulation d'un véhicule et sa conduite", "route"],
      ["Arrêté du ministre du commerce du 5 mars 2019, fixant le contrôle métrologique légal sur les appareils de mesure de vitesse sur routes", "secteurs"],
      ["Loi n° 2024-41 du 2 août 2024, modifiant et complétant le code de commerce en matière de chèques", "finance"],
      ["Décret n° 2018-447 du 18 mai 2018, fixant les valeurs limites et valeurs d'avertissement de la qualité de l'air ambiant", "environnement"],
      ["Arrêté du ministre des affaires sociales du 10 janvier 1995, fixant la liste des maladies professionnelles", "sst"],
    ];
    for (const [title, domain] of expected) expect(assess({ title })?.domains, title).toContain(domain);
  });
});
