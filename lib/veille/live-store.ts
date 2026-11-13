/**
 * Issues read with "Vérifier maintenant", kept in this browser until a deployment carries them (the
 * daily run stores them in the repository). Per browser: another computer checks again.
 */
import type { LiveCheck, LiveIssue } from "@/lib/veille/live";

const KEY = "abclassement-veille-direct";
export const LIVE_CHANGED = "abclassement-veille-direct";

let cache: { raw: string | null; issues: LiveIssue[] } = { raw: null, issues: [] };

export function liveIssues(): LiveIssue[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return [];
  }
  // The same array while nothing changed: React compares snapshots by identity.
  if (raw === cache.raw) return cache.issues;
  try {
    cache = { raw, issues: (JSON.parse(raw ?? "null") as LiveCheck | null)?.issues ?? [] };
  } catch {
    cache = { raw, issues: [] };
  }
  return cache.issues;
}

export function saveLive(check: LiveCheck): void {
  // Added to what an earlier check found, by year and number.
  const byKey = new Map(liveIssues().map((i) => [`${i.year}-${i.number}`, i]));
  for (const i of check.issues) if (i.issue || !byKey.get(`${i.year}-${i.number}`)?.issue) byKey.set(`${i.year}-${i.number}`, i);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...check, issues: [...byKey.values()] }));
  } catch {
    // private window: the texts found show for this visit only
  }
  window.dispatchEvent(new Event(LIVE_CHANGED));
}

export function subscribeLive(onChange: () => void): () => void {
  window.addEventListener(LIVE_CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab
  return () => {
    window.removeEventListener(LIVE_CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}
