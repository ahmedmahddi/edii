import { describe, expect, it } from "vitest";
import { REFERENTIEL } from "@/lib/registre/referentiel";
import { lastIssue, served, withLiveIssues } from "@/lib/veille/served";
import { assess, type Feed, type Hit } from "@/lib/veille/watch";

const hit = (id: string, date: string, title: string): Hit => {
  const [year, issue, page] = id.split("-").map(Number);
  return { id, year: year!, issue: issue!, date, pdf: "", page: page!, institution: null, kind: "Décret", title, ...assess({ title })! };
};

describe("what the site serves of the veille", () => {
  const titre = "Décret n° 2026-12 du 2 mars 2026, modifiant le décret n° 2000-147 du 24 janvier 2000, fixant les règles techniques d'équipement et d'aménagement des véhicules";
  const feed: Feed = {
    updated: "2026-11-10T08:00:00Z",
    scanned: { "2025": [1, 140], "2026": [3, 109] },
    hits: [hit("2026-30-800-1", "2026-03-04", titre), hit("2026-109-2500-2", "2026-11-10", titre.replace("2026-12", "2026-90").replace("2 mars", "8 novembre")), hit("2025-20-100-1", "2025-02-10", titre.replace("2026-12", "2025-5"))],
  };

  it("keeps in meta only the texts of the last months, newest first", () => {
    const { meta } = served(feed);
    expect(meta.recent.map((h) => h.id)).toEqual(["2026-109-2500-2"]);
    expect(meta.scanned).toBe(feed.scanned);
  });

  it("builds the catalogue once: the référentiel and the texts found", () => {
    const { catalogue } = served(feed);
    expect(catalogue.length).toBeGreaterThan(REFERENTIEL.length);
    expect(catalogue.some((t) => t.id === "jort-2026-109-2500-2")).toBe(true);
  });

  it("names the last issue read", () => {
    expect(lastIssue(feed.scanned)).toEqual({ year: 2026, number: 109 });
    expect(lastIssue({})).toBeNull();
  });

  it("adds the issues read in this browser: their texts, and the amendments they bring", () => {
    const base = served(feed);
    const entry = { page: 3001, pdfPage: 1, institution: "Ministère du Transport", title: titre.replace("2026-12", "2026-95").replace("2 mars", "12 novembre") };
    const live = withLiveIssues(base, [{ year: 2026, number: 110, issue: { number: 110, date: "2026-11-13", firstPage: 3000, entries: [entry] } as never }]);
    expect(live.meta.scanned["2026"]).toContain(110);
    expect(live.meta.recent[0]!.issue).toBe(110);
    expect(live.catalogue.length).toBe(base.catalogue.length + 1);
    expect(live.amendements.length).toBeGreaterThanOrEqual(base.amendements.length);
    // An issue already served changes nothing.
    expect(withLiveIssues(base, [{ year: 2026, number: 109, issue: { number: 109, date: null, firstPage: 1, entries: [] } }])).toBe(base);
  });
});
