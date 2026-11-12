/**
 * The fiche of a JORT text, read from the OCR text of its issue (ocr.jort.tn): what it requires, how
 * often, and what it costs not to, so that a register's "résumé de l'exigence", "risque" and "plan
 * d'action" start filled in. Plain reading, no model:
 *
 *   1. the issue's text is cut into the texts its sommaire lists: each text's title is printed again
 *      at the head of its body, on the page the sommaire gives (bodies());
 *   2. in a body, the visas ("Vu la loi…") are left out; the sentences of the articles that oblige or
 *      forbid ("doit", "sont tenus", "il est interdit", "obligatoire"…) are kept with their article,
 *      as are the sanctions ("puni d'une amende…", "fermeture"), the periodicity ("une fois par an")
 *      and the kinds of obligation (a register, a periodic check, an authorisation, a training…);
 *   3. the risk and the action plan are written from the text's domain, sanctions and kinds of
 *      obligation (fiche()).
 *
 * A written résumé (data/referentiel/resumes/) takes the place of the quoted sentences when there is
 * one, and a written risk and action plan (data/referentiel/risques/) the place of those made from
 * the domain. All of it is a starting point for the consultant, never a legal reading.
 */
import { markdownPages } from "./markdown";

export interface Fiche {
  obligations: string[]; // "Art. 4 : L'exploitant doit tenir un registre…"
  sanctions: string[];
  periodicite?: string; // a key of FREQUENCES (lib/registre/registre.ts): "Annuelle"
  types: string[]; // keys of TYPES
  articles: number; // how many articles the body has: 0 when it was not found
  premier?: string; // its first article, to say what a text without obligations does
}

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'");
// Letters and digits only: titles are compared on this, the OCR spacing and punctuation aside.
const bare = (s: string) => plain(s).replace(/[^a-z0-9]/g, "");

// Lines that are not the text: running heads, page numbers, the signature block of the PDF.
const NOISE = /^(page \d+|\d+\s*$|n° \d+|journal officiel|---|signature num|dn:|date:|cn=|2\.5\.4|de la repub|repub tunisien)/;
// A heading is a text's title in some issues ("## Décret n° 79-1001 …"); other headings (sections,
// ministries, "# Sommaire") are not text.
const TITLE_LINE = /^(d[ée]cret|a[rb][rb][êe]t[ée]|loi|ldi|circulaire|d[ée]cision)s?\b.{0,80}?\b(n°|du \d)/i;
const ACT_HEADING = /^(d[ée]crets?|arr[êe]t[ée]s?|lois?|circulaires?|d[ée]cisions?)\b/i;

interface Paragraph {
  text: string;
  page: number; // index of the OCR page
}

function paragraphs(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const [page, lines] of markdownPages(md).entries()) {
    let current: string[] = [];
    const flush = () => {
      const text = current.join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, page });
      current = [];
    };
    for (const raw of lines) {
      let line = raw.replace(/\*\*/g, "").trim();
      if (line.startsWith("#")) {
        line = line.replace(/^#+\s*/, "");
        if (!ACT_HEADING.test(line)) {
          flush();
          continue;
        }
        flush();
      }
      if (!line) {
        flush();
        continue;
      }
      if (NOISE.test(plain(line))) {
        flush();
        continue;
      }
      // A line that starts like a text's title starts a paragraph, glued to the line above or not.
      if (TITLE_LINE.test(line)) flush();
      current.push(line);
    }
    flush();
  }
  return out;
}

/**
 * Each listed text's body, by its index in `titles`: the paragraphs from its title, printed again
 * at the head of the text on or after its page, to the next text's title. `pages` gives each
 * title's page index in the OCR text (its JORT page less the issue's first page), null when unknown.
 */
// The kind a title starts with, OCR misreadings aside: "arr" for ARRETE, ARBETE, ABBETE…
const kindOf = (k: string) => (/^(arr|arb|abb|abr)/.test(k) ? "arr" : /^(dec|dcr)/.test(k) ? "dec" : /^(loi|ldi|lio)/.test(k) ? "loi" : k.slice(0, 3));

