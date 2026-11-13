/**
 * Two people changed the same register: their changes combined (a three-way merge). `base` is the
 * copy both started from, `mine` the one being saved, `theirs` the one saved meanwhile.
 *
 * - A field changed on one side only takes that side's value.
 * - A text (line) changed on both sides is merged field by field; a field changed on both sides
 *   keeps the one evaluated last (the line's latest evaluation), or mine.
 * - Evaluations, evidence and JORT modifications seen are kept from both sides (by id).
 * - A text added on either side is kept.
 */
import type { Evaluation, Ligne, Preuve, Registre } from "./registre";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function unionBy<T>(a: T[] = [], b: T[] = [], key: (x: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const x of [...a, ...b]) if (!seen.has(key(x))) seen.set(key(x), x);
  return [...seen.values()];
}

const latest = (l: Ligne) => (l.historique ?? []).reduce((m, e) => (e.enregistre > m ? e.enregistre : m), "");

export function mergeLigne(base: Ligne | undefined, mine: Ligne, theirs: Ligne): Ligne {
  if (same(mine, theirs)) return mine;
  if (base && same(mine, base)) return theirs;
  if (base && same(theirs, base)) return mine;
  // Both changed it: field by field. When both changed a field, the side evaluated last wins.
  const mineLast = latest(mine) >= latest(theirs);
  const out: Record<string, unknown> = { ...theirs };
  const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  for (const k of keys) {
    const m = (mine as unknown as Record<string, unknown>)[k];
    const t = (theirs as unknown as Record<string, unknown>)[k];
    const b = base ? (base as unknown as Record<string, unknown>)[k] : undefined;
    if (same(m, t)) out[k] = m;
    else if (base && same(m, b)) out[k] = t;
    else if (base && same(t, b)) out[k] = m;
    else out[k] = mineLast ? m : t;
  }
  const merged = out as unknown as Ligne;
  merged.historique = unionBy<Evaluation>(mine.historique, theirs.historique, (e) => e.id).sort((a, b) => a.enregistre.localeCompare(b.enregistre));
  merged.preuves = unionBy<Preuve>(mine.preuves, theirs.preuves, (p) => p.id);
  merged.vus = unionBy(mine.vus, theirs.vus, (v) => v);
  if (!merged.historique.length) delete merged.historique;
  if (!merged.preuves.length) delete merged.preuves;
  // Conformity and its date follow the latest evaluation when both sides evaluated.
  const last = merged.historique?.at(-1);
  if (last && !same(mine.historique, theirs.historique)) {
    merged.conformite = last.conformite;
    merged.evalue = last.date;
  }
  return merged;
}

export function mergeRegistre(base: Registre | undefined, mine: Registre, theirs: Registre): Registre {
  if (same(mine, theirs)) return mine;
  if (base && same(mine, base)) return theirs;
  if (base && same(theirs, base)) return mine;
  const field = <K extends keyof Registre>(k: K): Registre[K] => (base && same(mine[k], base[k]) ? theirs[k] : mine[k]);
  const baseLines = new Map((base?.lignes ?? []).map((l) => [l.texte.id, l]));
  const mineLines = new Map(mine.lignes.map((l) => [l.texte.id, l]));
  const theirIds = new Set(theirs.lignes.map((l) => l.texte.id));
  const lignes = [
    ...theirs.lignes.map((t) => {
      const m = mineLines.get(t.texte.id);
      return m ? mergeLigne(baseLines.get(t.texte.id), m, t) : t;
    }),
    ...mine.lignes.filter((m) => !theirIds.has(m.texte.id)),
  ];
  return {
    ...theirs,
    nom: field("nom"),
    classe: field("classe"),
    etude: field("etude"),
    situation: field("situation"),
    activites: field("activites"),
    restauration: field("restauration"),
    site: field("site"),
    lignes,
    ecartes: unionBy(mine.ecartes, theirs.ecartes, (x) => x),
    maj: mine.maj > theirs.maj ? mine.maj : theirs.maj,
  };
}
