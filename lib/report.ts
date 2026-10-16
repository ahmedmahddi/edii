import { additionGroup, describe, nomenclature } from "./classify";
import {
  classifyEstablishment,
  encodeActivities,
  type Activity,
} from "./establishment";
import {
  eie,
  eieEntry,
  entriesFor,
  establishmentStudy,
  study,
  type Situation,
} from "./studies";

export const categoryLabel = (value: number | "NC" | null) =>
  value === null
    ? "À compléter"
    : value === "NC"
      ? "Non classé"
      : `${value}${value === 1 ? "ère" : "ème"} catégorie`;

export function reportFingerprint(
  activities: Activity[],
  situation: Situation,
  sensitive: boolean,
  name: string,
) {
  return JSON.stringify([
    encodeActivities(activities),
    situation,
    sensitive,
    name.trim(),
  ]);
}

export function createClassificationReport(
  activities: Activity[],
  situation: Situation,
  sensitive: boolean,
  name = "",
  generatedAt = new Date().toISOString(),
) {
  const establishment = classifyEstablishment(activities);
  const environment = establishmentStudy(
    activities.map((a) => a.eie),
    situation,
    sensitive,
  );
  const issues: string[] = [];
  if (!activities.length)
    issues.push("Ajoutez au moins une activité à votre établissement.");
  activities.forEach((activity, index) => {
    const result = establishment.results.find((r) => r.activity === activity);
    const prefix = `Activité ${index + 1} — rubrique ${activity.code}`;
    if (!result) issues.push(`${prefix} : rubrique inconnue.`);
    else if (result.classe === null)
      issues.push(
        `${prefix} : ${result.needsVariant ? "choisissez le cas applicable." : result.outcome?.status === "needs_quantity" ? "saisissez une quantité valide, positive ou nulle, et son unité." : result.outcome?.status === "choose" ? "précisez le cas applicable au classement." : (result.outcome?.reason ?? "complétez le classement.")}`,
      );
    if (!activity.eie || (activity.eie !== "none" && !eieEntry(activity.eie)))
      issues.push(
        `${prefix} : choisissez une entrée du décret ANPE ou « Aucune entrée propre ».`,
      );
  });
  if (
    issues.length ||
    establishment.classe === null ||
    !establishment.complete ||
    !environment.study
  )
    return { ok: false as const, issues };
  const entries = establishment.results.map((r, index) => {
    const selectedEntry = eieEntry(r.activity.eie);
    const suggested = entriesFor(r.rub.code, r.variant);
    const kind = environment.perActivity[index]!;
    const matched =
      r.outcome?.status === "classified"
        ? r.outcome.items
        : r.item
          ? [r.item]
          : [];
    return {
      number: index + 1,
      input: r.activity,
      rubrique: r.rub,
      section: r.rub.section ? nomenclature.sections[r.rub.section] : null,
      selectedCase: r.variant || "Cas général de la rubrique",
      quantity: r.activity.quantity?.trim() || null,
      unit: r.unit ?? null,
      canonicalQuantity: r.q,
      category: r.classe!,
      reason:
        r.outcome?.status === "classified"
          ? r.outcome.reason
          : r.activity.picked === -1
            ? "Aucun des cas proposés ne s’applique : activité non classée pour cette rubrique."
            : (r.item?.criterion ?? "Cas confirmé par l’utilisateur."),
      notes: r.outcome?.status === "classified" ? r.outcome.notes : [],
      additionGroup: additionGroup(r.rub.code),
      thresholds: r.rub.items.map((item, itemIndex) => ({
        ...item,
        number: itemIndex + 1,
        threshold: describe(item.condition),
        selected: matched.includes(item),
      })),
      environmentalEntry: selectedEntry ?? null,
      environmentalChoice: r.activity.eie!,
      environmentalStudy: study(kind, sensitive),
      entryConditions: suggested.suggested
        .filter((s) => s.entry.id === selectedEntry?.id)
        .map((s) => s.when),
      entryNote: suggested.note,
    };
  });
  const parameters = new URLSearchParams({ e: encodeActivities(activities) });
  if (situation !== "projet") parameters.set("s", situation);
  if (sensitive) parameters.set("z", "1");
  const report = {
    schemaVersion: 1,
    name: name.trim(),
    generatedAt,
    fingerprint: reportFingerprint(activities, situation, sensitive, name),
    situation,
    sensitive,
    establishment,
    environment,
    activities: entries,
    sources: nomenclature.sources,
    environmentalSource: {
      title: eie.title,
      reference: eie.source,
      annexes: eie.annexes,
    },
    restorationPath: `/?${parameters}`,
  };
  // Keep the validated report independent from subsequent edits to the working dossier.
  return { ok: true as const, report: structuredClone(report) };
}

export type ClassificationReport = Extract<
  ReturnType<typeof createClassificationReport>,
  { ok: true }
>["report"];