// A line of the sommaire: dot leaders, or a page number at its end.
const SOMMAIRE_LINE = /(\.{4,}|…+)\s*\d+\s*$|\s\d{2,5}\s*$/;

export function bodies(md: string, titles: { title: string; page: number | null }[]): (string[] | null)[] {
  const paras = paragraphs(md);
  const keys = paras.map((p) => bare(p.text).slice(0, 200));
  const starts: (number | null)[] = [];
  const used = new Set<number>();
  let from = 0;
  for (const { title, page: given } of titles) {
    // A page before the issue's first: the issue's first page was misread; search without it.
    const page = given !== null && given >= 0 ? given : null;
    const key = bare(title).slice(0, 45);
    let found: number | null = null;
    // From the title's page, then from the page before (a page number read one off), and never
    // before the text found last: the sommaire on the first pages lists the same titles.
    for (const first of page === null ? [null] : [page, page - 1]) {
      if (key.length < 20 || found !== null) break;
      // On the title's pages, wherever the texts before it were found: old issues do not always
      // print the texts in the sommaire's order.
      let i = first === null ? from : 0;
      if (first !== null) while (i < paras.length && paras[i].page < first) i++;
      for (; i < paras.length && (first === null || paras[i].page <= first + 2); i++) {
        // A title the OCR broke in two paragraphs is read with the next one; a line of the sommaire
        // (dot leaders, a page number) is not the text.
        if (used.has(i) || SOMMAIRE_LINE.test(paras[i].text)) continue;
        if (keys[i].startsWith(key) || (keys[i] + (keys[i + 1] ?? "")).startsWith(key)) {
          found = i;
          break;
        }
      }
    }
    // Old issues: the OCR misreads the head of the title ("ARBETE", "Pan" for "Plan"). The text is
    // then found by its number ("69-426"), or else by its date, near the start of a paragraph that
    // begins with a kind of text, on or just after its page.
    const id = /n°\s*(\d{2,4}\s?-\s?\d{1,5})/i.exec(title)?.[1].replace(/\s/g, "") ?? /\bdu (\d{1,2}(?:er)? \S+ \d{4})/i.exec(title)?.[1];
    if (found === null && id && page !== null) {
      const needle = bare(id);
      for (let i = 0; i < paras.length && paras[i].page <= page + 2; i++) {
        if (used.has(i) || paras[i].page < page - 1 || SOMMAIRE_LINE.test(paras[i].text)) continue;
        if (kindOf(keys[i]) === kindOf(key) && keys[i].slice(0, 90).includes(needle)) {
          found = i;
          break;
        }
      }
    }
    // Last, anywhere in the texts: the pages of some old issues do not match the sommaire's numbers.
    if (found === null && key.length >= 20 && page !== null)
      // After the sommaire: from the first text found.
      for (let i = used.size ? Math.min(...used) : from; i < paras.length; i++) {
        if (used.has(i) || SOMMAIRE_LINE.test(paras[i].text)) continue;
        if (keys[i].startsWith(key)) {
          found = i;
          break;
        }
      }
    starts.push(found);
    if (found !== null) {
      used.add(found);
      from = Math.max(from, found + 1);
    }
  }
  const sorted = starts.filter((s): s is number => s !== null).sort((a, b) => a - b);
  return starts.map((s) => {
    if (s === null) return null;
    const end = sorted.find((x) => x > s) ?? paras.length;
    return paras.slice(s + 1, end).map((p) => p.text);
  });
}

