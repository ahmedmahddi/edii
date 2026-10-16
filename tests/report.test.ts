import { describe, expect, it } from "vitest";
import { rubrique, variants } from "@/lib/classify";
import { createClassificationReport, reportFingerprint } from "@/lib/report";
import type { Activity } from "@/lib/establishment";

const hydrogen: Activity = {
  code: "2508",
  quantity: "100000",
  unit: "kg",
  eie: "B6",
};

describe("validated detailed reports", () => {
  it("rejects an empty dossier and identifies missing classifications and ANPE choices", () => {
    expect(createClassificationReport([], "projet", false).ok).toBe(false);
    const missing = createClassificationReport(
      [{ code: "1101" }],
      "projet",
      false,
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error("Expected validation errors");
    expect(missing.issues.some((i) => i.includes("choisissez le cas"))).toBe(
      true,
    );
    expect(missing.issues.some((i) => i.includes("ANPE"))).toBe(true);
  });

  it("does not validate invalid or negative quantities, invalid cases, or unknown annexes", () => {
    for (const quantity of ["-1", "abc", ""])
      expect(
        createClassificationReport([{ ...hydrogen, quantity }], "projet", false)
          .ok,
      ).toBe(false);
    expect(
      createClassificationReport(
        [{ code: "1101", variant: 999, quantity: "1", eie: "none" }],
        "projet",
        false,
      ).ok,
    ).toBe(false);
    expect(
      createClassificationReport(
        [{ ...hydrogen, eie: "B999" }],
        "projet",
        false,
      ).ok,
    ).toBe(false);
    expect(
      createClassificationReport(
        [{ ...hydrogen, code: "unknown" }],
        "projet",
        false,
      ).ok,
    ).toBe(false);
  });

  it("keeps the exact input, all thresholds, the deciding line and source pages", () => {
    const result = createClassificationReport(
      [hydrogen],
      "projet",
      false,
      "Usine ABC",
      "2026-10-16T12:00:00.000Z",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected complete report");
    const { report } = result;
    expect(report.name).toBe("Usine ABC");
    expect(report.establishment.classe).toBe(1);
    expect(report.activities[0].quantity).toBe("100000");
    expect(report.activities[0].canonicalQuantity).toEqual({
      value: 100000,
      unit: "kg",
    });
    expect(report.activities[0].thresholds).toHaveLength(
      rubrique("2508")!.items.length,
    );
    expect(
      report.activities[0].thresholds
        .filter((t) => t.selected)
        .map((t) => t.category),
    ).toEqual([1]);
    expect(
      report.activities[0].thresholds.every((t) => t.ref && t.threshold),
    ).toBe(true);
    expect(report.environment.study?.kind).toBe("eie_b");
    expect(report.activities[0].environmentalEntry?.text).toContain(
      "chimiques",
    );
    expect(report.sources).toHaveLength(3);
  });

  it("includes alternate cases even when a particular case is selected", () => {
    const rub = rubrique("1101")!;
    const variant = variants(rub).findIndex((v) => v.startsWith("2) vaches"));
    const result = createClassificationReport(
      [
        {
          code: rub.code,
          variant,
          quantity: "50",
          unit: "vaches",
          eie: "CDC8",
        },
      ],
      "extension",
      true,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected complete report");
    expect(result.report.activities[0].thresholds).toHaveLength(
      rub.items.length,
    );
    expect(
      result.report.activities[0].thresholds.some((t) =>
        t.path.join("").startsWith("1)"),
      ),
    ).toBe(true);
    expect(
      result.report.activities[0].thresholds
        .filter((t) => t.selected)
        .every((t) => t.path.join("").startsWith("2)")),
    ).toBe(true);
    expect(result.report.sensitive).toBe(true);
  });

  it("captures addition calculations without merging repeated activities", () => {
    const result = createClassificationReport(
      [
        { ...hydrogen, quantity: "30000" },
        { ...hydrogen, quantity: "30000" },
      ],
      "projet",
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected complete report");
    expect(result.report.activities.map((a) => a.number)).toEqual([1, 2]);
    expect(result.report.establishment.additions[0].sum).toBeCloseTo(1.2);
    expect(result.report.establishment.additions[0].upgraded).toBe(true);
    expect(result.report.establishment.classe).toBe(1);
  });

  it("supports non-classified cases and explicitly declared no-annex activities", () => {
    const result = createClassificationReport(
      [{ code: "2502", quantity: "50", unit: "kg", eie: "none" }],
      "projet",
      false,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected complete report");
    expect(result.report.establishment.classe).toBe("NC");
    expect(result.report.activities[0].reason).toContain("plus petit seuil");
    expect(result.report.environment.study?.kind).toBe("demande_avis");
  });

  it("freezes the validated snapshot and detects changes to every report input", () => {
    const inputs = [{ ...hydrogen }];
    const result = createClassificationReport(inputs, "projet", false, "ABC");
    if (!result.ok) throw new Error("Expected complete report");
    const original = result.report.fingerprint;
    inputs[0].quantity = "1";
    expect(result.report.activities[0].quantity).toBe("100000");
    expect(result.report.establishment.results[0].activity.quantity).toBe(
      "100000",
    );
    expect(reportFingerprint(inputs, "projet", false, "ABC")).not.toBe(
      original,
    );
    expect(reportFingerprint([hydrogen], "existant", false, "ABC")).not.toBe(
      original,
    );
    expect(reportFingerprint([hydrogen], "projet", true, "ABC")).not.toBe(
      original,
    );
    expect(reportFingerprint([hydrogen], "projet", false, "Renommé")).not.toBe(
      original,
    );
    expect(reportFingerprint([hydrogen], "projet", false, " ABC ")).toBe(
      original,
    );
  });
});
