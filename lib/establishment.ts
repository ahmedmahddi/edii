/**
 * Classification of a whole establishment: several activities (rubriques), each with its case and
 * quantity, plus the addition rule.
 *
 * - Décret n° 2006-2687, art. 5: an establishment with several classified activities makes a
 *   single request and gets a single authorisation, so it follows its most severe category.
 * - Arrêté du 23 février 2010, art. 2 bis (règle d'addition): when an establishment stores or uses
 *   two or more substances of the same group, Σ qx/Qx > 1 classes it "dans la catégorie
 *   supérieure qui suit". qx is the quantity held; Qx is the nomenclature threshold. We take Qx at
 *   the category just above the group's current one: at its own category, each classified
 *   substance alone would already reach 1 and the rule would always apply.
 */
import {
  additionGroup,
  type Category,
  type Classe,
  classify,
  inputUnits,
  type Item,
  type Outcome,
  type Rubrique,
  rubrique,
  toCanonical,
  variants,
} from "./classify";

export interface Activity {
  code: string;
  variant?: number; // index in variants(rubrique)
  quantity?: string; // as typed: "1 500", "2,5"
  unit?: string;
  picked?: number; // index in rubrique.items of the case the user chose; -1: none of them applies
  eie?: string; // entry of décret n° 2005-1991 ("A14", "CDC8"…), or "none" when in neither annex
}

export interface ActivityResult {
  activity: Activity;
  rub: Rubrique;
  variant: string | undefined;
  units: string[]; // units the user can enter for this case
  unit: string | undefined; // the one in use
  needsVariant: boolean;
  outcome: Outcome | null; // null until the case is chosen
  classe: Classe | null; // null: more input needed
  item: Item | null; // the line of the nomenclature that decided
  q: { value: number; unit: string } | null; // quantity in the canonical unit
}

export interface AdditionMember {
  result: ActivityResult;
  Q: number | null; // threshold of the target category, canonical unit
  ratio: number | null;
  note?: string;
}

export interface AdditionResult {
  group: number;
  base: Classe; // most severe category of the group's substances taken one by one
  target: Category | null; // the category just above; null when already 1ère
  members: AdditionMember[];
  sum: number;
  upgraded: boolean;
  reason: string;
}

export interface EstablishmentResult {
  results: ActivityResult[];
  additions: AdditionResult[];
  classe: Classe | null;
  complete: boolean; // every activity has a category
  decidedBy: string[]; // what gives the final category
}

/** 1 is the most severe, then 2, 3, and NC. */
export const severity = (c: Classe) => (c === "NC" ? 4 : c);
const mostSevere = (cs: Classe[]): Classe | null => (cs.length ? cs.reduce((a, b) => (severity(b) < severity(a) ? b : a)) : null);