// The articles: "Article premier -", "Art. 2 -", "Article 3 :", "Art 4."…
const ARTICLE = /^(?:article\s+(premier|unique|\d+)|art\.?\s*(\d+|premier))\b\s*(?:bis|ter)?\s*[-–—.:]?\s*/i;
const PREAMBLE = /^(vu |sur proposition|apres avis|apres deliberation|le president|le chef du gouvernement|la cheffe du gouvernement|le premier ministre|le ministre|la ministre|les ministres|prend le decret|decrete|arrete|arretent|la chambre|l'assemblee|au nom du peuple|promulgue|tunis, le|considerant)/;

export const SIGNED = /\s(?:Pour contreseing|Par (?:décret|arrêté|décision)s?(?: gouvernemental| présidentiel)? n°|Par (?:décret|arrêté)s? du (?:chef|ministre|premier)|ISSN|Certifié conforme|Tunis, le \d).*$/is;

const OBLIGES =
  /\b(doit|doivent|devra|devront|est tenue?s?|sont tenue?s?|il est interdit|est interdite?s?|sont interdite?s?|interdiction|obligatoires?|obligatoirement|est soumise?s?|sont soumise?s?|ne peut|ne peuvent|ne pourra|sont astreinte?s?|est astreinte?|veille(?:nt)? a|est subordonnee?|sont subordonnee?s|il est fait obligation|est oblige|sont obliges)\b/;
// A penalty the text sets: a fine, prison, closure, withdrawal of an authorisation. The bare words
// "sanction" or "contravention" are not enough ("la commission … propose les sanctions").
const SANCTION = /\b(est puni|sont punis|est punie|sera puni|seront punis|puni d'une|punie d'une|passible d'une|amende (?:de|allant|variant|egale)|emprisonnement d|fermeture (?:provisoire|definitive|temporaire|de l'etablissement|du local)|retrait (?:definitif |provisoire )?de l'(?:autorisation|agrement)|suspension (?:de l'activite|de l'autorisation))/;

const PERIODS: [RegExp, string][] = [
  [/\b(chaque mois|par mois|mensuel(?:le)?(?:ment)?)\b/, "Mensuelle"],
  [/\b(chaque trimestre|par trimestre|trimestriel(?:le)?(?:ment)?|tous les trois mois)\b/, "Trimestrielle"],
  [/\b(chaque semestre|par semestre|semestriel(?:le)?(?:ment)?|tous les six mois|deux fois par an)\b/, "Semestrielle"],
  [/\b(chaque annee|par an|une fois l'an|annuel(?:le)?(?:ment)?|tous les ans|une fois par an)\b/, "Annuelle"],
  [/\b(tous les deux ans|chaque deux ans|biennal)\b/, "Tous les deux ans"],
];

/** Kinds of obligation, each with its action plan when the site does not conform. */
export const TYPES: Record<string, { label: string; re: RegExp; plan: string }> = {
  registre: {
    label: "Registre ou document à tenir",
    re: /\b(registre|carnet|tenir a jour|tenu a jour|consigne|dossier technique)\b/,
    plan: "Ouvrir et tenir à jour le registre ou le document prévu ; désigner la personne chargée de le remplir.",
  },
  affichage: {
    label: "Affichage",
    re: /\b(affiche|affichee?s?|affichage|placard)\b/,
    plan: "Afficher les informations exigées aux endroits prévus et vérifier qu'elles restent lisibles et à jour.",
  },
  autorisation: {
    label: "Autorisation ou agrément",
    re: /\b(autorisation|agrement|licence|permis|habilitation|accord prealable)\b/,
    plan: "Déposer la demande d'autorisation ou d'agrément et en conserver la décision ; suivre sa date de validité.",
  },
  declaration: {
    label: "Déclaration",
    re: /\b(declaration|declarer|notifier|notification|informer l'administration)\b/,
    plan: "Faire la déclaration auprès de l'administration dans le délai fixé et en garder la preuve.",
  },
  controle: {
    label: "Contrôle ou vérification périodique",
    re: /\b(controle periodique|verification|verifie|visite technique|inspection|organisme agree|bureau de controle|epreuve)\b/,
    plan: "Planifier le contrôle ou la vérification périodique (organisme agréé si prévu) et classer les rapports.",
  },
  analyse: {
    label: "Mesures ou analyses",
    re: /\b(analyses?|mesures? de|mesurages?|prelevements?|valeurs? limites?|seuils?|concentrations?)\b/,
    plan: "Faire réaliser les mesures ou analyses prévues et comparer les résultats aux valeurs limites.",
  },
  formation: {
    label: "Formation ou information du personnel",
    re: /\b(formation|former|forme|information des travailleurs|sensibilisation|instruction)\b/,
    plan: "Organiser la formation ou l'information du personnel concerné et en garder la trace.",
  },
  medical: {
    label: "Surveillance médicale",
    re: /\b(medecin du travail|visite medicale|examen medical|surveillance medicale|aptitude)\b/,
    plan: "Programmer les visites médicales prévues avec le médecin du travail et en garder les fiches d'aptitude.",
  },
  protection: {
    label: "Équipements de protection",
    re: /\b(equipements? de protection|protection individuelle|protections? collectives?|dispositifs? de securite|extincteurs?)\b/,
    plan: "Mettre en place les équipements et dispositifs de protection prévus et vérifier leur état et leur usage.",
  },
  interdiction: {
    label: "Interdiction",
    re: /\b(il est interdit|est interdite?s?|sont interdite?s?|interdiction)\b/,
    plan: "Vérifier sur le site que la pratique interdite n'a pas lieu ; corriger et sensibiliser le personnel.",
  },
};

const DEFAULT_PLAN = "Comparer la situation du site aux exigences du texte, définir les actions correctives, un responsable et une échéance.";

/** The risk of not conforming, by domain of the veille. */
const RISKS: Record<string, string> = {
  "etablissements-classes": "Exploitation non conforme à l'autorisation : mise en demeure, suspension ou fermeture de l'établissement.",
  environnement: "Atteinte à l'environnement (rejets, déchets, bruit, air) : procès-verbal, amende, obligation de dépollution.",
  sst: "Accident du travail ou maladie professionnelle ; procès-verbal de l'inspection du travail.",
  hygiene: "Risque sanitaire pour le personnel ou le public ; fermeture administrative possible.",
  incendie: "Incendie, explosion ou panique ; refus de l'attestation de prévention, fermeture des locaux.",
  "produits-dangereux": "Intoxication, explosion ou pollution par des produits dangereux ; saisie, amende.",
  travail: "Litige social, rappel de salaires ou de cotisations ; procès-verbal de l'inspection du travail.",
  route: "Accident de la circulation ; immobilisation du véhicule, amende, retrait du permis.",
  finance: "Redressement fiscal ou douanier, pénalités de retard.",
  secteurs: "Activité exercée hors des conditions fixées : retrait de l'agrément ou de l'autorisation, amende.",
};

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/** The articles of a text's body ("Art. 4", its text), its visas and signature left out. */
export function articlesOf(body: string[] | null): { label: string; text: string }[] {
  const articles: { label: string; text: string }[] = [];
  if (!body) return articles;
  for (const p of body) {
    const m = ARTICLE.exec(p);
    if (m) {
      const n = (m[1] ?? m[2] ?? "").toLowerCase();
      articles.push({ label: n === "premier" ? "Art. 1" : n === "unique" ? "Article unique" : `Art. ${n}`, text: p.slice(m[0].length) });
    } else if (articles.length && !PREAMBLE.test(plain(p))) {
      // An article's next paragraph (its lists, its second alinea), until the signature.
      if (/^tunis,? le\b/.test(plain(p))) break;
      articles.at(-1)!.text += ` ${p}`;
    }
  }
  // The text ends at its signature: what follows on the page is the next text (often a nomination,
  // "Par décret n° … Monsieur … est nommé…", which the sommaire lists under another title).
  for (const a of articles) a.text = a.text.replace(SIGNED, "");
  // The annexes' tables are not sentences.
  for (const a of articles) a.text = a.text.replace(/\|[^|]*(?=\|)/g, " ").replace(/\|/g, " ").replace(/(?:-{3,}|\s-\s-)+/g, " ").replace(/\s+/g, " ").trim();
  return articles;
}

/** What a text's body requires, read from its articles. */
export function readFiche(body: string[] | null): Fiche {
  if (!body) return { obligations: [], sanctions: [], types: [], articles: 0 };
  const articles = articlesOf(body);
  const obligations: string[] = [];
  const sanctions: string[] = [];
  const types = new Set<string>();
  let periodicite: string | undefined;
  for (const a of articles) {
    for (const sentence of a.text.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý«-])/)) {
      const s = plain(sentence);
      if (/journal officiel de la republique tunisienne|sont charges.*de l'execution|est charge.*de l'execution/.test(s)) continue;
      if (SANCTION.test(s) && sanctions.length < 3) sanctions.push(`${a.label} : ${cut(sentence.trim(), 260)}`);
      else if (OBLIGES.test(s) && obligations.length < 6) obligations.push(`${a.label} : ${cut(sentence.trim(), 280)}`);
      if (!OBLIGES.test(s) && !SANCTION.test(s)) continue;
      for (const [id, t] of Object.entries(TYPES)) if (t.re.test(s)) types.add(id);
      periodicite ??= PERIODS.find(([re]) => re.test(s))?.[1];
    }
  }
  const premier = articles[0] ? `${articles[0].label} : ${cut(articles[0].text, 300)}` : undefined;
  return { obligations, sanctions, periodicite, types: [...types], articles: articles.length, premier };
}

/** The risk of a text, from its domain and the sanctions it sets. */
export function risqueOf(domaine: string, fiche: Fiche | undefined): string {
  const base = RISKS[domaine] ?? RISKS.secteurs;
  // Fiches read before the stricter reading of sanctions may keep a looser one: checked again.
  const s = fiche?.sanctions.find((x) => SANCTION.test(plain(x)));
  return s ? `${base} Sanction prévue (${cut(s, 200)})` : base;
}

/** The action plan when the site does not conform: one line per kind of obligation, at most three. */
export function planOf(fiche: Fiche | undefined): string {
  const plans = (fiche?.types ?? []).slice(0, 3).map((t) => TYPES[t]?.plan).filter(Boolean);
  return plans.length ? plans.join(" ") : DEFAULT_PLAN;
}

/** The résumé quoted from the text: its first obligations with their articles, else its first article. */
export function resumeOf(fiche: Fiche | undefined): string {
  return fiche?.obligations.length ? fiche.obligations.slice(0, 3).join(" ") : (fiche?.premier ?? "");
}

/** A fiche as stored and served (data/veille/fiches, public/veille/fiches.json): short keys, no empties. */
export interface FicheData {
  r?: string; // a written résumé (data/referentiel/resumes), when there is one
  k?: string; // a written risk (data/referentiel/risques)
  q?: string; // a written action plan (data/referentiel/risques)
  o?: string[]; // obligations
  s?: string[]; // sanctions
  p?: string; // periodicity
  t?: string[]; // kinds of obligation
  a?: number; // articles read: 0 when the body was not found
  f?: string; // first article, kept when no obligation was found
}

export function compact(f: Fiche): FicheData {
  const d: FicheData = { a: f.articles };
  if (f.obligations.length) d.o = f.obligations.slice(0, 4).map((x) => cut(x, 240));
  if (f.sanctions.length) d.s = f.sanctions.slice(0, 2).map((x) => cut(x, 200));
  if (f.periodicite) d.p = f.periodicite;
  if (f.types.length) d.t = f.types;
  if (!f.obligations.length && f.premier) d.f = f.premier;
  return d;
}

export function expand(d: FicheData | undefined): Fiche | undefined {
  return d ? { obligations: d.o ?? [], sanctions: d.s ?? [], periodicite: d.p, types: d.t ?? [], articles: d.a ?? 0, premier: d.f } : undefined;
}

/** What a register line starts from: the written résumé or the quoted obligations, the risk, the plan. */
export function defaults(domaine: string, d: FicheData | undefined): { resume: string; risque: string; plan: string } {
  const f = expand(d);
  return { resume: d?.r ?? resumeOf(f), risque: d?.k ?? risqueOf(domaine, f), plan: d?.q ?? planOf(f) };
}
