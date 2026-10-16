/**
 * Classification of an establishment against the EDII nomenclature (établissements dangereux,
 * insalubres ou incommodes, Tunisia): 1ère, 2ème, 3ème catégorie or non classé.
 *
 * Pure and deterministic: the rules are the thresholds read from the official texts by
 * data/pipeline (OCR, then parsing), stored in data/nomenclature.json. Nothing here guesses.
 * When the text cannot be reduced to a number comparison, the outcome says so and lists the
 * cases for the user to choose from.
 */
import data from "@/data/nomenclature.json";

export type Category = 1 | 2 | 3;
export type Classe = Category | "NC";

export interface Condition {
  any?: boolean; // "quelle que soit la capacité"
  manual?: boolean; // several thresholds at once, or no unit: the reader decides
  min?: number;
  max?: number;
  min_inclusive?: boolean;
  max_inclusive?: boolean;
  unit?: string; // canonical unit, see UNITS
  unit_inferred?: boolean; // unit not printed on that line, taken from the other items
}

export interface Item {
  path: string[]; // enclosing cases, e.g. ["1) veaux de boucherie ou bovins à l'engraissement"]
  context: string | null; // e.g. "La capacité de production étant :"
  criterion: string; // the line that carries the category
  category: Category;
  condition: Condition | null; // null: a qualitative case (e.g. "1) à chaud")
  ref: string; // source, PDF page and position, to check against the scan
}

export interface Rubrique {
  code: string; // "1101", "2722 bis 1"
  section: string | null; // "1100"
  title: string;
  text: string;
  items: Item[];
  kind: "activity" | "definition";
  source: string; // "2005", "2010", "2012"
  ref: string | null;
  amended_by?: string[];
  replaces?: string;
}

export interface Nomenclature {
  title: string;
  sources: { id: string; title: string; jort: string; role: string }[];
  categories: Record<string, string>;
  sections: Record<string, string>;
  rubriques: Rubrique[];
}

export const nomenclature = data as unknown as Nomenclature;

/** Units a user can enter, with the canonical unit and factor used by the nomenclature. */
export const UNITS: Record<string, [string, number]> = {
  kg: ["kg", 1],
  t: ["kg", 1000],
  g: ["kg", 0.001],
  m3: ["m3", 1],
  l: ["m3", 0.001],
  hl: ["m3", 0.1],
  "t/j": ["t/j", 1],
  "kg/j": ["t/j", 0.001],
  "t/h": ["t/j", 24],
  "kg/h": ["t/j", 0.024],
  "t/an": ["t/an", 1],
  "kg/an": ["t/an", 0.001],
  "m3/j": ["m3/j", 1],
  "l/j": ["m3/j", 0.001],
  "m3/h": ["m3/h", 1],
  "l/h": ["m3/h", 0.001],
  "hl/an": ["hl/an", 1],
  "hl/j": ["hl/j", 1],
  kW: ["kW", 1],
  MW: ["kW", 1000],
  W: ["kW", 0.001],
  m2: ["m2", 1],
  ha: ["m2", 10000],
  MBq: ["GBq", 0.001],
  GBq: ["GBq", 1],
  TBq: ["GBq", 1000],
};

/** Convert a quantity to the nomenclature's canonical unit. Counted units (animaux, vaches…) pass through. */
export function toCanonical(value: number, unit: string): { value: number; unit: string } {
  const known = UNITS[unit];
  return known ? { value: value * known[1], unit: known[0] } : { value, unit };
}

/** The units a user may type for a rubrique: every written unit that converts to one it uses. */
export function inputUnits(rub: Rubrique): string[] {
  const used = new Set(rub.items.map((i) => i.condition?.unit).filter((u): u is string => !!u));
  const out: string[] = [];
  for (const unit of used) {
    const written = Object.entries(UNITS).filter(([, [canon]]) => canon === unit).map(([u]) => u);
    out.push(...(written.length ? written : [unit]));
  }
  return out;
}

