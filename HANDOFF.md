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
npm test                                 # 92 tests
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
npm test                 # vitest: 92 tests in 5 files
npm run typecheck
npm run build            # static page (rebuilds feed.json first)

npm run veille                               # new issues of this year
npm run veille -- --years 1995-2022          # those years' issues not read yet, most recent first
npm run veille -- --year 2026 --from 1 --to 30   # read (again) issues 1 to 30 of 2026
npm run veille -- --ocr --years 2023-2026    # issues read from the PDF: read their OCR text, keep the longer reading
npm run veille -- --reread                   # read again issues that gave 0 texts or glued titles
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
* **History:** checked against a real client register (ID-QSE-002, 76 texts): 72/76 flagged. On
  1986-2026 (4,312 issues): **7,050 texts flagged**, 855 modifications of référentiel texts.
* After editing rules: `npm run veille -- --reassess` (no download), then `--list` to review.

---

## 7. Référentiel and registers

**Référentiel** = `data/referentiel/textes.json` (74 curated texts: seeded from the client's
ID-QSE-002 register with its summaries and risks, cleaned by hand, plus the app's reference texts)
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
* of a **series** (`seriesKey`: subject without numbers and dates, ≥ 30 characters, not a
  modification: the SMIG of each year, each loi de finances), only the newest is proposed; the older
  ones are marked `remplace` and can still be added by hand;
* texts with no `when` (conventions collectives in general, marchés publics…) are added by hand
  only (a sectoral convention collective is caught by the activity rules).

**Measured on 1986-2026 data (22 October), ticked / suggested:**

| Site | Ticked | of which curated | Suggested |
|---|---|---|---|
| Chemical plant, 1st cat., 120 employees, many facts | 746 | 68 | 1,576 |
| Agro-food, 2nd cat., 60 employees | 732 | 62 | 1,316 |
| Huilerie (1213), 25 employees | 774 | 62 | 1,290 |
| BTP (chantier, véhicules, levage), 80 employees | 555 | 50 | 1,012 |
| Workshop, 3rd cat., 15 employees, no facts | 429 | 46 | 1,152 |

About 30% of the ticked JORT texts only modify another text; most of the rest are general labour,
CNSS, code de la route and environment texts across 40 years. **Too many** against the client's
76-text register: the user has to choose how to cut (§11 step 3).

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
* The client register (ID-QSE-002) is **one example**; the goal is to collect laws from the JORT and
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
3. **Decide with the user how many texts a register ticks** (§7 table: 430-775 with 1986-2026;
   re-measure with 1957-2026, it will be more). Options measured or discussed:
   * do not tick texts that only modify another (−30%): they show as "Modifié par" on their base
     text when it is in the register;
   * tick general (non-activity) JORT texts only from the last N years, or only base laws/decrees;
   * a register shows ticked texts grouped by domain already; a "principaux textes" view could rank
     curated + laws + decrees first.
   The user's own words: sector laws ticked automatically; finance suggested. Ask before cutting.
4. **Check the page with the large data**: open the Veille in the browser (`npm run dev`), create a
   register for a big site, measure load time (feed.json 5 MB), the register's length and scroll,
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

* **Vitest** (92 tests): parsing of real JORT PDFs kept in `data/sources/` (2006 n° 83, 2010 n° 18)
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
