/**
 * Arabic titles. A few issues of the French collection of jort.tn are in fact the Arabic edition
 * (2019, 2023, 2026…): their sommaire is read in Arabic rather than lost. This module turns what
 * an Arabic title says into what the rest of the veille knows: kind of text, number, date, and the
 * texts it cites, written as a French title would ("décret n° 2005-1991", "arrêté du 28 novembre
 * 1995"), so that rules, keys and amendments work the same way.
 */

/** Arabic letters: an Arabic title, an Arabic page. */
export const ARABIC = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const isArabic = (s: string) => ARABIC.test(s);
/** More Arabic letters than Latin ones: an Arabic page (a French one may carry a few Arabic words). */
export const mostlyArabic = (s: string) => (s.match(new RegExp(ARABIC.source, "g")) ?? []).length > (s.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;

/** Without diacritics and tatweel, one alef, one yā, hā for tā marbūṭa: the OCR mixes them. */
export function arFold(s: string): string {
  return s
    .normalize("NFKC") // the presentation forms of PDFs (ﻻ, ﻷ) back to letters
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

// Months as Tunisian texts write them (and as the Mashriq does), folded, with their French name.
const MONTHS: [string, string, number][] = [
  ["جانفي", "janvier", 1],
  ["يناير", "janvier", 1],
  ["فيفري", "fevrier", 2],
  ["فبراير", "fevrier", 2],
  ["مارس", "mars", 3],
  ["افريل", "avril", 4],
  ["ابريل", "avril", 4],
  ["ماي", "mai", 5],
  ["مايو", "mai", 5],
  ["جوان", "juin", 6],
  ["يونيو", "juin", 6],
  ["جويليه", "juillet", 7],
  ["يوليو", "juillet", 7],
  ["اوت", "aout", 8],
  ["اغسطس", "aout", 8],
  ["سبتمبر", "septembre", 9],
  ["اكتوبر", "octobre", 10],
  ["نوفمبر", "novembre", 11],
  ["ديسمبر", "decembre", 12],
];
const MONTH = `(${MONTHS.map(([m]) => m).sort((a, b) => b.length - a.length).join("|")})`;
const month = (m: string) => MONTHS.find(([a]) => a === m)!;
const DATE = new RegExp(`(?<!\\d)(\\d{1,2}) ${MONTH} (\\d{4})`);

/** "29 نوفمبر 2023" → "2023-11-29". */
export function isoDateAr(text: string): string | null {
  const m = DATE.exec(arFold(text));
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 31) return null;
  return `${m[3]}-${String(month(m[2])[2]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// Kinds of text, as an Arabic title starts, with the French name the veille uses.
const KINDS: [RegExp, string, string][] = [
  [/^قانون اساسي/, "Loi organique", "loi"],
  [/^قانون/, "Loi", "loi"],
  [/^مرسوم/, "Décret-loi", "decret-loi"],
  [/^امر/, "Décret", "decret"],
  [/^قرار/, "Arrêté", "arrete"],
  [/^مقرر/, "Décision", "decision"],
  [/^منشور/, "Circulaire", "circulaire"],
  [/^(راي|بلاغ|اعلان)/, "Avis", ""],
  [/^تسميه/, "Nomination", ""],
];

export function kindOfAr(title: string): string {
  const t = arFold(title);
  return KINDS.find(([re]) => re.test(t))?.[1] ?? "Autre";
}

// A text named in a title: its kind (with the article: "الأمر", "القرار"…), then its number or date.
const NAMED_KIND = "(?:ال)?(قانون الاساسي|قانون اساسي|قانون|مرسوم|امر|قرار|مقرر|منشور)(?: (?:ال)?(?:حكومي|رئاسي|مشترك|اساسي))?";
const FR: Record<string, string> = {
  "قانون الاساسي": "loi",
  "قانون اساسي": "loi",
  قانون: "loi",
  مرسوم: "decret-loi",
  امر: "decret",
  قرار: "arrete",
  مقرر: "decision",
  منشور: "circulaire",
};

/** "عدد 1991 لسنة 2005" → "2005-1991"; a year before 2000 is written with two digits ("68-88"). */
export function numero(n: string, year: string): string {
  return `${Number(year) < 2000 ? year.slice(2) : year}-${n}`;
}

/** The title's own number ("أمر عدد 758 لسنة 2023", "أمر حكومي عدد 284 مؤرخ في 21 مارس 2019"). */
export function numeroAr(title: string): string | undefined {
  const t = arFold(title);
  const m = new RegExp(`^${NAMED_KIND}[^،,]{0,30}?عدد (\\d{1,5})(?: لسنه (\\d{4}))?`).exec(t);
  if (!m) return undefined;
  const year = m[3] ?? isoDateAr(t)?.slice(0, 4);
  return year ? numero(m[2], year) : undefined;
}

/**
 * The title with the texts it names written as a French title would name them: "الأمر عدد 1991
 * لسنة 2005" → "décret n° 2005-1991", "القرار المؤرخ في 28 نوفمبر 1995" → "arrêté du 28 novembre
 * 1995"; the title's own kind and date too ("قرار من وزير المالية مؤرخ في 15 مارس 2019" → "arrêté …
 * du 15 mars 2019"). What the veille reads of numbers and dates then works on Arabic titles.
 */
export function frenchCitations(title: string): string {
  let t = arFold(title);
  // Numbered: "الأمر الحكومي عدد 284 لسنة 2019"; the own number may come with its date only.
  t = t.replace(new RegExp(`${NAMED_KIND}([^،,]{0,30}?)عدد (\\d{1,5})(?: لسنه (\\d{4}))?(?: مؤرخ في (\\d{1,2} ${MONTH} (\\d{4})))?`, "g"), (...m) => {
    const [, kind, , n, year, , , dateYear] = m as string[];
    const y = year ?? dateYear;
    return y ? ` ${FR[kind]} n° ${numero(n, y)} ` : m[0];
  });
  // Dated: "القرار المؤرخ في 28 نوفمبر 1995", "قرار من وزير … مؤرخ في 15 مارس 2019".
  t = t.replace(new RegExp(`${NAMED_KIND}([^،,]{0,160}?)(?:ال)?مؤرخ في (\\d{1,2}) ${MONTH} (\\d{4})`, "g"), (...m) => {
    const [, kind, between, d, mo, y] = m as string[];
    return ` ${FR[kind]}${between} du ${d} ${month(mo)[1]} ${y} `;
  });
  return t.replace(/\s+/g, " ").trim();
}

/**
 * An Arabic PDF's lines (put right to left by lib/veille/pdf.ts) as Markdown pages, for the
 * sommaire reader of the OCR text.
 */
export function arabicPdfMarkdown(pages: { y: number; x: number; text: string }[][]): string {
  return pages
    .map((lines, i) => {
      const text = [...lines]
        .sort((a, b) => b.y - a.y || b.x - a.x)
        .map((l) => l.text.normalize("NFKC"));
      return [`<!-- page:${i + 1} -->`, ...text].join("\n");
    })
    .join("\n");
}
