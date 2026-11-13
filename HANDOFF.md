# ABClassement (repo `edii`): project handoff

State on **22 October 2026**, branch **`claude/veille`**. This file is for a new working session:
what the app is, how it is built, what has been decided, what the data holds today, and what comes
next. `README.md` stays the reference for the classification pipeline, the ANPE study and the
veille commands; this file covers the whole project and its history, and does not repeat those
details.

---

## 1. In one page

**ABClassement** is a web app for a Tunisian QHSE consultant (ABC Consulting). No AI is involved:
everything comes from the official texts, stored as data.

1. **Classement.** It classifies an establishment under the nomenclature of *établissements
   dangereux, insalubres ou incommodes* (arrêté du 15 novembre 2005, amended 2010 and 2012):
   1ère, 2ème, 3ème catégorie or non classé, with several activities and the *règle d'addition*.
2. **Étude ANPE.** It says which study the ANPE expects (décret n° 2005-1991): étude d'impact A or
   B, cahier des charges, étude de dépollution (unit already operating) or demande d'avis.
3. **Synthèse.** A validated classification gives a detailed report (print/PDF, HTML, JSON).
4. **Veille réglementaire.** A scanner reads the *Journal Officiel de la République Tunisienne*
   (JORT, French edition) issue by issue, from each issue's sommaire, and flags the texts that
   concern companies: établissements classés, environnement, santé et sécurité au travail, hygiène,
   incendie, produits dangereux, droit du travail et RH, code de la route, fiscalité, and **every
   activity of the nomenclature** (huileries, laiteries, carrières, BTP…).
