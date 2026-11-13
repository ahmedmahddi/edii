/**
 * A validated classification on its way to a new register: the classification screen leaves it
 * here and opens /registres/nouveau, which takes it. Kept for the tab's life (sessionStorage), so a
 * reload of the new register's page does not lose it.
 */
import type { ClassificationReport } from "@/lib/report";

const KEY = "abclassement-seed";

export function setPendingSeed(report: ClassificationReport): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(report));
  } catch {
    // too large or blocked: the register starts without it
  }
}

export function takePendingSeed(): ClassificationReport | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as ClassificationReport) : null;
  } catch {
    return null;
  }
}
