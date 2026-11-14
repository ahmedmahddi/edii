/** What the classification's parts share: the category badge and how quantities, lists and decree entries are written. */
import type { Classe, Item } from "@/lib/classify";
import { nomenclature } from "@/lib/classify";
import { Badge, type Tone } from "@/app/ui";

export const LABEL: Record<string, string> = { "1": "1ère catégorie", "2": "2ème catégorie", "3": "3ème catégorie", NC: "Non classé" };
const TONE: Record<string, Tone> = { "1": "danger", "2": "warning", "3": "accent", NC: "neutral" };
export const ordinal = (c: Classe) => (c === "NC" ? "non classé" : `${c}${c === 1 ? "ère" : "ème"}`);

export function ClasseBadge({ classe }: { classe: Classe }) {
  return (
    <Badge tone={TONE[String(classe)]} dot>
      {LABEL[String(classe)]}
    </Badge>
  );
}

export const listFr = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`);

export function fmtQty(v: number, unit: string) {
  if (unit === "kg" && v >= 1000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} t`;
  return `${v.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ${unit}`;
}

export const entryRef = (id: string) => (id.startsWith("CDC") ? `Annexe 2, n° ${id.slice(3)}` : `Annexe 1 cat. ${id[0]}, n° ${id.slice(1)}`);
export function entryLabel(id: string, text: string) {
  const short = text.length > 110 ? `${text.slice(0, 110)}…` : text;
  return `${entryRef(id)} · ${short}`;
}

const SOURCE = Object.fromEntries(nomenclature.sources.map((s) => [s.id, s]));
export function sourceOf(it: Item): string {
  const id = it.ref.split(" ")[0]!;
  const s = SOURCE[id];
  const page = it.ref.match(/p\.(\d+)/)?.[1];
  return s ? `${s.title.split(",")[0]} (${s.jort})${page ? `, page ${page} du PDF` : ""}` : it.ref;
}