5. **Registres.** From a validated classification, the app creates the establishment's *registre de
   veille légale et réglementaire*: the texts that apply are proposed with why (every text on the
   site's activities is ticked), the consultant adds or removes texts and evaluates each one
   (conformité C/NC/NA, risque, plan d'action, responsable, échéance), is reminded when evaluations
   are due, and is alerted when a new JORT text modifies a text of the register. Export to Excel in
   the client's **ID-QSE-002** layout.

**Where things stand:**

* Classification, ANPE study, report: done and tested.
* Veille: the JORT is read from **jort.tn's OCR text** (every French issue since 1957, scans
  included), with the PDF as fallback. **All of 1957-2026 is read: 6,390 issues, 181,291 titles**
  (36 issues still empty, 27 of them scans with no OCR text yet; 94 Arabic files of the French
  collection read in Arabic). 12,044 texts flagged.
* Rules: 97 rules, of which 42 activity rules added on 22 October; 7,050 texts flagged on 1986-2026.
* Registers: done (browser storage), with alerts, reminders, update from a new classification,
  modification history per text.
* **Open decision:** registers are still offered too many texts by default (§7, §11 step 3).
* Branch `claude/veille` is well ahead of `main` and not merged; no pull request yet.

---

## 2. People, places, how work happens

* **The user** works on Windows with PowerShell. The project is cloned twice on the laptop:
  the main copy, and a test copy at `C:\Users\LEGION\Desktop\rea\test\edii-veille` on branch
  `claude/veille`, run with `npm run dev -- -p 3001`. Python 3.14 is installed; `pdftotext` is
  not (one data test is skipped there, which is expected).
* **GitHub:** `ahmedmahddi/edii` (standalone since it left the QMS repo `ahmedmahddi/qms`, where it
  lived under `/edii`; `next.config.ts` still redirects `/edii` to `/`). Branches: `main`
  (last: "Remove CI workflow": the user removed CI), `claude/veille` (all recent work),
  `claude/eie-suggestions`, `claude/windows-python` (both merged into `claude/veille` already).
* **Network.** Since 22 October the cloud environment can reach `jort.tn`, `index.jort.tn`,
  `ocr.jort.tn`, `lake.jort.tn`. `api.jort.tn` (search) answers 403 (a Cloudflare challenge): not
  used. In a cloud session, Node's `fetch` ignores the proxy unless the command is run with
  **`NODE_USE_ENV_PROXY=1`** (otherwise: `getaddrinfo ENOTFOUND`). On the laptop nothing is needed.
* **Working loop:** either the session reads the JORT itself, or the user runs the scanner on the
  laptop and pushes `data/veille/sommaires`; the session pulls and reviews.

### The commands to finish reading the JORT (laptop)

```powershell
git pull origin claude/veille
npm install
npm run veille -- --years 1957-1986      # what is left: ~2,000 issues, ~30 min; resumable
npm run veille -- --reread               # issues that gave no text (scans whose OCR came out since…)
npm test                                 # 104 tests
git add data/veille/sommaires
git commit -m "Veille: JORT 1957-1986"
git push origin claude/veille
```

1986 is partly read (14 of 78 issues): `--years 1957-1986` takes the missing ones only. A run can be
stopped (Ctrl+C) and run again: it goes on where it stopped. In a cloud session, prefix with
`NODE_USE_ENV_PROXY=1` and call `npx tsx scripts/veille.ts …` instead of `npm run veille -- …`.

### Other commands

```bash
npm run dev              # http://localhost:3000 (rebuilds public/veille/feed.json first, ~13 s)
npm test                 # vitest: 104 tests in 5 files
npm run typecheck
npm run build            # static page (rebuilds feed.json first)

npm run veille                               # new issues of this year
npm run veille -- --years 1995-2022          # those years' issues not read yet, most recent first
npm run veille -- --year 2026 --from 1 --to 30   # read (again) issues 1 to 30 of 2026
npm run veille -- --ocr --years 2023-2026    # issues read from the PDF: read their OCR text, keep the longer reading
npm run veille -- --reread                   # read again issues that gave 0 texts or glued titles
npm run veille -- --abrogations              # read every issue's whole text for repeals (once, resumable)
npm run veille -- --reassess                 # re-apply edited rules to stored sommaires (no download)
npm run veille -- --list --year 2026         # every title read, with its level ("-" = not flagged)
npm run veille -- --file x.md --year 2010 --number 18    # an OCR text (or a PDF) already on disk
npm run veille -- --probe 1960,1970          # sample PDFs (2 per year) into data/veille/probe/
JORT_BASE / JORT_OCR_BASE / JORT_CATALOG=…   # read from copies of lake / ocr / index (tests); JORT_OCR_BASE=none: PDFs only

npm run data:ocr | data:parse | data:eie     # nomenclature / decree pipeline (Python), see README
```

Weekly scan on the laptop (untested: no PowerShell in cloud sessions):
`scripts/veille-hebdo.ps1 [-Push]`, registered with `schtasks` (command in the script header and
the README). The project path must have no spaces.

---

## 3. Stack and layout

Next.js 15 (App Router, one static page), React 19, TypeScript, Vitest. `exceljs` (loaded only when
exporting). `pdfjs-dist` 4.10 (legacy build, Node) with its bundled `@napi-rs/canvas` for page
rendering, `tsx` for the scanner. Python only for the nomenclature/decree data pipeline.

| Path | Role |
|---|---|
| `app/page.tsx` | The whole page: views `search` (Nomenclature), `establishment`, `report` (synthèse on its own page), `guide`, `sources`, `veille`. State lives in React and the dossier is mirrored in the URL (`?e=…&s=…&z=1&code=…&q=…`). Menu badge for the veille. |
| `app/components/classification-report.tsx` | The detailed report (contents bar, exports). |
| `app/components/veille.tsx` | Veille view: tabs **Registres des établissements** / **Journal officiel**; fetches `public/veille/feed.json` once; `useVeilleCount()` for the menu badge. |
| `app/components/registres.tsx` | Registers: list, new-register step (name, site profile, duplicate detection), register view (to-do panels, groups by domain, evaluation cards with "Modifié par…" history, add a text, Excel export), backup/restore. |
| `app/components/download.ts` | Browser downloads; `downloadWorkbook` (exceljs on demand). |
| `app/globals.css` | All styles (design tokens on `:root`; the user's redesign, see `DESIGN.md`, `design-tokens.json`, `design-preview.html`). One-line rules. |
| `lib/classify.ts`, `lib/establishment.ts`, `lib/studies.ts`, `lib/report.ts`, `lib/sectors.ts` | Classification, establishment and addition rule, ANPE study, report model, sector names (see README). |
| `lib/veille/markdown.ts` | **Sommaire from the OCR text** (ocr.jort.tn): `parseMarkdown`, `parseMarkdownStart` (partial download), `markdownPages`, `ocrUrl`; `readArabic` for Arabic files. |
| `lib/veille/arabe.ts` | Arabic titles: `arFold`, `isArabic`, `mostlyArabic`, `isoDateAr`, `kindOfAr`, `numeroAr`, `frenchCitations`, `arabicPdfMarkdown`. |
| `lib/veille/fetch.ts` | Downloads with timeout and retries (`fetchRetry`, `fetchText`). |
| `lib/veille/abrogation.ts` | Repeal clauses of titles and bodies (`repealClauses`). |
| `lib/veille/jort.ts` | Shared types (`Issue`, `SommaireEntry`, `Line`), the **PDF** sommaire parser `parseIssue`, `isSommairePage`, `kindOf`, `isoDate`, `sommaireEntry`, `pdfUrl`, `pdfPage`, `INSTITUTION`, `TEXT_START`. |
| `lib/veille/pdf.ts` | PDF → positioned lines: `pdfLines(data)`, `pdfLinesFromUrl(url)` (HTTP range requests), `pdfPageImages`, `toLines`. |
| `lib/veille/glyphs.ts` | Decoder for 2000-2005 fonts that write glyph numbers instead of letters (PDF path only). |
| `lib/veille/watch.ts` | Rules engine: `assess`, `hitsOf`, `record`, `reassess`, `ignored`, `subject`, `fold`; types `Hit`, `Feed`, `Amendment`, `Sommaires`. |
| `lib/veille/registre.ts` | Excel export in the ID-QSE-002 layout (`fillRegister`, `registerRow` for JORT hits, `ligneRow` for register lines, `systeme`). |
| `lib/registre/profil.ts` | Site profile: `Site`, `FLAGS` (27 facts in 5 groups), `derivedFlags`, conditions `applies(when, site)` with reasons. |
| `lib/registre/referentiel.ts` | Référentiel: curated texts + JORT texts (`catalogue`, `fromHit`, `seriesKey`), text keys (`keysOf`, `namedKeys`, `citedKeys`), `proposals`, `amendments`. |
| `lib/registre/registre.ts` | Register model and logic: create, add, update from a new classification, new texts, texts no longer applicable, `alertes`, `modifiePar`, due evaluations, menu count, localStorage, backup/restore. |
| `scripts/veille.ts` | The scanner CLI (options above). |
| `scripts/veille-hebdo.ps1` | Weekly scan for the Windows task scheduler. |
| `scripts/python.mjs` | Finds a working Python on any OS for `npm run data:*`. |
| `data/sources/`, `data/ocr/`, `data/pipeline/`, `data/nomenclature.json`, `data/eie*.json`, `data/corrections.json`, `data/review.md` | Classification and decree data (see README). |
| `data/sources/ocr/` | First pages of 5 real OCR texts (1960 n° 1, 1965 n° 40, 1980 n° 1, 2023 n° 108, 2024 n° 2), for the tests. |
| `data/veille/watch.json` | Veille rules (domains, levels, ignore lists, `when`, register mapping, `suggere`). |
| `data/veille/watch-ar.json` | Arabic terms of the same rules (by rule id), Arabic ignore and demote lists. |
| `data/veille/abrogations/<year>.json` | Repeal clauses found in each issue's whole OCR text (`--abrogations`). |
| `data/veille/sommaires/<year>.json` | Every sommaire read (committed; the source of truth of the veille). Each issue says where it was read: `source: "ocr"` or `"pdf"`. |
| `data/veille/probe/` | PDF probe samples (2 issues every 5 years, JPEG pages of the scans). Kept for reference; the OCR text made the OCR plan unnecessary. |
| `data/referentiel/textes.json` | Curated référentiel (74 texts). |
| `public/veille/feed.json` | Texts flagged + amendments: **derived, not in git**, rebuilt by `npm run veille` and before `dev`/`build`. 5 MB with 1986-2026. |
| `tests/` | `edii.test.ts` (classification, data in sync), `report.test.ts`, `veille.test.ts` (JORT parsing of PDFs and OCR texts, rules, glyphs), `registre.test.ts` (Excel export, register recall), `etablissement-registre.test.ts` (profile, référentiel, registers). |

---

## 4. Classification and ANPE study (summary; details in README)

* Nomenclature: OCR of the 2005 scans (tesseract, column-aware pipeline), amendments of 2010 and
  2012 applied in order → `data/nomenclature.json` (223 rubriques). Thresholds in canonical units;
  outcomes `classified`, `choose`, `needs_quantity`, `unit_mismatch`, `definition`.
* Establishment = most severe category of its activities (décret 2006-2687, art. 5); addition rule
  Σ q/Q > 1 with Q = threshold of the category just above (reading to confirm).
* ANPE: 68 entries of décret 2005-1991 (A 24, B 26, annexe 2 18); `data/eie-links.json` suggests
  entries per rubrique with their condition; the user chooses; the establishment takes the most
  demanding study. Situation projet/extension → EIE A/B or cahier des charges; existant →
  dépollution (circulaire n° 27 du 7/11/2024, valid until 31/12/2025: to check); none → demande
  d'avis.
* Validation lists what is missing per activity; a validated report becomes stale (exports
  disabled) when the dossier changes.

---

## 5. Veille: reading the JORT

**Sources (jort.tn, a mirror of the JORT since 1957, synced from iort.tn every 20 minutes):**

* `https://index.jort.tn/catalog` (2 MB): every issue, per collection, year and language. The
  scanner reads it once per run: a past year's issues are those listed (no more guessing where a
  year ends; that is how 2023 n° 136-149, missed before, were found). The current year is still
  read number by number (the catalog may lag a few minutes). `https://index.jort.tn/` gives counts.
* `https://ocr.jort.tn/journal-officiel/fr/<year>/<nnn>.md`: the OCR text of each French issue,
  Markdown, pages separated by `<!-- page:N -->`. Scans included (1957-1994 are images in the PDF).
* `https://lake.jort.tn/journal-officiel/fr/<year>/<nnn>.pdf`: the PDF.

**Order:** OCR text first; the PDF when there is no OCR text (the newest issues, for minutes or
days: 2026 n° 92-102 had none on 22 October) or no sommaire in it; if both, the reading with more
texts. Only the first **64 KB** of the OCR text are downloaded (Range), the whole text only when the
sommaire runs on (`parseMarkdownStart` returns null). Pause 150 ms between issues; about 3 issues per
second in a cloud session.

**`parseMarkdown`** (layouts seen from 1957 to 2026):

* header before the line "Sommaire": issue number (`N° 40`, not the masthead's postal account
  `N° 610-15`), date; `firstPage` = the most frequent "page number − page index" over the pages
  (`Page 315`, a number alone on a line, or `950 JOURNAL OFFICIEL…`), needs two votes;
* **section** headings (Lois, Décrets et arrêtés, Avis et communications, Partie officielle,
  Bilans, Annonces…), compared **without accents** (the old OCR writes "DECRETS ET ARRETES");
  a section resets the institution (laws have none);
* **institution** = a heading (`#`), a bold line, a line in capitals, or a line starting with
  Ministère, Présidence, Premier ministère, Secrétariat d'État, Tribunal, Banque…, with no page
  number and not starting with a kind of text; a heading starting with "AU", "DE", "ET"… continues
  the one above ("SECRETARIAT D'ETAT" / "AU PLAN ET A L'ECONOMIE NATIONALE");
* **title** = lines held until one ends with a page number (after dot leaders or a space); a year
  closing a line ("… de l'année 2023", "décembre 1956") is not a page; a page must follow the
  previous one (−60 … +600) or the first page;
* a title whose page number the OCR lost ("orphan") takes the next title's page; orphans left at the
  end are dropped (they are the start of the texts);
* **table rows** (`| title | 2397 |`) are read as lines; list marks (`- Nomination…`) are dropped;
* **the sommaire ends** at a body line ("Par décret…", "Nous, …", "Vu …", "Article premier",
  "Décrète :", "Le Président de la République,"…), at a section heading seen again on a later page,
  after 8 lines with no page, or after 8 pages.

**Quality.** On the 566 issues of 2023-2026, the OCR reading finds **98%** of the titles the PDF
reading found (same page 99%), and more in about 113 issues (PDFs whose text is cut up, e.g. 2024
n° 7: 77 titles instead of 10; 2024 n° 19: 42 instead of 0). On a sample of 110 issues 1957-1994:
24 titles per issue, 91% with their institution, one empty (an Arabic file).

**Arabic files in the French collection** (2019: 30 issues; 2023 n° 138, 142; 2026 n° 11, 13, 44,
62, 76, 96, 98; 1959 n° 30 is the Constitution, no sommaire). **Decision of 22 October: read them
in Arabic**, not the whole Arabic collection. `arabe: true` on the issue; titles stay in Arabic
(shown `dir="auto"`). How (`lib/veille/arabe.ts`, `readArabic` in `markdown.ts`):

* text folded with `arFold` (NFKC for the PDFs' presentation forms, no diacritics/tatweel, ا for
  أإآٱ, ي for ى, ه for ة); sommaire from "المحتوى" (OCR variants المحترم, الفهرس), else the first
  section, else the first title; sections القوانين / الأوامر والقرارات / المراسيم…; institutions
  وزارة / رئاسة / الهيئة…; a title starts with its kind (قانون, مرسوم, أمر, قرار, منشور, تسمية,
  إنهاء…) and runs to the next; page numbers on their own line (before the title), or at either
  end of a line; the page's own footer number is skipped; a year wrapped after "لسنة" is not a page;
  ends at "إن رئيس الجمهورية", "بعد الاطلاع", "الفصل الأول"…;
* kind, number ("عدد 25 لسنة 2019" → 2019-25; before 2000 two digits: 68-88), date (Tunisian and
  Mashriq months) → `kindOf`, `isoDate`, `sommaireEntry` handle Arabic;
* `frenchCitations` rewrites the texts a title names as French ("الأمر عدد 1991 لسنة 2005" →
  "decret n° 2005-1991"; "القرار المؤرخ في 28 نوفمبر 1995" → "arrete du 28 novembre 1995"): keys,
  `citedKeys`, amendments, alerts and series work unchanged;
* rules: Arabic terms per rule id in `data/veille/watch-ar.json` (+ Arabic ignore/demote), matched
  as substrings of the folded subject (from "يتعلق"); avoid short terms hidden in other words
  ("التن" in "التنمية", "المصب" in "المصبرات"; "الآجر" bricks = "الأجر" wages once folded);
* no OCR text yet: the PDF is read when `mostlyArabic`; `toLines` puts Arabic lines right to left
  and keeps digit runs left to right (2026 n° 96: 22 titles).

2019 after `--reread`: 30 Arabic issues, 1,135 titles, no issue left empty. `api.jort.tn` is
blocked by Cloudflare from the cloud.

**PDF reading** (kept as fallback, `parseIssue`): sommaire pages = pages with ≥ 2 lines ending in
dot leaders + page number; institutions less indented than titles or by their first word; glyph-
numbered fonts of 2000-2005 decoded (`glyphs.ts`); page numbers set 2-4 pt lower re-attached; HTTP
range downloads (a 108 MB issue costs a few hundred KB); scans with no OCR text stored as
`sansTexte`. Details in the README and the tests.

---

## 6. Veille: rules (`data/veille/watch.json`)

* **Matching** on the folded title (accents, case, quotes normalised), whole words only. The
  issuer ("Arrêté du ministre de … du 3 mars 2026,") is stripped before matching rules (`subject`),
  so a ministry's name is not a subject; references are matched on the full title. Terms are
  compiled once and checked as substrings first: `--reassess` on 128,000 titles takes ~13 s
  (it took 97 s).
* **Levels:** `critique` = cites a text the app is built on (nomenclature 15/11/2005, 2010, 2012
  amendments, décrets 2005-1991, 2006-2687, 68-88); `important` = an obligation for companies, or a
  text on an activity; `information` = sector news, a text found only by its institution, or
  anything matching `demote` (international agreements, ratifications, approbations of
  conventions, adhesions, creation of bodies, remises de pénalités…).
* **Domains (10):** établissements classés, environnement, SST, hygiène, incendie, produits
  dangereux, droit du travail et RH, code de la route et transport, fiscalité/finances/entreprises,
  secteurs d'activité. **97 rules**; each has `label`, `level`, `domain`, optional `sectors`,
  `any`/`with` terms, `institution`, `impacts`, and **`when`** (the sites a text it finds applies
  to).
* **Activity rules (`act-*`, 42, added 22 October)**, level important, domain secteurs, each tied
  to the nomenclature's **rubriques** (`rubrique:1213`) or to an activity fact: élevage,
  aviculture, aquaculture, engrais, céréales, tabac, abattoirs, **huileries** (huile d'olive,
  trituration, grignons, margines, Office national de l'huile…), laiterie, boissons, eaux
  conditionnées, sucre, boulangerie/pâtes, conserves/dattes, ingrédients, bois, papier/imprimerie,
  piles, détergents, pharmacie, cosmétiques, plastiques/peintures, biotech, chimie minérale,
  déchets municipaux, eaux usées, garages, pressing, carrières, ciment/matériaux, céramique/verre,
  métallurgie, enrobés/routes, textile, cuir, gaz industriels, froid, entrepôts, **BTP** (fact
  `chantier`), **tourisme** (`hotellerie`), **santé** (`sante`), **commerce** (`commerce`). The
  older section rules (`secteur-*`, information) stay as sector news.
* **Ignored:** `ignore` (title starts with: nomination, cessation, promotion…; a leading list mark
  is skipped) and `ignoreAnywhere` (concours, délégation de signature/de pouvoir, statut
  particulier, budget de l'État, prêts/garanties de l'État, permis de recherche, expropriation,
  prix et médailles, fonction publique, assainissement financier…). **RH means private-sector
  employment**: careers of civil servants are ignored.
* **`registre`**: the ID-QSE-002 "SYSTEME" per domain, the default frequency (Annuelle), and
  **`suggere: ["finance"]`**: domains whose texts are only suggested in registers.
* **History:** checked against the titles of an example register: the rules flag nearly all of
  them (tests/registre.test.ts). On 1986-2026 (4,312 issues): **7,050 texts flagged**, 855 modifications of référentiel texts.
* After editing rules: `npm run veille -- --reassess` (no download), then `--list` to review.

---

## 7. Référentiel and registers

**Référentiel** = `data/referentiel/textes.json` (74 curated **law references only**: kind,
number, date, title, domain, `when`. The summaries and risks once taken from the user's example
register were removed on 22 October at the user's request: the consultant writes them per register)
**∪** every JORT hit (`fromHit`). A JORT text already curated only adds its source. A text is known
by `n:<kind>:<number>` or, without a number, `d:<kind>:<ISO date>`. With 1986-2026: 5,944 texts
(5,870 from the JORT).

**Conditions** (`when`, any of them; `a+b` = both): `tous`, `classe`, `categorie:1`,
`secteur:1200`, `rubrique:2505`, `etude:eie` / `etude:eie_a` / `etude:cahier_des_charges`…,
`effectif`, `effectif:50`, or a profile fact: `vehicules`, `transport-marchandises`,
`transport-personnel`, `transport-matieres-dangereuses`, `appareils-pression`, `levage`,
`groupe-electrogene`, `froid`, `rayonnements`, `produits-chimiques`, `hydrocarbures`, `explosifs`,
`denrees`, `animaux`, `rejets-eau`, `emissions-air`, `dechets-dangereux`, `bruit`, `erp`,
`restauration`, `import-export`, `forage`, `energie`, `chantier` (now "Bâtiment et travaux publics,
chantiers"), and new on 22 October `hotellerie`, `sante`, `commerce`. Some facts are ticked from the
rubriques' sections (1200 → denrées, 2500 → hydrocarbures, 1400/2100/2200/2300/2700 → produits
chimiques, 1500 → déchets dangereux, 2400 → explosifs, 2600 → rayonnements, 1100 → animaux).

**Proposals** (`proposals(texts, site)`):

* a text **applies** to a site when one of its `when` holds (all matched rules' `when`);
* it is **ticked** when curated, or when one of its **`coche`** conditions holds: the `when` of the
  matched rules that are important and not in a `suggere` domain (so a text matched by a tax rule
  and by `act-huileries` is ticked for huileries only, suggested elsewhere); a text demoted to
  information is never ticked;
* **a text that only modifies another** (`modifiesAnother`: "modifiant", "complétant", "abrogeant",
  "prorogeant", "rectificatif"; تنقيح، إتمام، إلغاء) is ticked only through an activity rule
  (`act-*`) or a reference (`ref-*`); otherwise it is suggested, and shows as "Modifié par…" on its
  base text when that text is in the register (decision of 22 October);
* a text **repealed as a whole** by a later JORT text is not proposed (`texte.abroge`), and a
  register's card shows "Abrogé par …" (`abrogePar`). Repeals come from titles ("abrogeant le
  décret n° …") and from the **bodies** of the texts: `npm run veille -- --abrogations` reads the
  whole OCR text of every issue once (795 MB for 1957-2026, about 25 minutes, resumable) and keeps
  the repeal clauses in `data/veille/abrogations/<year>.json` (`lib/veille/abrogation.ts`: "Est
  abrogé le décret n° …", "Sont abrogées les dispositions du décret …", "… notamment le décret …",
  "abroge et remplace l'arrêté …", "يلغى الأمر عدد …"; the repeal of an article, a paragraph or an
  annex is not taken for the repeal of the text). 22 October: 182 texts of the référentiel
  repealed (e.g. décret 68-88 by décret 2006-2687). A date-keyed repeal can hit another arrêté of
  the same date with a similar subject (seen once): compare the issuing ministry if it matters;
* of a **series** (`seriesKey`: subject without numbers and dates, ≥ 30 characters, not a
  modification: the SMIG of each year, each loi de finances), only the newest is proposed; the older
  ones are marked `remplace` and can still be added by hand;
* texts with no `when` (conventions collectives in general, marchés publics…) are added by hand
  only (a sectoral convention collective is caught by the activity rules).

**Measured on all 1957-2026 data (22 October, after the "base texts + activity" rule), ticked /
suggested:** chemical plant 969 / 2,650; huilerie 1,054 / 2,137; BTP 811 / 1,734; workshop 636 /
1,848 (before the rule: 1,230, 1,312, 1,008, 780). About 80% of the ticked JORT texts are older
than 2006.

**Earlier measure, 1986-2026 only, before that rule:**

| Site | Ticked | of which curated | Suggested |
|---|---|---|---|
| Chemical plant, 1st cat., 120 employees, many facts | 746 | 68 | 1,576 |
| Agro-food, 2nd cat., 60 employees | 732 | 62 | 1,316 |
| Huilerie (1213), 25 employees | 774 | 62 | 1,290 |
| BTP (chantier, véhicules, levage), 80 employees | 555 | 50 | 1,012 |
| Workshop, 3rd cat., 15 employees, no facts | 429 | 46 | 1,152 |

About 30% of the ticked JORT texts only modify another text; most of the rest are general labour,
CNSS, code de la route and environment texts across 40 years. **Too many** for a register a
consultant can work through: the user has to choose how to cut (§11 step 3).

**Registers without classification (11 November).** The user asked for the veille of companies the
nomenclature does not cover (BTP: VRD, travaux routiers, construction immobilière, one or all of
them; industry in general). `data/registre/metiers.json` is a catalogue of 48 **trades** in 4
groups (btp, industrie, agro, services); each lists the `act-*` rules it turns on (`regles`), the
facts it ticks (`flags`) and its nomenclature sections. At load, `lib/veille/watch.ts` adds
`metier:<id>` to the `when` of those rules, so every activity rule can be reached without a
rubrique (a test checks it). `Site.metiers` (optional: old registers have none); conditions
`metier:<id>`, `groupe:<id>` (generic for the ranking), and `secteur:<s>` also holds through a
trade's sections. `createRegistre(null, site, texts, now, nom)` makes a register with no
classification ("Sans classement"); `updateFromReport` keeps the trades. UI: "Nouveau registre sans
classement" on the register list, "Métiers de l'entreprise" in the profile (open when there is no
rubrique). New rules: `act-batiment` (building-specific terms moved out of `act-btp`, so a road or VRD
company no longer gets urbanism and property-development texts first), `act-vrd`, `act-electricite`,
`act-ime`, `act-industrie`; `act-routes-bitume` widened ("goudron" dropped: cigarette packs). The
waste and general environment rules, and the curated loi 96-41, also apply to `groupe:btp`,
`groupe:industrie`, `groupe:agro`. One-off titles now ignored everywhere: déclaration d'utilité
publique, déclassement, autorisation de construction (of a line…), emprunts, indemnités, garanties à
première demande, ouverture de crédit, protocole financier, grand prix. Measured (effectif 60):
routes + VRD 676 ticked; electrical works 594; general industry 453; offices only 397 (all general
labour, SST, fire, hygiene texts).

**Fiches and résumés (11 November).** The user wanted the résumé de l'exigence, the risque and the
plan d'action prefilled for all sectors, with no AI model and nothing to run on their laptop (it cannot
run a model). Two parts:

* **Algorithm, all texts** (`lib/veille/fiche.ts`, `npm run veille -- --fiches`): each issue with
  texts in the feed is read whole from ocr.jort.tn (about 620 MB for 1957-2026, ~35 min, resumable;
  the weekly run reads new ones). `bodies()` cuts the issue into texts: the sommaire's title is found
  again at the head of its body (letters and digits compared), on its page then the page before, never
  on a sommaire line; for old issues, titles printed as headings ("## Décret n° …") are kept, a title
  glued to the line above starts a paragraph, texts out of the sommaire's order are found, and a title
  whose head the OCR misread ("ARBETE") is found by its number or date with the same kind; when the
  issue's page numbers do not match, the whole text is searched. A body ends at the next text's title
  and at the signature ("Pour contreseing", "Par décret n° … est nommé"). `readFiche()` keeps up to
  six obligation sentences with their article, three sanctions, the periodicity and the kinds of
  obligation (`TYPES`, each with its action plan); the risk comes from `RISKS` by domain plus the
  first sanction. Stored compact per hit (`data/veille/fiches/<year>.json`, issue → entry index →
  `{o, s, p, t, a, f}`); served as `public/veille/fiches.json` (derived, by text id, written by
  `--reassess` and `--fiches`), fetched when a register opens. The register shows the defaults until
  the consultant edits a field (nothing is copied into localStorage: lines stay small), with a note
  "brouillon à vérifier"; the export uses the same (`ligneRow(l, defaults)`). Bodies found for legal
  acts (second run, with the old-issue fixes): 1950s 74 %, 1960s 82 %, 1970s 83 %, 1980s 91 %,
  1990s 93 %, 2000s 95 %, 2010s 91 %, 2020s 92 %; 6,800 texts have obligations or a first article.
* **Written résumés** (`data/referentiel/resumes/lot-*.json`, text key → résumé, French, my own
  wording, 1-3 sentences): written in this session from the articles, batch after batch, in priority
  order (`scripts/resumes.ts`: 1. the 30 essentials of any of 716 site profiles, 2. ticked for one,
  3. applicable, 4. the rest; `--next 40 --corps` lists the next ones with their articles from
  `data/veille/corps/`, kept out of git). The user asked for all texts, not only the essentials; on
  12 November every text of the feed has one: 6,379 résumés in 77 lots (376 essentials, 1,101
  ticked, 2,209 applicable, 2,551 others; `--stats` shows the count). Recurring kinds share one
  wording, applied by title rules (lots 66, 70 and 76): loi de finances, SMIG, wage increases,
  homologation of training diplomas, collective agreements and their amendments (sector named),
  yearly olive, milk, citrus, date and tuna-trap campaigns, measuring-instrument stamps, assainissement
  fees, irrigated perimeters, old olive and wine taxes, State budget decrees. Old yearly customs
  and VAT suspensions share one standard wording. A new text that enters the feed has no résumé
  until a lot is added for it (`--next` lists it first in its tier). While writing the last tier,
  some texts of general reach were seen in "autres" that a site may want ticked: décret 2002-693
  (used oils), décret 97-1102 (packaging, Eco-Lef), the 2006 environmental cahiers des charges
  (EIE annex II), décret 2005-3087 (quota for disabled workers), décret 2007-1866 (hygiene
  offences), NT 106.02 (1989 effluent limits, superseded) and décret 81-1595 (compulsory insurance). The notices of inquiries on dangerous
  establishments ("Avis d'établissements dangereux…", ~650) stay in the feed as information (a test
  holds this) and share one résumé; company balance sheets (titles starting "Bilan") are ignored. Each batch also adds ignore patterns for
  the one-offs it meets (permits, ore sales, power lines, staff, committees, yearly campaigns);
  `ignoreAnywhere` matches whole words, so plurals need their own entry. A body the cutting got wrong is seen
  when writing: the résumé then says "le texte lu dans le JORT ne correspond pas : à vérifier". A résumé made from the title alone says so ("D'après
  son titre").
* **Found on the way:** the curated décret 84-1556 is the regulation of industrial subdivisions (it
  sets the 50 dB(A) daytime limit), not a decree "on noise": title corrected; décret 62-129 is on
  safety in the building industry (title corrected, `when` chantier + levage). Arrêtés of the same
  date and kind were merged as one text: now merged only when their subjects agree (the référentiel
  grew from ~9,000 to ~9,600 texts). More one-offs ignored or demoted (end of functions, debt
  write-offs, State loan guarantees, concessions, statutes of bodies, grant agreements).

**Launch list (13 November).** The user will publish the whole app after six blocks, then run
a pilot: 1 weekly digest, 2 admin and plans, 3 concurrent editing, 4 PDF compliance report, 5 content
feedback, 6 hardening (legal pages, headers, rate limit, dark mode, e2e tests). The user asked that
every push come with the complete list of commands to run.

**Launch 4: the compliance report (PDF).** `lib/registre/rapport.ts` (`rapportConformite(reg,
amendments, texts, today, depuis)`: totals with taux = C/(C+NC) and progression = evaluated/applicable,
domains, open NCs with the constat of their last NC evaluation and an état en-retard / à venir / à
planifier, actions closed in the period (actionFaite), evaluations in the period, late or within 30
days, JORT alerts and new texts, the texts for the appendix; tests/rapport.test.ts).
`app/components/rapport-conformite.tsx`: portal into body (class `has-rapport`), toolbar (Fermer,
période depuis, annexe on/off, Imprimer / PDF = window.print), A4 sheet; print CSS hides everything
else, A4 12/10 mm margins, header rows repeat, the appendix starts a page; fixed column widths.
Button "Rapport de conformité (PDF)" in the register's head. Checked: Chromium's print to PDF (A4,
7 pages with the appendix of 50 texts), screen at 390 and 1440 without overflow.

**Launch 3: two people on one register.** Migration `20261116000000_versions.sql`: registres.version
(the stamp trigger sets 1 on insert, +1 on update); `save_registre(org, rid, rnom, rdata, expected)`
(security invoker, so RLS applies): inserts when absent (a register removed meanwhile is re-created
with the work in hand), refuses with `(false, version, current data)` when `expected` differs,
raises when RLS blocks the update; the table joins `supabase_realtime` with a column list (id,
version…), when the publication exists. rls.sql: 7 checks (61). `lib/registre/merge.ts`
(`mergeRegistre(base, mine, theirs)`, tests/merge.test.ts). `lib/cloud/sync.ts` rewritten: initial
`{registre, version}[]`, `io.save(r, expected) → Saved`, conflict → merge with the last copy read
(`bases`) and retry up to 3 times, a newer local change rebased on the merge, `onMerged(ids)`;
`applyRemote`, `applyRemoval`, `versionOf`. api.ts: `fetchRegistres` returns versions (falls back
before the migration, then saves by upsert), `fetchRegistre`, `saveRegistre`. cloud.tsx: the
workspace's backend uses them; focus/visibility re-read applies remote copies; Realtime channel per
workspace (INSERT/UPDATE filtered on the workspace, DELETE unfiltered: unknown ids ignored; an event
whose version is not newer is our own save); `REMOTE_EVENT` → a notice on the open register
(`remote-toast`). Checked: unit tests; against the stand-in, Alice and Bob on the same register,
Bob saving from the old version: both evaluations stored (versions 1 → 2 → 3), Bob told of the
merge, Alice sees Bob's evaluation on focus. Realtime itself is not exercised here (no Realtime
server in the stand-in): to check on the real project with two browsers.

**Launch 2: offers and administration.** Migration `20261115000000_plans.sql`: `platform_admins`
(+ `is_platform_admin()`); organizations.plan (essai/standard/pro/interne), ends_at (default now+30
days, also for existing rows), max_registres (2), max_membres (3); column grants: members update
organizations.name only, profiles.full_name/notifications only; `workspace_active(org)`; write
policies on registres, invitations and storage `preuves` require it; triggers `registres_limit`
and `invitations_limit` (members + invitations); admin RPCs `admin_workspaces()` (counts, owners,
last activity), `admin_workspace_members(org)`, `admin_set_plan(...)`. rls.sql: 19 new checks (54).
App: `lib/cloud/plans.ts` (PLANS presets, `etatOffre`, `limiteAtteinte`); `Workspace.offre`
(myWorkspaces falls back to id/name before the migration); `canWrite`/`canInvite` (role and offer)
replace canEdit in the UI and the sync backend; `OffreBanner` (home, registers); limits on register
creation and invitations; Cloud.isAdmin; `app/components/admin.tsx` (tiles, filter chips, search,
rows, sheet with presets/+30 j/+1 an/sans fin/limits and members). Nav: "Administration → Clients"
in the side menu and the account sheet; `?vue=admin`. `[hidden]` now wins over display rules.
Checked against the stand-in (it gained the offer select and multi-row RPCs): trial banner, 3rd
register refused, admin list and sheet, Standard preset saved, end set to yesterday → read-only
(banner, no new/delete/restore, no evaluation form), phone and desktop, no errors.

**Evaluation form adapts to the answer (13 November, asked by the user).** Conforme: a comment
(optional) and evidence only. Non applicable: a justification. Non conforme: constat, evidence,
then risk and the action plan (action, responsable, échéance) in the same form, saved on the text by
`evaluer(..., { action })`. The "Plan d'action" section shows only while the text is non conforme
(with its risk); a conforme text shows "Action réalisée le …" as a pill; "Exigences" no longer
shows risk or plan once evaluated (risk stays as a draft before the first evaluation). Evidence has
a third kind, a written note (`Preuve.texte`, `preuveTexte`): Texte · Lien · Photo ou PDF. Excel's
history sheet writes "intitulé : texte". The ID-QSE-002 sheet follows (`ligneRow`): RISQUE, plan and
responsable/échéance only for a non-conformity (or as a draft before the first evaluation), empty for
conforme / non applicable; a 12th column "Constat et preuves" (L) holds the last evaluation's comment
(or justification) and its evidence (notes in full, links with their address, files by name) and
"Action réalisée le …". `evaluer` closes an action only on a conformity that follows an NC.

**Launch 1: the weekly digest e-mail.** `lib/notify/digest.ts` (pure: `digestRegistre` → late /
within-30-days evaluations, NC actions overdue / within 14 days / unplanned, JORT alerts, new
texts; `quiet`; `jortRecent` = important hits of the past 7 days), `email.ts` (`renderDigest`:
subject from what matters, inline-styled HTML + text, everything escaped), `send.ts` (Resend or
Brevo over HTTPS, List-Unsubscribe headers), `token.ts` (HMAC of the account id with CRON_SECRET).
`lib/cloud/server.ts`: `serviceClient()` (SUPABASE_SERVICE_ROLE_KEY, server only) and `all()`
(pages of 1000). `app/api/notifications/cron` (Monday 05:23 UTC in vercel.json; CRON_SECRET;
`?dry=1`, `?force=1`; reads profiles that want it, memberships, organizations, then the registers
one workspace at a time; the feed from `/veille/feed.json` of the site; skips accounts notified in
the last 6 days; stamps `notified_at`). `app/api/notifications/unsubscribe` (GET and POST).
Migration `20261114000000_notifications.sql` (profiles.notifications, notified_at). Mon compte: a
switch (`myNotifications`, `setMyNotifications`). `?vue=<view>` in the URL opens a screen.
Checked against the stand-in (service role = superuser there): 401 without the secret, dry run over
8 accounts (1 skipped, digests with actions "à planifier" and the week's JORT), forged unsubscribe
refused (400), real one sets notifications false, the switch writes the column. Tests:
tests/notify.test.ts.

**Step 4 (12 November): the compliance workflow, in a register rebuilt as a checklist.**

* Model (`lib/registre/registre.ts`): `Evaluation { id, date, enregistre, conformite, commentaire,
  par, preuves }`, `Preuve { id, nom, url? | path?, type?, ajoute, par? }`; `Ligne.historique`,
  `Ligne.preuves`, `Ligne.actionFaite`. `evaluer(l, {...})` sets conformite/evalue, appends to the
  history, clears actionFaite on NC and sets it on a C that follows an NC or a started action plan.
  `preuveLien`, `preuveFichier`, `preuvesDe`. Older registers lack the fields (all optional).
* Excel (`lib/veille/registre.ts`): `historiqueRows`, `fillHistorique` add a second sheet
  "Historique des évaluations" (date, texte, référence, conformité, par, commentaire, preuves).
* Evidence files: `supabase/migrations/20261113000000_preuves.sql` (bucket `preuves`, private, 10 MB,
  images + PDF; `preuve_org(name)` reads the workspace from the first folder; policies by
  membership). `supabase/tests/auth-stub.sql` stubs `storage.buckets/objects`; `rls.sql` has 6
  evidence checks. `lib/cloud/api.ts`: `uploadPreuve` (`<org>/<registre>/<ts>-<name>`),
  `preuveUrl` (signed, 1 h), `deletePreuve`. Local mode: links only.
* UI: `app/components/registre-view.tsx` replaces the old RegistreView/LigneCard (registres.tsx
  keeps the list and creation; `registre-shared.tsx` has Profil, useFiches, dateFr, classLabel,
  refOf). Head with progress bar and pills; the JORT/new/gone ToDo cards; chips (tous, à faire,
  NC, conformes, essentiels = top 30 by importance, suggestions); search; "Plus" (domain, Excel,
  profile, add a text); rows (`LigneRow`: title clamped, meta with state/next date or, for an NC,
  the action's deadline, responsible initials, evidence count; status pill); `LigneSheet`: a bottom
  sheet (a 560px right panel from 1000px, body gets `has-panel`), Escape closes: new evaluation
  (segmented C/NC/NA, date, fréquence, constat, preuves: file upload when signed in, link always),
  action plan (shown on NC or when started), exigences/risque, historique (newest first, signed
  URLs fetched when the sheet opens), pourquoi + modifications + retenir/retirer. Readers see no
  form. The stand-in for Supabase (scratchpad) gained the storage endpoints (insert into
  storage.objects as the user, so the policies answered): upload, record, signed link, row in DB
  checked on a phone viewport.
* Not done: deleting evidence from the UI, evidence on the Excel ID-QSE-002 sheet itself (only in
  the history sheet), a reminder of action deadlines on the home (the home counts late/soon
  evaluations only).

**Redesign (12 November): glass, mobile first, a home dashboard; the Mode d'emploi and Textes de
référence screens removed.** The user asked for an Apple-like, glassmorphism look, easy to use,
mobile first, with a premium dashboard, and the two documentation screens gone.

* `app/globals.css`: the old rules stay for layout; a theme block at the end sets tokens (system
  font stack, brand blue #0a6ed1, glass surfaces with backdrop-filter, radii 12/20, soft shadows,
  focus halo), restyles controls, cards, pills, segmented tab list, search field, result rows,
  veille and register cards, then the shell: `.topbar` + `.tabbar` (5 tabs) + `.sheet` below 1000px,
  a frosted `.sidebar` above. Dead CSS from the former headers (utility bar, masthead, primary-nav,
  mobile-nav, navy sidebar) was removed or is unused.
* `app/page.tsx`: views `accueil | search | establishment | registres | veille | report | equipe |
  compte` (`guide` and `sources` deleted with `Intro`/`Sources`, the help card, the footer link; the
  reference note is text only). Default view: the home, unless the URL carries a classification
  (`e`, `code`, `q`). `TAB_OF` maps each view to its tab (the top bar shows a back control on
  equipe/compte/report). `HEADINGS` per view; none on the home. Icons moved to
  `app/components/icons.tsx` (+ home, chevron, back, more, logout).
* `app/components/accueil.tsx`: greeting (name, workspace, read-only pill), stat tiles, quick actions,
  establishments (evaluation progress bar, conformity rate, pills: retard / à évaluer / NC / JORT /
  À jour), latest important hits; empty state with the two ways in. It reads the registers
  (`loadRegistres`, on CHANGED/RELOADED) and the feed (`useFeed`, now exported from veille.tsx).
  Opening a register or starting one from the home goes through `action` → `Veille` → `Registres`
  (`{ open?: id, create?: true }`, consumed with `onActionUsed`).
* veille.tsx: the Journal's "Numéros du JORT lus" shows the last three years and folds the rest.
* Checked in a browser at 390 and 1440 (local mode, and cloud mode against the Supabase stand-in):
  home empty/with data, new register, register, registers list, nomenclature, search, rubrique,
  dossier, veille, sign-in, onboarding, account sheet, team. No overflow, no page errors.
* Not done: dark mode (tokens would allow it, but many older rules hard-code white), the report's
  own print styles untouched, design-tokens.json / design-preview.html not updated.

**Step 3 of "next level" (12 November): accounts, client workspaces, and a side menu.**
The user wants a product to sell to several clients (ABC Consulting is a consulting firm). Their
choices: client workspaces with the firm's consultants invited in; Supabase; e-mail + password;
free for now (no billing; Stripe does not take Tunisian companies; Konnect/Flouci later if needed).
They do not want the scheduled JORT reading set up for now (the Vercel cron route stays, inactive
without `CRON_SECRET`: it answers 401).

* `supabase/migrations/20261112000000_workspaces.sql`: profiles (trigger on auth.users), organizations,
  memberships (role enum owner/admin/editor/viewer), invitations (by e-mail; no e-mail sent by the
  database: the app shows a message to send), registres (one JSON document per register, stamped
  updated_at/updated_by by trigger). RLS on all; helpers `my_role`, `is_member`, `shares_workspace`
  (security definer); memberships change only through `create_workspace`, `accept_invitation`,
  `set_member_role`, `remove_member` (a workspace keeps an owner; admins cannot touch owners);
  `my_invitations` gives the invitee the workspace's name. Idempotent.
* `npm run test:db` (`scripts/test-db.sh`): a throwaway PostgreSQL (initdb; as the postgres account
  when run as root), a stub of Supabase's auth schema (`supabase/tests/auth-stub.sql`: roles anon and
  authenticated, auth.users, auth.uid() and auth.jwt() from `request.jwt.claims`), the migration
  twice, then `supabase/tests/rls.sql`: 29 checks (stranger, editor, viewer, invitations, last owner,
  anonymous). A deliberately broken check fails the run.
* `lib/registre/registre.ts`: `RegistreBackend`; `loadRegistres`/`saveRegistres` use it when set
  (cloud), localStorage otherwise; `RELOADED` event (registres.tsx reloads its list on it);
  `localRegistres`/`clearLocalRegistres` for the import.
* `lib/cloud/`: `client.ts` (`cloudEnabled` from NEXT_PUBLIC_SUPABASE_URL/ANON_KEY), `api.ts` (all
  queries and RPCs; roles and labels), `sync.ts` (`diff`, `cloudBackend`: per-register upserts and
  deletes, debounced (1.5 s in the app), retried after 5 s on failure keeping newer versions, read-only
  for viewers; unit-tested in tests/cloud.test.ts).
* `app/components/cloud.tsx`: `CloudGate` (local mode = the app as before), sign-in / sign-up /
  password reset (French messages), `NewPassword` after a recovery link, onboarding (invitations +
  create), `WorkspaceSwitcher` (name, role, sync state), `LocalImport`, `ReadOnlyNotice`; re-reads
  the registers on focus/visibility when nothing is pending; warns before leaving with changes unsent.
  `app/components/equipe.tsx`: members, roles, invite (message to copy or mailto), pending
  invitations, rename, other workspaces, delete (type the name); Mon compte (name, password, sign out).
* Layout: `app/page.tsx` has a navy side menu (groups Classement, Conformité, Ressources, Espace de
  travail; Registres is now its own screen, with the alert count; Veille réglementaire = the Journal
  with « Vérifier maintenant »); below 1000px a top bar and a drawer. The utility bar, masthead,
  horizontal nav and phone bottom bar are gone (their CSS stays, unused). `HEADINGS` per view.
  `Veille` takes `tab` from the page (no inner tab bar). DESIGN.md updated.
* Checked end to end in a browser against a stand-in for Supabase (auth in memory, the app's REST
  calls run as SQL on the local PostgreSQL as role authenticated with the user's claims, so the RLS
  answered): sign-up → workspace → register created and saved (988 lines, 830 KB JSON) → invite →
  second account joins, sees and edits → demoted to reader (read-only notice, nothing saved) → a third
  account sees nothing → a browser register imported. Desktop 1440 and phone 390, no overflow.
* Known limits: a register is one JSON document (~0.8 MB), re-sent whole on each change (debounced);
  per-line storage would be the next step if it is slow on site connections. No real-time push (focus
  re-read). Two people editing the same register at once: the last save wins. The JORT reading notes
  (Journal statuses) stay per browser. No platform admin page or plans/limits yet (billing "free for
  now"). Supabase's default mailer only writes to the project team: SMTP needed for clients.

**Step 2 of "next level" (12 November): the veille runs on its own, and on demand.**

* The scheduled reading first ran on GitHub Actions; the user cannot use Actions (not free for
  them), so it was replaced the same day by a **Vercel Cron Job**: `vercel.json` calls
  `GET /api/veille/cron` daily at 05:17 UTC (Hobby: daily at most, within the hour), guarded by
  `CRON_SECRET`. `lib/veille/store.ts`: `runVeille` reads the branch's sommaires through GitHub's
  REST API (raw contents, any size), `checkJort` (at most 6 issues), then `storeIssues` reads the
  fiches of the new texts in the issues' whole OCR text (`hitsOf`, `bodies`, `readFiche`, as
  `readFiches` in the script) and commits `data/veille/sommaires/<year>.json` and
  `data/veille/fiches/<year>.json` in one commit (git data API: tree, commit, ref fast-forward,
  retried if the branch moved). Checked against jort.tn: n° 108–109/2026 gave the same files as
  `npm run veille`, in 14 s. The commit makes Vercel rebuild. A library scheduler (node-cron…)
  cannot work on Vercel: nothing runs between requests.
* `lib/veille/live.ts` (`checkJort`, `readOcrSommaire`, `withLive`) and `app/api/veille/route.ts`:
  the "Vérifier maintenant" button (top of the Veille view, `Verifier` in veille.tsx). The server
  reads the catalog and the OCR sommaires of the issues the feed lacks (this year, and last year in
  January; at most 8 per check, the numbers past the catalog tried too); the page runs `record` and
  `amendments` on them, keeps them in localStorage (`abclassement-veille-direct`) until the feed has
  them, and reports texts found, those important, and for the registers of this browser the new
  texts that apply and the texts modified. With `VEILLE_GITHUB_TOKEN` (Contents: read and write) and
  `VEILLE_GITHUB_REPO` set on the deployment, a check that finds issues also commits them
  (`storeIssues`; « enregistre », or « deja » when another check stored them first).
* Register cards now show « N nouveaux textes à examiner » (`nouveautes`). An amendment read without
  a date counts from its year (`dated()` in registre.ts): two undated 2019 amendments used to show
  as « modifiés au JORT » on every new register.
* The register line's note says whether the résumé is written or read automatically from the
  articles, and whether the risk and plan are written: the fiches of new texts are drafts.
* Run on 12 November: n° 103 to 109 of 2026 read (2 texts found, both on veterinary medicines);
  the button found the same in 7 s.

**Step 1 of "next level" (12 November): a register an auditor can trust.**

* **Texts of general reach proposed where they apply.** Rules widened in watch.json: `dechets`
  reads lubricating oils, oil filters and used packaging (décrets 2002-693, 97-1102 and their
  amendments); `cahiers-des-charges` reads "procédures environnementales" (the 2006 cahiers des
  charges of EIE annex II); a new `handicap` rule ticks décret 2005-3087 (employment quota) for
  sites of 100 employees or more; the curated décret 2008-2745 (healthcare waste) applies to `sante`.
  An audit of legal acts of the core domains that applied to no site found nothing else of weight.
* **Superseded texts** (`data/referentiel/remplaces.json`, key = `resumeKey()`, value = what replaced
  it): texts overtaken without a repeal the JORT titles show — the 1957 work-accident law by loi
  94-28, the old production taxes by VAT, the 1970 distribution law, the 1964 and 1978 road codes,
  the old investment laws and their nomenclatures, the 1983 used-oil collection order, older lists
  and tariffs. 88 texts, taken from the résumés that say "remplacé" and from a reading of the
  pre-1995 essentials. `catalogue()` marks them `remplace` (no longer proposed) with `remplacePar`;
  a register that already holds one shows « Remplacé par … » like « Abrogé par … ». Ticked texts
  over all site profiles went from 1,101 to 1,051. Add an entry when a résumé or a reading shows
  another; anything uncertain stays out.
* **Written risk and action plan** (`data/referentiel/risques/lot-*.json`, key = `resumeKey()`,
  value = `{ risque, plan }`): written for every essential and ticked text (384 + 1,051, over all
  site profiles), in place of the generic wording made from the domain and the kinds of
  obligation (`FicheData.k` and `.q`, read by `defaults()` in lib/veille/fiche.ts; served through
  public/veille/fiches.json by `writeFiches`). The risk names the concrete consequence and the
  sanction when the text sets one; the plan says what to check or do on the site. Recurring kinds
  share one wording (amendments name the text they change, collective-agreement amendments, cahiers
  des charges, standards, old campaign and price texts); a text with nothing to apply says so
  (« Garder pour information »). `npx tsx scripts/resumes.ts --risques --stats` counts them,
  `--risques --next 60` lists the next ones with their résumé. A text that becomes ticked later
  has none until a lot is added for it.
* **Seen while writing them:** several texts of everyday weight sit in tier 2 (ticked) rather
  than among the 30 essentials of a profile: décret 2000-1989 (SST officer), décret 95-30
  (consultative committee from 40 employees), décret 69-208 (health and safety committees), the
  arrêté of 14 February 2007 (manual handling), the arrêté of 6 September 2012 (general rules for
  3rd-category classified sites) and the arrêté of 6 May 2015 (continuous emission monitoring).
  The ranking could weigh them more.
* **History of each text:** a register line shows every JORT text that modified it since it was
  published (`historique()`), newest first, those still waiting as alerts aside (before, an
  amendment marked as seen vanished). The Excel export adds to the résumé column « Abrogé par … »,
  « Remplacé par … » and « Modifié par … » (the six latest, short references).

**Cleaning after the user's BTP test register (11 November).** The user exported a construction
company's register (645 texts) and shared it. Found and fixed:

* **Junk ticked** (~45 rows: "LICENCIEMENT d'un Cheikh", "DESIGNATION des membres…", "CODE du Travail
  (suite)", price lists, communiqués): domain rules ticked any title. Now only a legal act (loi,
  décret, décret-loi, arrêté, décision, circulaire) is ticked (`LEGAL_ACTS` in referentiel.ts); the
  rest is suggested at most, and titles starting "Licenciement" or "Désignation" are ignored.
* **Real acts not recognised** (kind "Texte"): OCR misreadings ("ABBETÉ", "ARBETE", "ABRETE",
  "ARRETTES", "LDI N°") and list marks ("- Décret n° …") are now read by `kindOf`.
* **Wrong DOMAINE column** (~20 rows: "Conserves", "Huileries", "Aquaculture" in a construction
  register): the theme was the first activity rule's label. Each JORT text now keeps the theme of each
  rule that found it (`themes`); `proposals` gives the register the theme of the first rule that
  applies to the site (`themeFor`), and the ranking uses it.
* **Local one-off orders** (~100 hygiene rows of 1958-1973: fixed fines "pour contraventions aux
  règlements sur l'hygiène" of one town, rules "rendant applicables dans la commune de …"; also
  "dans la délégation / le gouvernorat / la ville de …"): ignored everywhere.
* **Old yearly texts**: SMIG decrees, wage increases and lois de finances are published every year;
  `registre.periodiques` (watch.json) lists those rules and wage titles are recognised, and only the
  texts of the two latest years are proposed (the older are `remplace`).
* **Other noise** ignored or demoted: individual decisions ("de ses fonctions"), staff statutes and
  grades, manuals of procedures, internal rules, arbitration councils, the code du travail maritime,
  bilateral social-security agreements, amnesties of late-payment penalties, social security of
  students and seamen; "contrôle technique" in the vehicles rule narrowed to "contrôle technique des
  véhicules" (it caught product import controls).

Same company profile (Construction de bâtiments, 50 employees): 645 → 463 texts, none of them junk;
the two construction themes are now the largest groups. Routes + VRD 495, electrical works 403,
general industry 282, offices 226.

**Still open from that test**, for the user: the résumé, risque and plan d'action columns are empty
(the "fiche" project discussed on 11 November: an algorithm on the OCR text for all texts, written
résumés for the ~400 essentials); about a third of the texts are from before 1980 and some are
overtaken without a formal repeal.

**Ranking (23 October): most important first, for any site** (`lib/registre/importance.ts`,
`importance(texte, site)` → `{score, raisons}`). The user asked that the veille put the most
important texts first, for every sector and every kind of work, not for one or two example sites.
Nothing in it is particular to a sector: the signals come from the text and from the site's own
profile.

| Signal | Points |
|---|---|
| Text the app is built on (nomenclature 2005 and its 2010 and 2012 amendments, décret 2006-2687, décret 2005-1991) | 40 |
| Curated in `textes.json` | 20 (4 in a `suggere` domain: finance) |
| On one of the site's activities (an `act-*` rule whose conditions hold) | 25 |
| Through one of its facts, rubriques, category or study | 16; 5 for facts beside the process (`vehicules`, transport, `import-export`, `commerce`) |
| Conditions every site or employer meets (`tous`, `classe`, `effectif`) | 0 |
| Cited by later JORT titles (`feed.citations`, `texte.cite`) | 6 × log2(1 + n), at most 20 |
| Kind | law promulgating a code 20, loi 14, décret-loi 12, décret 9, arrêté 5, circulaire/décision 3 |
| Domain | établissements classés 12, environnement 10, SST 10, incendie 9, produits dangereux 9, hygiène 7, secteurs 6, travail 6, finance 0, route −4 |
| Wording | general rules ("fixant les règles", "relatif à la prévention/réglementation"…) +5; only modifies another −8; composition, organisation, creation, ratification, temporary measure −6 |
| Recent | +4 since 2015, +2 since 2000 |

Citations: `citations(years, texts)` (referentiel.ts) counts, for each text, the later JORT titles
whose citations name it (`n:`/`d:` keys); the scanner stores them in `feed.citations`
(`--reassess` recomputes). The register view shows **"Les 30 textes essentiels pour ce site"**
(`ESSENTIELS` in registres.tsx) above the domain groups, sorts each group, the "new texts" panel and
the Excel export by the same score, and prints the reasons under each title ("votre activité :
Huileries…", "votre site : rejets d'eaux usées industrielles", "cité par 7 textes", "code"…).
Checked on rubriques of every section (1101, 1213, 1305, 1419, 1511, 1613, 1709, 2505, 2601…):
the base texts, the site's codes (eaux, sécurité incendie, travail), the waste law and the activity's
own texts come first. Known limits: a text matched by a broad rule still ranks with that rule's
weight (e.g. seeds classification through `denrees`); the fix is in the rule's terms, not in the
ranking. An AI pass to read whether a text still applies was discussed and left for later.

**Register lifecycle** (`lib/registre/registre.ts`, UI in `registres.tsx`):

1. Validated report → "Créer le registre de veille" → profile step (name required; classification
   facts shown; effectif and facts to tick). If a register **of the same name** exists: update it
   (evaluations kept; category, rubriques, study follow; facts of removed rubriques unticked) or
   create another.
2. Register view: summary counters; to-do panels (each shows 3 items, "Voir les N autres"):
   * **modified at the JORT** (`alertes`): **only modifications published since the register was
     created** (`cree`); "Ajouter ce texte et réévaluer" or "Réévaluer seulement" (the amendment
     id goes to `vus`). Earlier modifications are the text's history: **"Modifié par N textes"**
     folded on its card (`modifiePar`);
   * **new texts for this site** (`nouveautes`): Ajouter / Écarter / Tout ajouter;
   * **no longer applicable** (`plusApplicables`): Retirer / Garder (`garde`).
3. Texts grouped by domain in collapsible sections; each card: retenu, theme, état badge, title
   (link to the JORT page), why; conformité, last evaluation, frequency; details: résumé, risque,
   plan, responsable, échéance.
4. Due evaluations (`prochaine`): jamais évalué / en retard / sous 30 jours / à jour. The **menu
   badge** counts JORT modifications + late or soon-due evaluations (never-evaluated texts left out).
5. Excel export (ID-QSE-002 columns).

**Storage:** `localStorage` key `abclassement-registres` (the user chose "in the app"; no server).
Saved after rendering (an effect), then a window event `abclassement-registres` lets the badge
recount; "Sauvegarder les registres" / "Restaurer une sauvegarde" (JSON file, merges by id). Journal
statuses (à lire / pertinent / sans objet) are in `abclassement-veille-statuts`.

---

## 8. UI decisions (pages were too long)

Measured with Playwright (desktop 1300 px / phone 390 px):

* Journal officiel: one compact line per text (title clamped to 3 lines, details on click), 20 at a
  time → 42,000 / 65,000 px became 3,300 / 4,400.
* Report on its own page (with a contents bar); Mon établissement keeps a summary card → 8,000 /
  12,200 px became 2,600 / 3,400.
* Rubrique detail directly under the search box, sector grid hidden while open.
* ANPE steps and explanations folded; compact header; register texts grouped by domain.
* "Tout retirer" asks first; no horizontal overflow on phone anywhere.
* Not re-measured since the data grew to 7,050 flagged texts: the Journal is paged, but a register
  with ~700 lines and `feed.json` at 5 MB should be checked in the browser (§11 step 4).

---

## 9. Data state (22 October 2026, evening)

**All French issues of 1957-2026 are read: 6,390 issues, 181,291 titles.** 1957-1986 were read by
the user on the laptop (pushed as "Veille: JORT 1957-1986" and "Veille: reread"); then `--reread`
ran in the cloud session with the Arabic reading.

* **36 issues with no title**, of which **27 scans with no OCR text yet** (`sansTexte`: 9 in 1958,
  the rest spread over 1959-1987) and a few layouts not understood (2023 n° 5, 2024 n° 31, 32, 86,
  2022 n° 92, 2025 n° 3: to look at) and Arabic files whose sommaire was not found (2023 n° 100,
  2024 n° 12, 145).
* **94 Arabic files** of the French collection read in Arabic (`arabe: true`): 30 in 2019, 18 in
  1958, the rest spread out.
* Titles per year: about 1,100-1,500 in 1957-1972, 2,000-2,500 in 1973-1995, 2,600-4,500 since.
* Rules applied to all: **12,044 texts flagged**, **1,182** modifications of référentiel texts.
* Most issues come from the OCR text; 2024-2026 keep most of their PDF readings where those gave
  more titles (`--ocr` compared both).

To get the per-year table again: count `issues`, `entries` and flags in
`data/veille/sommaires/<year>.json` (a few lines of Python or Node).

---

## 10. Decisions taken with the user

* Veille scope: all sectors of the nomenclature + SST, hygiène, incendie, produits dangereux; then
  code du travail, code de la route, RH, finance.
* The client register the user showed (ID-QSE-002) is **only an example**: do not use it as a
  target or a benchmark, and do not copy its wording (its summaries and risks were removed from
  `textes.json` on 22 October); the goal is to collect laws from the JORT and
  other sources so that going from classement to veille leaves only checking and adjusting.
* Registers live **in the app** (browser storage + backup file); no client-management workflow.
* Site criteria: all of them (workforce, vehicles, equipment, products, discharges, site), for all
  sectors.
* Conformity is evaluated **per text** (not per requirement).
* `feed.json` is derived and not versioned; only `data/veille/sommaires` is committed.
* **22 October:** every law related to the site's sector is **ticked automatically**, for every
  sector ("construction & bâtiment", "agro-alimentaire (huilerie : trituration et
  conditionnement)" were the user's examples) → the activity rules.
* **22 October:** taxes, customs and loi de finances: **suggested, not ticked**.
* **22 October:** the user reads 1957-1986 on the laptop (§2).
* **22 October:** registers tick **base texts + every text on the site's activities**; a JORT text
  that only modifies another is ticked only for the site's activities (or a reference text), else
  suggested.
* **22 October:** an Arabic file found in the French collection (OCR text or PDF) is **read in
  Arabic and its texts added**; the Arabic collection as a whole is **not** downloaded.
* Not answered yet: how to cut the number of ticked texts further (§11 step 3); should subsidies/
  aid to a sector (subventions, primes) appear as information? (Currently ignored.)

---

## 11. Next steps (in order)

1. ~~Finish reading 1957-1986~~ (done 22 October). Next: run `npm run veille -- --reread` now and
   then (scans whose OCR text comes out, Arabic files), and look at the few issues of §9 whose
   layout is not understood.
2. **Review the rules on the old years.** Titles of 1957-1975 are in capitals and use old names
   (Secrétariat d'État, DECRET N°…); look at hits per rule and at what is missed (`--list`).
   Watch for OCR typos ("ARRETTES", "DECLET"). One title gave a date in "1020": OCR misreads of
   years exist.
3. **Registers are still large**: after the activity rules were tightened and repeals detected
   (22 October): galvanisation 466, chemical plant 723, huilerie 766, BTP 621, workshop 457
   ticked. The bulk is general obligations over 70 years (hygiène ~103, code du travail ~91, CNSS
   ~78, AT/MP ~52), many overtaken without a formal repeal: next lever is reading whether a text is
   still in force (AI pass discussed with the user, offline, with reasons shown), or general texts
   older than N years as suggestions.
   Before (636-1,054 ticked with 1957-2026). Decided so far: base texts +
   activity; repealed texts dropped; importance ranking with an "essentiels" block (23 October,
   §7). Further idea, to put to the user with numbers: general texts older than N years as
   suggestions.
4. **Check the page with the large data**: open the Veille in the browser (`npm run dev`), create a
   register for a big site, measure load time (feed.json 8 MB with 1957-2026), the register's length and scroll,
   on desktop and phone. Consider paging register groups or loading the journal by year.
5. **Grow the curated référentiel**: other client registers (an importer for ID-QSE-002 files would
   help), and have a QSE specialist review the `when` conditions of the 74 texts and the 42 activity
   rules.
6. **Housekeeping:** `data/veille/feed.json` is tracked by mistake (stale, unused):
   `git rm --cached data/veille/feed.json` and add it to `.gitignore`. Delete `data/veille/probe/`
   if no longer wanted (5.4 MB; the OCR text replaced the OCR plan). Then a pull request
   `claude/veille` → `main` when the user asks.
7. Test `scripts/veille-hebdo.ps1` on Windows (it calls `npm run veille`, which now reads the OCR
   text first).
8. Legal readings still to confirm (README "Not done yet"): Qx of the addition rule, rubrique 2724
   reading, dépollution route (circulaire 27 still in force?), annexe 2 units that regularise.
9. Later: the Arabic edition (ocr.jort.tn has French only for now); `annonces-legales` collection
   (2004-2026) is not read.

---

## 12. How things were verified

* **Vitest** (104 tests): parsing of real JORT PDFs kept in `data/sources/` (2006 n° 83, 2010 n° 18)
  and of the probe's 2000 n° 40; parsing of 5 real OCR texts (`data/sources/ocr/`): wrapped titles,
  joined institutions, tables, lost page numbers, years at line end, partial downloads; rules on
  real titles (activity rules included); registers end to end (alerts after creation, history).
* **OCR vs PDF benchmark**: all 566 issues of 2023-2026 downloaded from ocr.jort.tn, parsed, and
  compared title by title (folded, apostrophes normalised, institution in the key) with the PDF
  readings: 98% found, 99% same page.
* **Samples across eras**: issues 1, 11, 30, 40, 55 of years 1957-1994 parsed and read by eye.
* **Local JORT mirror** for the PDF path (Range support; `JORT_BASE`), and **Playwright** for UI
  flows and page heights (Chromium at `/opt/pw-browsers/chromium`): see the README.
* Register sizes measured with a scratch script: `catalogue(reassess(all sommaires).hits)` then
  `proposals(texts, site)` for sample sites (§7 table).

---

## 13. Conventions and gotchas

* UI text is French; code, comments, README and commits are English. Comments explain *why*.
* Commits end with the two trailer lines used in this repo (`Co-Authored-By: …` and
  `Claude-Session: …`); never put a model identifier in commits or files. Push only to
  `claude/veille` (`git push -u origin claude/veille`); no pull request unless the user asks.
* **`\b` does not see a word end after an accented letter in JavaScript** ("Arrêté du", "Assemblée
  des…" never matched `\b`): write `(?!\p{L})` with the `u` flag. Fixed in `jort.ts` and
  `markdown.ts`; check any new regex.
* **Kinds of text** (`kindOf`) are read without accents ("DECRET", "ARRETE"); a hit's kind is taken
  from its title each time rules are applied, so stored kinds don't matter.
* In a cloud session, **Node's fetch needs `NODE_USE_ENV_PROXY=1`** to go through the proxy.
* **The tool layer turns `\uXXXX` escapes into the characters themselves** when writing files from
  a session: write Unicode ranges in code through a script (`chr(92) + "u0600"`) to keep them
  readable as escapes.
* **Downloads go through `lib/veille/fetch.ts`** (`fetchRetry`, `fetchText`): 60 s timeout, retries
  after 2, 5, 15, 30 s on a reset, a timeout, 408/429/5xx. Before it, one `ECONNRESET` on the
  user's home connection ended the run, and a stalled download hung it.
* The cloud session has a **stop hook** that asks to commit and push whenever the work tree is
  dirty: during a long scan, commit the sommaires as checkpoints.
* `.gitattributes` forces LF; Python scripts read/write UTF-8 explicitly (Windows cp1252 broke
  them once); `scripts/veille-hebdo.ps1` is saved with a UTF-8 BOM (Windows PowerShell 5.1).
* pdf.js **takes over the buffer** passed to `getDocument`: measure `data.length` before.
* Never update another component's state while rendering (registers are saved in an effect).
* In the cloud shell: `pkill -f <pattern>` / `pgrep` can match the shell's own command line and kill
  it; split the pattern. `rm -rf` on a relative path after `cd` is refused: use absolute paths.
  Scripts outside the project cannot resolve its packages: put scratch scripts under the project
  (`scripts/scratch/` is excluded in `.git/info/exclude` of the cloud copy only).
* `tsx` loads a module once: **a scan running in the background keeps the parser it started with**;
  stop and restart it after changing the parser (data read by the old one: delete that year's file
  or re-read it).
* The JORT numbering: an issue's own number may differ from its address: the address number is kept.
* Editing `watch.json`: keep its layout (one rule per line); a JSON re-dump rewrites the whole file.
