/** How registers and texts are named on screen: dates, category, a text's reference. */
import type { Texte } from "@/lib/registre/referentiel";
import type { Registre } from "@/lib/registre/registre";
import { categoryLabel } from "@/lib/report";

export const dateFr = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
export const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
// A register made without a classification has no rubrique: "À compléter" would mislead.
export const classLabel = (classe: Registre["classe"], rubriques: number) => (classe === null && !rubriques ? "Sans classement" : categoryLabel(classe));
export const refOf = (t: Texte) => [t.type, t.numero ? `n° ${t.numero}` : "", t.date ? `du ${dateFr(t.date)}` : ""].filter(Boolean).join(" ");
/** A person's initials, from a name or an e-mail address. */
export const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
