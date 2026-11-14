import { describe, expect, it } from "vitest";
import { journal, PAGE_SIZE, parseQuery } from "@/lib/veille/journal";
import type { Hit } from "@/lib/veille/watch";

const hit = (n: number, extra: Partial<Hit> = {}): Hit =>
  ({
    id: `2026-${n}-1-0`,
    year: 2026,
    issue: n,
    date: "2026-01-01",
    pdf: "",
    page: 1,
    institution: "Ministère de l'Industrie",
    kind: "Arrêté",
    title: `Arrêté n° ${n} relatif aux établissements`,
    severity: n % 3 === 0 ? "critique" : n % 3 === 1 ? "important" : "information",
    domains: [n % 2 ? "etablissements-classes" : "eau"],
    sectors: n % 2 ? ["1200"] : [],
    impacts: [],
    matches: [],
    ...extra,
  }) as Hit;

describe("the journal, filtered and paged by the server", () => {
  const all = Array.from({ length: 60 }, (_, i) => hit(i + 1));

  it("gives the newest first, a page at a time, with the counts of the whole journal", () => {
    const p = journal(all, {});
    expect(p.total).toBe(60);
    expect(p.hits).toHaveLength(PAGE_SIZE);
    expect(p.hits[0]!.issue).toBe(60);
    expect(p.pages).toBe(3);
    expect(journal(all, { page: 2 }).hits).toHaveLength(60 - 2 * PAGE_SIZE);
    expect(p.counts).toEqual({ critique: 20, important: 20, information: 20, aLire: 60 });
    expect(p.domaines.sort()).toEqual(["eau", "etablissements-classes"]);
  });

  it("filters by level, domain, sector, words and this browser's statuses", () => {
    expect(journal(all, { niveau: "critique" }).total).toBe(20);
    expect(journal(all, { niveau: "important" }).total).toBe(40);
    expect(journal(all, { domaine: "eau" }).total).toBe(30);
    expect(journal(all, { secteur: "1200" }).total).toBe(30);
    expect(journal(all, { q: "arrete n° 7 " }).hits.map((h) => h.issue)).toEqual([7]);
    const statuts = { [all[0]!.id]: "pertinent" as const, [all[1]!.id]: "sans-objet" as const };
    expect(journal(all, { statut: "pertinent", statuts }).total).toBe(1);
    expect(journal(all, { statut: "a-lire", statuts }).total).toBe(58);
    expect(journal(all, { statuts }).counts.aLire).toBe(58);
    expect(journal(all, { tout: true }).hits).toHaveLength(60);
  });

  it("reads only what it expects from a request", () => {
    expect(parseQuery({ q: "eau", niveau: "x", statut: "pertinent", statuts: { a: "pertinent", b: "oui" }, page: "2", tout: "yes" })).toEqual({
      q: "eau",
      niveau: "tous",
      domaine: undefined,
      secteur: undefined,
      statut: "pertinent",
      statuts: { a: "pertinent" },
      page: 0,
      tout: false,
    });
    expect(parseQuery(null).niveau).toBe("tous");
  });
});
