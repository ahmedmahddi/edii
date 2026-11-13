/**
 * The fiches on the server: read once per instance from data/build/fiches.json (written by
 * npm run veille --reassess), then given text by text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FicheData } from "@/lib/veille/fiche";

let fiches: Record<string, FicheData> | null = null;

export function allFiches(): Record<string, FicheData> {
  if (!fiches) {
    try {
      fiches = JSON.parse(readFileSync(path.join(process.cwd(), "data", "build", "fiches.json"), "utf8")) as Record<string, FicheData>;
    } catch {
      fiches = {}; // not built: the texts show their proposed requirements only
    }
  }
  return fiches;
}

export const MAX_IDS = 100;
const ID = /^[\w.-]{1,120}$/;

/** The ids asked for: valid ones only, at most MAX_IDS, without repeats. */
export function parseIds(raw: string | null): string[] {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => ID.test(s)))].slice(0, MAX_IDS);
}

export function fichesOf(ids: string[]): Record<string, FicheData> {
  const all = allFiches();
  return Object.fromEntries(ids.filter((id) => id in all).map((id) => [id, all[id]!]));
}
