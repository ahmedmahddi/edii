import { Badge } from "@/app/ui";
import { CONFORMITES, type Conformite } from "@/lib/registre/registre";

/** A text's conformity, as a word and a colour. */
export function ConformiteBadge({ c }: { c: Conformite }) {
  return (
    <Badge tone={c === "C" ? "success" : c === "NC" ? "danger" : c === "NA" ? "neutral" : "warning"} dot>
      {c ? CONFORMITES[c] : "À évaluer"}
    </Badge>
  );
}