export function matches(c: Condition, value: number): boolean {
  if (c.any) return true;
  if (c.min !== undefined && (c.min_inclusive ? value < c.min : value <= c.min)) return false;
  if (c.max !== undefined && (c.max_inclusive ? value > c.max : value >= c.max)) return false;
  return c.min !== undefined || c.max !== undefined;
}

const numeric = (i: Item) =>
  !!i.condition && !i.condition.manual && !i.condition.any && !!i.condition.unit && (i.condition.min !== undefined || i.condition.max !== undefined);

/** The cases of a rubrique a user can pick between: one per distinct path (e.g. "1) veaux…", "2) vaches…"). */
export function variants(rub: Rubrique): string[] {
  return [...new Set(rub.items.map((i) => i.path.join(" › ")))];
}

export type Outcome =
  | { status: "classified"; classe: Classe; items: Item[]; reason: string; notes: string[] }
  | { status: "choose"; items: Item[]; reason: string; belowAll: boolean }
  | { status: "needs_quantity"; units: string[]; reason: string }
  | { status: "unit_mismatch"; units: string[]; reason: string }
  | { status: "definition"; related: string[]; reason: string };

export interface Input {
  quantity?: number;
  unit?: string;
  variant?: string; // one of variants(rub)
}

export function classify(rub: Rubrique, input: Input = {}): Outcome {
  if (rub.kind === "definition" || rub.items.length === 0) {
    const base = rub.code.split(" ")[0];
    const related = nomenclature.rubriques.filter((r) => r.code !== rub.code && r.code.startsWith(`${base} bis`)).map((r) => r.code);
    return {
      status: "definition",
      related,
      reason: "Cette rubrique définit une famille de substances ; le classement se lit dans les rubriques qui y renvoient.",
    };
  }
  const items = input.variant === undefined ? rub.items : rub.items.filter((i) => i.path.join(" › ") === input.variant);
  const textual = items.filter((i) => !numeric(i));
  const quantitative = items.filter(numeric);
  const notes: string[] = [];
  if (items.some((i) => i.condition?.unit_inferred)) {
    notes.push("Une unité a été déduite des autres lignes de la rubrique (absente ou illisible sur la ligne) : vérifier au texte officiel.");
  }

  if (quantitative.length === 0 || input.quantity === undefined) {
    const cats = new Set(items.map((i) => i.category));
    if (textual.length === items.length && cats.size === 1 && !items.some((i) => i.condition?.manual)) {
      const reason = items.length === 1 ? "La rubrique classe l'activité sans seuil." : "Tous les cas de la rubrique donnent la même catégorie.";
      return { status: "classified", classe: items[0].category, items, reason, notes };
    }
    if (quantitative.length === 0) {
      return { status: "choose", items, reason: "Le classement dépend de la nature de l'activité : choisir le cas qui s'applique.", belowAll: false };
    }
    return {
      status: "needs_quantity",
      units: inputUnits({ ...rub, items: quantitative }),
      reason: "Le classement dépend d'un seuil : indiquer la quantité ou la capacité.",
    };
  }

  const q = toCanonical(input.quantity, input.unit ?? "");
  const comparable = quantitative.filter((i) => i.condition!.unit === q.unit);
  if (comparable.length === 0) {
    const units = inputUnits({ ...rub, items: quantitative });
    return { status: "unit_mismatch", units, reason: `Les seuils de cette rubrique sont exprimés en ${units.join(", ")}.` };
  }
  const hit = comparable.filter((i) => matches(i.condition!, q.value));
  const cats = new Set(hit.map((i) => i.category));
  // Cases the quantity cannot decide (textual, or measured in another unit). Without a chosen
  // variant, only those in the same branch as the comparable thresholds compete with them.
  const undecided = items.filter((i) => !comparable.includes(i));
  const key = (i: Item) => i.path.join(" › ");
  const branches = new Set(comparable.map(key));
  const competing = input.variant !== undefined || variants(rub).length === 1 ? undecided : undecided.filter((i) => branches.has(key(i)));

  if (hit.length > 0 && cats.size === 1 && competing.length === 0) {
    const branch = key(hit[0]);
    if (input.variant === undefined && variants(rub).length > 1 && branch) notes.push(`Classement établi pour le cas : ${branch}.`);
    return { status: "classified", classe: hit[0].category, items: hit, reason: `${fmt(input.quantity, input.unit)} : ${hit[0].criterion}`, notes };
  }
  if (hit.length === 0 && competing.length === 0) {
    const lowest = Math.min(...comparable.map((i) => i.condition!.min ?? 0));
    return {
      status: "classified",
      classe: "NC",
      items: [],
      reason: `${fmt(input.quantity, input.unit)} est en dessous du plus petit seuil de la rubrique (${fmtCanon(lowest, q.unit)}) : établissement non classé au titre de cette rubrique.`,
      notes,
    };
  }
  return {
    status: "choose",
    items: [...hit, ...competing],
    belowAll: hit.length === 0,
    reason:
      hit.length === 0
        ? "La quantité est sous tous les seuils chiffrés, mais la rubrique prévoit d'autres cas : vérifier s'ils s'appliquent, sinon non classé."
        : "Plusieurs cas de la rubrique peuvent s'appliquer : choisir celui qui correspond à l'activité.",
  };
}

