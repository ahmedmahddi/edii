import { describe, expect, it } from "vitest";
import { MAX_IDS, parseIds } from "@/lib/veille/fiches-server";

describe("the fiches asked for", () => {
  it("keeps valid ids, once, at most a hundred", () => {
    expect(parseIds("ref-1, jort-2026-109-2500-2,ref-1,../etc,")).toEqual(["ref-1", "jort-2026-109-2500-2"]);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds(Array.from({ length: 150 }, (_, i) => `t${i}`).join(","))).toHaveLength(MAX_IDS);
  });
});
