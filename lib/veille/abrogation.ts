/**
 * Repeals: where a JORT text says that another text as a whole is repealed (abrogé), so that the
 * repealed text is no longer proposed to registers. Titles say it sometimes ("Décret … abrogeant le
 * décret n° …"); most often the body does, in its last articles:
 *
 *   "Est abrogé l'arrêté du Premier ministre du 30 janvier 1999, fixant …"
 *   "Sont abrogées les dispositions du décret n° 2008-452 du 18 février 2008 …"
 *   "Sont abrogées toutes les dispositions antérieures contraires …, notamment le décret n° 95-197 …"
 *   "Toutes les dispositions de l'arrêté du … susvisé sont abrogées."
 *   "Le présent arrêté abroge et remplace l'arrêté du …"
 *   "يلغى الأمر عدد … " / "تلغى أحكام القرار المؤرخ في …"
 *
 * A repeal of part of a text (an article, a paragraph, an annex) is not a repeal of the text: the
 * clause is kept only when the kind of text follows the verb directly. What is returned is the
 * clause from the repealed text's kind on ("décret n° 95-197 du 23 janvier 1995, fixant …"): the
 * référentiel reads its key from it (lib/registre/referentiel.ts).
 */
import { arFold, isArabic } from "./arabe";

const KIND = "(?:loi(?: organique)?|decret(?:-loi)?(?: gouvernemental| presidentiel)?|arrete(?: conjoint)?|decision|circulaire)";
const ART = "(?:le |la |les |l')?";
// The verb, then directly a whole text (not "l'article 6 de l'arrêté…").
const WHOLE = [
  new RegExp(`(?:est|sont) abroge(?:e|s|es)?,? ${ART}(?=${KIND}\\b)`),
  new RegExp(`(?:est|sont) abroge(?:e|s|es)? (?:toutes )?les dispositions (?:du |de la |de l'|des )(?=${KIND}\\b)`),
  new RegExp(`dispositions anterieures contraires[^.]{0,120}?notamment (?:les dispositions )?(?:du |de la |de l'|des |${ART})(?=${KIND}\\b)`),
  new RegExp(`abroge et remplace ${ART}(?=${KIND}\\b)`),
  new RegExp(`abrog(?:e|ea)nt (?:les dispositions )?(?:du |de la |de l'|des |${ART})(?=${KIND}\\b)`),
  new RegExp(`portant abrogation (?:des dispositions )?(?:du |de la |de l'|des )(?=${KIND}\\b)`),
];
// "Toutes les dispositions de l'arrêté du … susvisé sont abrogées": the text comes first.
const BEFORE = new RegExp(`toutes les dispositions (?:du |de la |de l'|des )(${KIND}\\b[^.;]{0,220}?) sont abrogees`);
const AR_WHOLE = /(?:يلغي|تلغي|الغاء|الغيت) (?:احكام )?(?=(?:ال)?(?:امر|قرار|قانون|مرسوم|منشور)(?![\u0600-\u06FF]))/;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ");

export interface Repeal {
  clause: string; // folded, from the repealed text's kind on: where its key is read
  line: string; // the sentence as printed, to show
  page: number | null; // JORT page, when known
}

/** The clauses of a text (a title, or a whole issue's text) that repeal another text as a whole. */
export function repealClauses(text: string, page: number | null = null): Repeal[] {
  const out = new Map<string, Repeal>();
  for (const raw of text.split(/\n+/)) {
    const line = raw.replace(/\*\*/g, "").replace(/\s+/g, " ").trim().slice(0, 320);
    if (isArabic(raw)) {
      const t = arFold(raw);
      for (const m of t.matchAll(new RegExp(AR_WHOLE.source, "g"))) {
        const clause = t.slice(m.index! + m[0].length, m.index! + m[0].length + 200);
        out.set(clause, { clause, line, page });
      }
      continue;
    }
    const t = fold(raw);
    if (!t.includes("abrog")) continue;
    const found = WHOLE.map((re) => re.exec(t)).filter((m): m is RegExpExecArray => !!m).map((m) => t.slice(m.index + m[0].length, m.index + m[0].length + 240));
    const before = BEFORE.exec(t);
    for (const clause of before ? [...found, before[1]] : found) out.set(clause, { clause, line, page });
  }
  return [...out.values()];
}