export function parseQuantity(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function classifyActivity(activity: Activity): ActivityResult | null {
  const rub = rubrique(activity.code);
  if (!rub) return null;
  const cases = variants(rub);
  const variant = cases.length === 1 ? cases[0] : activity.variant !== undefined ? cases[activity.variant] : undefined;
  const scope = variant === undefined ? rub : { ...rub, items: rub.items.filter((i) => i.path.join(" › ") === variant) };
  const units = inputUnits(scope);
  const unit = activity.unit && units.includes(activity.unit) ? activity.unit : units[0];
  const quantity = parseQuantity(activity.quantity);
  const q = quantity !== undefined && unit ? toCanonical(quantity, unit) : null;
  const base = { activity, rub, variant, units, unit, q, item: null, classe: null };
  if (rub.kind === "activity" && cases.length > 1 && variant === undefined) {
    return { ...base, needsVariant: true, outcome: null };
  }
  const outcome = classify(rub, { variant, quantity, unit });
  if (outcome.status === "classified") {
    return { ...base, needsVariant: false, outcome, classe: outcome.classe, item: outcome.items[0] ?? null };
  }
  if (outcome.status === "choose" && activity.picked !== undefined) {
    if (activity.picked === -1 && outcome.belowAll) return { ...base, needsVariant: false, outcome, classe: "NC" };
    const item = rub.items[activity.picked];
    if (item && outcome.items.includes(item)) return { ...base, needsVariant: false, outcome, classe: item.category, item };
  }
  return { ...base, needsVariant: false, outcome };
}

/** Lowest quantity that puts this activity in `target`, in the canonical unit of its quantity. */
function threshold(r: ActivityResult, target: Category): number | null {
  if (!r.q) return null;
  const scope = r.variant === undefined ? r.rub.items : r.rub.items.filter((i) => i.path.join(" › ") === r.variant);
  const mins = scope
    .filter((i) => i.category === target && i.condition && !i.condition.manual && i.condition.unit === r.q!.unit && i.condition.min !== undefined)
    .map((i) => i.condition!.min!);
  return mins.length ? Math.min(...mins) : null;
}

export function additionRule(results: ActivityResult[]): AdditionResult[] {
  const byGroup = new Map<number, ActivityResult[]>();
  for (const r of results) {
    const g = additionGroup(r.rub.code);
    if (g !== null && r.classe !== null) byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
  }
  const out: AdditionResult[] = [];
  for (const [group, rs] of [...byGroup].sort(([a], [b]) => a - b)) {
    if (rs.length < 2) continue; // the rule needs two or more types of substances
    const base = mostSevere(rs.map((r) => r.classe!))!;
    const target: Category | null = base === 1 ? null : base === "NC" ? 3 : ((base - 1) as Category);
    if (target === null) {
      out.push({ group, base, target, members: rs.map((result) => ({ result, Q: null, ratio: null })), sum: 0, upgraded: false, reason: "Le groupe est déjà en 1ère catégorie : la règle ne peut pas le classer plus haut." });
      continue;
    }
    const members: AdditionMember[] = rs.map((result) => {
      if (!result.q) return { result, Q: null, ratio: null, note: "quantité non saisie" };
      const Q = threshold(result, target);
      if (Q === null || Q <= 0) return { result, Q: null, ratio: null, note: `pas de seuil de ${target}${target === 1 ? "ère" : "ème"} catégorie pour ce cas` };
      return { result, Q, ratio: result.q.value / Q };
    });
    const sum = members.reduce((s, m) => s + (m.ratio ?? 0), 0);
    const upgraded = sum > 1 + 1e-9;
    const label = `${target}${target === 1 ? "ère" : "ème"} catégorie`;
    out.push({
      group,
      base,
      target,
      members,
      sum,
      upgraded,
      reason: upgraded
        ? `Σ qx/Qx = ${fmtRatio(sum)} > 1 : l'établissement est classé en ${label}.`
        : `Σ qx/Qx = ${fmtRatio(sum)} ≤ 1 : la règle ne change pas le classement.`,
    });
  }
  return out;
}

export const fmtRatio = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

export function classifyEstablishment(activities: Activity[]): EstablishmentResult {
  const results = activities.map(classifyActivity).filter((r): r is ActivityResult => r !== null);
  const additions = additionRule(results);
  const candidates: { classe: Classe; why: string }[] = [
    ...results.filter((r) => r.classe !== null).map((r) => ({ classe: r.classe!, why: `rubrique ${r.rub.code}` })),
    ...additions.filter((a) => a.upgraded).map((a) => ({ classe: a.target!, why: `règle d'addition, groupe ${a.group}` })),
  ];
  const classe = mostSevere(candidates.map((c) => c.classe));
  return {
    results,
    additions,
    classe,
    complete: results.length > 0 && results.every((r) => r.classe !== null),
    decidedBy: classe === null ? [] : candidates.filter((c) => c.classe === classe).map((c) => c.why),
  };
}

/** Compact, URL-safe form of the activity list: "1101~0~120~animaux~~CDC8|2502~~5~t~~none". */
export function encodeActivities(list: Activity[]): string {
  const clean = (s: string | number | undefined) => (s === undefined ? "" : String(s).replace(/[~|]/g, ""));
  return list.map((a) => [a.code, a.variant, a.quantity, a.unit, a.picked, a.eie].map(clean).join("~").replace(/~+$/, "")).join("|");
}

export function decodeActivities(s: string | null): Activity[] {
  if (!s) return [];
  const int = (x: string | undefined) => (x === undefined || x === "" || !/^-?\d+$/.test(x) ? undefined : Number(x));
  return s
    .split("|")
    .map((part) => part.split("~"))
    .filter(([code]) => !!code && !!rubrique(code))
    .map(([code, variant, quantity, unit, picked, eie]) => ({
      code,
      variant: int(variant),
      quantity: quantity || undefined,
      unit: unit || undefined,
      picked: int(picked),
      eie: eie || undefined,
    }));
}