const fmt = (v: number, unit?: string) => `${v.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`;
const fmtCanon = (v: number, unit: string) => (unit === "kg" && v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR")} t` : fmt(v, unit));

export function describe(c: Condition | null): string {
  if (!c) return "selon le cas décrit";
  if (c.any) return "quelle que soit la quantité";
  if (c.manual) return "voir le texte";
  const parts: string[] = [];
  if (c.min !== undefined) parts.push(`${c.min_inclusive ? "≥" : ">"} ${fmtCanon(c.min, c.unit ?? "")}`);
  if (c.max !== undefined) parts.push(`${c.max_inclusive ? "≤" : "<"} ${fmtCanon(c.max, c.unit ?? "")}`);
  return parts.join(" et ");
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .toLowerCase();

const INDEX = nomenclature.rubriques.map((r) => ({
  rub: r,
  code: r.code.toLowerCase(),
  title: fold(r.title),
  body: fold(`${r.text} ${r.items.map((i) => `${i.path.join(" ")} ${i.criterion}`).join(" ")} ${r.section ? nomenclature.sections[r.section] ?? "" : ""}`),
}));

/** Rubriques matching a code ("2505", "2722 bis") or words ("peroxydes", "élevage bovins"), best first. */
export function search(query: string, limit = 30): Rubrique[] {
  const q = fold(query.trim());
  if (!q) return [];
  if (/^\d/.test(q)) return INDEX.filter((e) => e.code.startsWith(q)).slice(0, limit).map((e) => e.rub);
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return INDEX.map((e) => {
    let score = 0;
    for (const w of words) {
      if (e.title.includes(w)) score += 3;
      else if (e.body.includes(w)) score += 1;
      else return { e, score: 0 };
    }
    return { e, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.code.localeCompare(b.e.code))
    .slice(0, limit)
    .map((x) => x.e.rub);
}

export function rubrique(code: string): Rubrique | undefined {
  return nomenclature.rubriques.find((r) => r.code === code);
}

/**
 * Arrêté du 23 février 2010, art. 2 bis: substances of one group are added up, Σ qx/Qx > 1 moves
 * the establishment to the next higher category. The rule is shown, not computed (yet).
 */
export const ADDITION_GROUPS: { group: number; codes: (code: string) => boolean }[] = [
  {
    group: 1,
    codes: (c) => ["2703", "2704", "2706", "2708", "2722 bis 1", "2722 bis 2", "2723", "2724 bis 1", "2724 bis 2", "2725", "2726"].includes(c),
  },
  { group: 2, codes: (c) => ["2711", "2712", "2713", "2715", "2720"].includes(c) },
  {
    group: 3,
    codes: (c) => {
      const n = Number(c.slice(0, 4));
      if (c.startsWith("21")) return true;
      if (n >= 2402 && n <= 2408) return true;
      return c.startsWith("25") && !["2503", "2506", "2507 bis", "2514", "2516"].includes(c);
    },
  },
];

export function additionGroup(code: string): number | null {
  return ADDITION_GROUPS.find((g) => g.codes(code))?.group ?? null;
}
