/**
 * A validated classification on its way to a new register: the classification screen leaves it
 * here and opens /registres/nouveau, which takes it. Kept for the tab's life (sessionStorage), so a
 * reload of the new register's page does not lose it. `classement` is the classification kept
 * (lib/classement), to link both ways.
 */
import type { ClassificationReport } from "@/lib/report";

const KEY = "abclassement-seed";

export interface Seed {
  report: ClassificationReport;
  classement: string | null;
}

export function setPendingSeed(report: ClassificationReport, classement: string | null = null): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ report, classement } satisfies Seed));
  } catch {
    // too large or blocked: the register starts without it
  }
}

export function takePendingSeed(): Seed | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Seed | ClassificationReport;
    // Left by a version before the classifications were kept: the report alone.
    return "report" in v ? v : { report: v as ClassificationReport, classement: null };
  } catch {
    return null;
  }
}
