# EDII: classement des établissements dangereux, insalubres ou incommodes

A web app that classifies a Tunisian establishment under the nomenclature of *établissements
dangereux, insalubres ou incommodes*: **1ère**, **2ème**, **3ème catégorie** or **non classé**.
It also tells which environmental study the ANPE expects: étude d'impact (catégorie A or B),
cahier des charges, étude de dépollution or demande d'avis.

No AI is involved. The categories and thresholds come from the official texts (`data/sources/`),
read by OCR for the scanned ones, checked, and stored as data. Each result shows the text it
comes from.

## Run it

Needs Node.js 22. No database, no account.

```bash
npm install
npm run dev        # http://localhost:3000
```

```bash
npm run typecheck
npm test           # classification, addition rule, ANPE study, and data in sync with the texts
npm run build && npm start
```

Two tests re-run the data pipeline to check the JSON files still match the texts. They need
Python 3.10+ (and `pdftotext` from poppler for the decree) and are skipped without them, which is
fine on a laptop; CI installs both. The `npm run data:*` scripts find Python on any system
(`python3`, `python` or `py` on Windows).

It deploys as is on Vercel (import the repository, keep the defaults): the page is static.

## How to use it

1. Search each activity or substance of the establishment (words or rubrique number), or browse
   a section, and add it with **+**.
2. For each activity, choose its case and enter its quantity or capacity. The establishment takes
   the most severe category of its activities (décret n° 2006-2687, art. 5), and the addition rule
   (arrêté du 23 février 2010, art. 2 bis) is applied to the substances of one group.
3. In **Étude environnementale (ANPE)**, give the situation (new project, extension, unit already
   operating), whether the site can affect a protected area, and each activity's entry in
   décret n° 2005-1991. The page gives the study, the ANPE's review time and the steps.
4. **Valider et générer la synthèse** opens the detailed report on a page of its own (print to PDF,
   HTML, JSON, with a contents bar to jump to its sections); Mon établissement keeps a summary card
   of it, which says when the dossier has changed since.

Everything entered is kept in the page address, so a classification can be bookmarked or shared.

## Veille réglementaire

The **Veille réglementaire** view lists the texts published in the Journal Officiel (JORT) that
concern the establishments the app classifies. They're read from each issue's sommaire, in the
French translation, from [jort.tn](https://jort.tn), a mirror of the JORT since 1957:

* `https://index.jort.tn/catalog`: every issue published, year by year;
* `https://ocr.jort.tn/journal-officiel/fr/<year>/<nnn>.md`: the OCR text of each French issue
  (Markdown, pages separated by `<!-- page:N -->`), scanned issues included;
* `https://lake.jort.tn/journal-officiel/fr/<year>/<nnn>.pdf`: the PDF.

```bash
npm run veille                                   # the issues of this year not read yet
npm run veille -- --year 2025                    # the issues of 2025 not read yet
npm run veille -- --year 2026 --from 1 --to 30   # read (again) issues 1 to 30 of 2026
npm run veille -- --years 1957-2022              # older years, most recent first
npm run veille -- --reread                       # read again the issues that gave no text
npm run veille -- --ocr --years 2023-2026        # issues read from the PDF: read their OCR text, keep the longer reading
npm run veille -- --file jort.md --year 2010 --number 18    # an OCR text (or a PDF) already on disk
npm run veille -- --probe                        # sample old PDFs (see data/veille/probe)
```

**Where each issue is read.** From its OCR text first (`lib/veille/markdown.ts`): only its first
64 KB are downloaded, the whole text only when the sommaire runs on. The OCR text gives the
sommaire in the order printed: sections, institutions (headings, bold or capitals) and titles
ending with their page number; a title wrapped over several lines (until about 1975) is held until
its page; a title whose page number the OCR lost takes the next title's page; the sommaire ends where
the texts start ("Par décret…", "Nous, …", "Vu …", or a section heading seen again on a later
page). When an issue has no OCR text yet (the newest, for a few minutes or days), or no sommaire
in it, its PDF is read (`lib/veille/pdf.ts`, `jort.ts`): only the parts of the file its sommaire
pages need, so an issue of 100 MB costs a few hundred kilobytes. An issue keeps the source it was
read from (`source: "ocr"` or `"pdf"`); a scan with no OCR text yet is kept as `sansTexte` and read
again by `--reread`.

On the 566 issues of 2023 to 2026, the OCR reading finds 98% of the titles the PDF reading finds,
and more in 133 issues (PDFs whose text is cut up, sommaire pages the PDF reading did not see).
The PDF reading is kept where it found more.

**Arabic issues in the French collection.** Some files of the French collection are in fact the
Arabic edition (30 issues of 2019, 2023 n° 138 and 142, 2026 n° 11, 13, 44, 62, 76, 96, 98…). They are
read in Arabic rather than lost (`lib/veille/arabe.ts`, `readArabic` in `markdown.ts`): sections
(القوانين, الأوامر والقرارات), institutions (وزارة …), titles starting with their kind (قانون, أمر,
قرار, تسمية…), number and date ("عدد 25 لسنة 2019 مؤرخ في 26 فيفري 2019"), page numbers wherever the
OCR set them. The texts an Arabic title names are rewritten as a French title would name them
(`frenchCitations`: "تنقيح الأمر عدد 1991 لسنة 2005" → "décret n° 2005-1991"), so keys, amendments
and alerts work the same. The rules have Arabic terms in `data/veille/watch-ar.json` (by rule id,
plus Arabic ignore and demote lists), matched as substrings of the folded title (Arabic attaches
prefixes to words). With no OCR text yet, an Arabic PDF is read too: its lines are put right to left
(`toLines`), digits kept in order. Only Arabic files found in the French collection are read: the
Arabic collection itself is not downloaded.

PDF details, for the issues read from their PDF: issues of about 2000 to 2005 use fonts that write
glyph numbers instead of letters ("6RPPDLUH" for "Sommaire"), decoded by `lib/veille/glyphs.ts`;
some issues set their page numbers a few points lower than their titles' leader dots, put back on
their line.

The command runs on any computer that reaches jort.tn (in a cloud session behind a proxy, run it
with `NODE_USE_ENV_PROXY=1`, so that Node's `fetch` uses the proxy). It needs Node.js only: PDFs are
read with pdf.js, with no Python or poppler. Each run starts where the last one stopped and keeps what it read
if interrupted. Every sommaire read is kept in `data/veille/sommaires/<year>.json`: commit
`data/veille` to share them. The texts found (`public/veille/feed.json`, fetched by the page when the veille opens) are derived from the sommaires
and the rules, so that file is not kept in git: it is rebuilt by `npm run veille`, and before
`npm run dev` and `build`.

The veille follows ten domains: établissements classés (with zones industrielles and permis de
bâtir), environnement (eau, air, bruit, déchets, énergie), santé et sécurité au travail (médecine du
travail, accidents du travail et maladies professionnelles, prévention), hygiène et sécurité
sanitaire, sécurité incendie et protection civile, produits et substances dangereux, droit du travail
et RH (code du travail, contrats, conventions collectives, salaire minimum, CNSS, formation
professionnelle), code de la route et transport (circulation, véhicules, visite technique, transport
routier), fiscalité, finances et entreprises (loi de finances, impôts et taxes, douane, bénéficiaire
effectif, investissement, change), and the sectors of the nomenclature (élevage, agroalimentaire,
bois et papier, chimie, carrières et métaux, textile, hydrocarbures, radioactifs, normes…).
Each flagged text has a level:

* **critique**: its title cites a text the app is built on (the nomenclature of 15 novembre 2005,
  its 2010 and 2012 amendments, décret n° 2005-1991, décret n° 2006-2687, décret n° 68-88); the app
  may have to change;
* **important**: an obligation for companies (rejets, déchets, médecine du travail, hygiène,
  prévention des incendies, contrats de travail, loi de finances, véhicules…);
* **information**: the news of a sector, an international agreement, a one-off act (a centre de
  visite technique opened), or a text found only through the ministry that signs it.

A hit says its domain, the sections of the nomenclature it concerns (so it can be filtered by
sector) and, when it applies, which part of the app it touches. The issuer ("Arrêté du ministre de
l'industrie, des mines et de l'énergie du 3 mars 2026,") is left out before matching, so a ministry's
name is not taken for a subject. Ignored: nominations, concours and other careers of public
agents, the State's budget and accounts, the State's loans and guarantees, mining and oil permits,
expropriations, price fixings, awards and medals. Matching ignores accents and case, and only on
whole words. On the page, each reader can mark a text as "pertinent" or "sans objet"; that is kept
in their browser only.

The rules are in `data/veille/watch.json` (`domains`, `references`, `rules`, `ignore`,
`ignoreAnywhere`, `demote`). Every sommaire read is kept in `data/veille/sommaires/<year>.json`, so edited
rules can be applied again without downloading anything:

```bash
npm run veille -- --reassess
npm run veille -- --list --year 2026 > titres.txt   # every title read, flagged or not
```

A flagged text is something to read, not a legal conclusion.

**Export to the QSE register.** "Exporter vers le registre (Excel)" saves the texts shown (filters
included; pick the status "Pertinent" to export only those kept) as rows of the register de veille
légale et réglementaire, in the ID-QSE-002 layout: Système, Domaine, Type, Réf, Titre (linked to the
JORT page), Résumé exigence, Conformité, Fréquence d'évaluation, Risque, Plan d'action, Responsable.
Système, domaine, type, reference and frequency are filled in (`registre` in `watch.json` says which
système each domain belongs to); the summary of the requirement, conformity, risk and action plan are
left to whoever reads the text.

## Registers of the establishments

The classification leads to the veille. Once the synthèse is validated, "Créer le registre de veille"
opens the establishment's register in the Veille réglementaire view:

1. **Site profile.** The classification gives the category, the rubriques, the sectors and the ANPE
   study; the consultant adds the workforce and what the site has (vehicles, pressure equipment,
   lifting gear, chemicals, hydrocarbons, food, discharges, emissions, public, imports…). Facts the
   rubriques imply are ticked already (section 2500 → hydrocarbures, 1200 → denrées…).
2. **Texts proposed.** Every text of the référentiel that applies to the profile is proposed, ticked,
   with why ("Personnel salarié", "1ère catégorie", "Rubrique 2505", "Étude d'impact"…); sector news
   is listed as unticked suggestions. Any other text of the référentiel or of the JORT can be added by
   search.
3. **Evaluation**, text by text, as in an ID-QSE-002 register: conformity (C / NC / non applicable),
   date of the last evaluation and frequency, summary of the requirements, risk, action plan,
   responsible and deadline. The register is exported to Excel in the ID-QSE-002 layout.
4. **Follow-up.** The register says which evaluations are due (never done, late, within 30 days),
   which of its texts a new JORT text modifies ("modifiant l'arrêté du 10 janvier 1995…": add that
   text to the register and re-evaluate, or re-evaluate only), and which new texts apply to the site
   (to add, all at once or one by one, or set aside). The **Veille** menu shows how many modified texts
   and late or soon-due evaluations wait in all registers.
5. **When the classification changes**, validate it again and choose "Créer le registre de veille":
   the app finds the register of the same name and offers to update it. Its evaluations are kept;
   category, rubriques and study follow the new classification; the facts implied by rubriques gone
   are unticked; texts that now apply come as new texts, and those that no longer apply are listed
   to remove or keep.

The **référentiel** is every text a register can hold: `data/referentiel/textes.json`, curated (seeded
from an ID-QSE-002 register: title, summary, risk, and `when`, the conditions under which a text
applies), and every text the veille finds in the JORT, whose conditions are those of the rule that
found it (`when` in `data/veille/watch.json`). Conditions are listed in `lib/registre/profil.ts`:
`tous`, `classe`, `categorie:1`, `secteur:1200`, `rubrique:2505`, `etude:eie`, `effectif`,
`effectif:50`, or a fact of the profile (`vehicules`, `levage`…); `a+b` needs both. To widen the
référentiel, add texts to `textes.json`, or read older JORT years with `npm run veille -- --year 2015`.

Registers are kept in the browser that created them (no account, no server). "Sauvegarder les
registres" saves them all to a file, and "Restaurer une sauvegarde" brings them back, on this computer
or another: save regularly.

**Weekly reading of the JORT.** `scripts/veille-hebdo.ps1` reads the new issues and, with `-Push`,
commits and pushes the sommaires so that every copy of the app gets them. To run it every Monday at
8:45 with the Windows task scheduler, from the project folder in PowerShell:

```powershell
schtasks /Create /SC WEEKLY /D MON /ST 08:45 /TN "ABClassement veille" /TR "powershell -ExecutionPolicy Bypass -File $PWD\scripts\veille-hebdo.ps1 -Push"
```

The project path must have no spaces, and the laptop must be on and connected at that time; each run is logged in `data/veille/veille-hebdo.log`.

## Layout

| Path | What |
|---|---|
| `app/page.tsx` | The page. |
| `lib/classify.ts` | One rubrique: search, thresholds, units, outcome. |
| `lib/establishment.ts` | Several activities, the addition rule, and the URL form. |
| `lib/studies.ts` | The ANPE study, from décret n° 2005-1991. |
| `data/sources/` | The official texts (PDF). |
| `data/pipeline/` | `ocr.py` (scans → `data/ocr/`), `parse.py` (→ `data/nomenclature.json`, `data/review.md`), `eie.py` (decree → `data/eie.json`). |
| `data/corrections.json` | OCR misreads fixed, and low-confidence digits confirmed, by hand. |
| `data/eie-links.json` | For each rubrique, the entries of décret n° 2005-1991 it may fall under, and when (a reading; the user chooses). `data/eie-links.md` shows it as a table to review. |
| `lib/veille/` | Veille réglementaire: reading a JORT sommaire from its OCR text (`markdown.ts`) or its PDF (`pdf.ts`, `jort.ts`), the watch rules (`watch.ts`), and the export to the QSE register (`registre.ts`). |
| `scripts/veille.ts` | `npm run veille`: reads new JORT issues into `data/veille/sommaires/`, and the texts found into `public/veille/feed.json`. |
| `data/veille/` | `watch.json` (the rules), `sommaires/` (every sommaire read) and `feed.json` (the texts found; derived, not in git). |
| `app/components/veille.tsx` | The Veille réglementaire view: registers and Journal officiel tabs. |
| `lib/registre/` | Registers of the establishments: the site profile and its conditions (`profil.ts`), the référentiel (`referentiel.ts`), a register, its alerts and due evaluations (`registre.ts`). |
| `data/referentiel/textes.json` | The curated référentiel. |
| `app/components/registres.tsx` | The registers: list, site profile, register and evaluation. |
| `tests/` | Vitest suite. Expected categories were read off the scans. |

## Texts

| File | Text | Role |
|---|---|---|
| `data/sources/2005-11-15-arrete-nomenclature.pdf` | Arrêté du 15 novembre 2005 (JORT n° 94) | The nomenclature (24 scanned pages) |
| `data/sources/2010-02-23-arrete-modificatif.pdf` | Arrêté du 23 février 2010 (JORT n° 18) | Annex 1 replaces rubriques, annex 2 adds rubriques, art. 2 bis adds the addition rule |
| `data/sources/2012-10-24-arrete-modificatif.pdf` | Arrêté du 24 octobre 2012 (JORT n° 88) | Same structure: annex 1 replaces, annex 2 adds |
| `data/sources/2005-07-11-decret-2005-1991-eie.pdf` | Décret n° 2005-1991 du 11 juillet 2005 (JORT n° 57) | Étude d'impact: annexe 1 (catégories A and B) and annexe 2 (cahiers des charges) |
| `data/sources/2006-10-09-decret-2006-2687.pdf` | Décret n° 2006-2687 du 9 octobre 2006 | Procedures per category (reference only, not parsed) |

`data/sources.json` says which pages hold the tables and what each annex does.

## Pipeline

```bash
npm run data:ocr     # stage 1: scans → data/ocr/<source>.json  (needs tesseract + fra, pdftoppm, numpy, Pillow)
npm run data:parse   # stage 2: OCR + corrections → nomenclature.json and review.md  (Python standard library only)
```

**Stage 1, `data/pipeline/ocr.py`.** OCR on a whole page mixes up the three columns (N° | Désignation | CAT).
For each page, the script:

1. renders the page at 300 dpi and straightens it, using the table's vertical rules,
2. finds the four vertical rules,
3. erases the dotted leaders (`animaux ........ 2`), which would otherwise swallow the unit
   (`10 t......` came out as `10 ts`),
4. OCRs the code column and the designation column separately,
5. finds each digit in the CAT column as a blob of ink, then reads it as a single character.
   Reading the whole column at once missed digits that touch a rule.

The output keeps every line with its position and confidence, so stage 2 can change without
running the OCR again. It is committed, so the OCR only runs again when a source changes.

**Stage 2, `data/pipeline/parse.py`.** It matches codes and categories to lines by position, and
cleans up recurring misreads (`1/j` → `l/j`, `m°` → `m3`, `It` → `1 t`…). It rebuilds each
rubrique's cases (`1)`, `a)`, `I)`) and parses each threshold into a numeric range in a canonical
unit (`supérieure à 2 t, mais inférieure à 75 t` → `2000 < x < 75000 kg`). Then it applies the
amendments in order. It writes:

* `data/nomenclature.json`: the consolidated rubriques in force, read by the app.
* `data/review.md`: what a person still has to check against the scans.

`data/review.md` lists low-confidence category digits, thresholds without a readable unit, and ranges
that overlap or go the wrong way (a larger quantity giving a less severe category). It also lists
odd digit grouping in the official text (`6 5000 kg` in the 2012 text) and corrections that no
longer match anything.

## Fixing a misread

Check the point against the scan (the reference is `source p.<PDF page> y=<pixel row>` at
300 dpi), then add an entry to `data/corrections.json`:

* `text`: replace `find` with `replace` in the lines of one source page,
* `category`: set the category of the line that starts with `line_starts`. This entry also
  confirms a low-confidence digit that is correct.

Run `npm run data:parse` and commit the result. `tests/edii.test.ts` fails when
`data/nomenclature.json` no longer matches what the parser produces.

## Classifying

The page at `/` classifies a whole establishment. Search each activity or substance, add it
with "+", then choose its case and enter its quantity. The list is kept in the URL, so a
classification can be bookmarked or shared.

`lib/classify.ts` classifies one rubrique:

* `search(query)`: rubriques by code (`2722 bis`) or words, ignoring accents.
* `classify(rubrique, { variant, quantity, unit })`: returns one of these outcomes:
  * `classified`: category 1, 2 or 3, or `NC` (non classé) below the smallest threshold.
  * `choose`: several cases of the rubrique may apply, and the text decides between them, not a number.
  * `needs_quantity`: the category depends on a threshold.
  * `unit_mismatch`: the quantity is in a unit the rubrique does not use.
  * `definition`: the rubrique only defines a family of substances and points to its sub-rubriques.

Units convert to the canonical unit of each threshold: t ↔ kg, l ↔ m3, kg/j ↔ t/j, MW ↔ kW, ha ↔ m2, MBq ↔ GBq.
When a condition can't be reduced to one number (two thresholds at once, or no unit), the
classifier shows the text instead of guessing.

`lib/establishment.ts` combines the activities:

* **Several activities.** The establishment takes the most severe category of its activities.
  Décret n° 2006-2687, art. 5: an establishment with several classified activities makes a single
  request, has a single public enquiry and gets a single authorisation.
* **Règle d'addition** (arrêté du 23 février 2010, art. 2 bis). When the establishment stores or
  uses two or more substances of the same group, it computes Σ qx/Qx. If the sum is above 1, the
  establishment is classed in *la catégorie supérieure qui suit*.
  * qx is the quantity held.
  * Qx is the threshold of the category just above the group's current one (the most severe
    category of its substances taken one by one, or 3ème when they are all non classé). At their
    own category, each classified substance alone would already reach 1, so the rule would always apply.
  * The groups are:
    * Groupe 1: 2703, 2704, 2706, 2708, 2722 bis 1, 2722 bis 2, 2723, 2724 bis 1, 2724 bis 2, 2725, 2726.
    * Groupe 2: 2711, 2712, 2713, 2715, 2720.
    * Groupe 3: the 2100 rubriques, 2402 to 2408, and the 2500 rubriques except 2503, 2506, 2507 bis, 2514, 2516.
  * Example: acétylène 30 t (2502) and hydrogène 30 t (2509) are each 2ème catégorie. With the 1ère
    thresholds (50 t each), 30/50 + 30/50 = 1.2 > 1, so the establishment is classed 1ère catégorie.

## Environmental study (ANPE)

The page also says which study the ANPE expects, under décret n° 2005-1991 du 11 juillet 2005
(`data/sources/2005-07-11-decret-2005-1991-eie.pdf`, a Word export, so its text is exact and needs no OCR).

```bash
npm run data:eie     # decree → data/eie.json  (needs pdftotext)
```

`data/pipeline/eie.py` splits the decree's three lists into 68 entries:

* annexe 1, catégorie A: 24 entries, étude d'impact, ANPE avis within 21 working days (art. 9);
* annexe 1, catégorie B: 26 entries, étude d'impact, ANPE avis within 3 months (art. 9);
* annexe 2: 18 entries, cahier des charges (art. 3).

These lists are separate from the EDII nomenclature: mostly sectors, some with their own
thresholds (t/j, t/an, ha, lits, MW), and some projects outside it (roads, lotissements, hotels).
The decree classes **units by their main activity**; the nomenclature lists **activities and
substances inside a unit**. `data/eie-links.json` bridges the two, rubrique by rubrique, following
these rules:

* **Fabrication** of a product → the sector entry (chemicals → B6, médicaments → A3, ciment,
  chaux, plâtre → B5…).
* **Stockage or emploi** of a substance → annexe 2 n° 14 (stockage de gaz ou de produits
  chimiques) only if the unit is a depot. Used inside a factory, the factory's own entry applies.
* **Ancillary activities** (chauffage, combustion, réfrigération, moteurs, parkings…) → no entry of
  their own, unless the unit is that activity (a power plant of at least 300 MW for combustion).
* A **specific annexe 2 entry** wins over a general annexe 1 one (féculeries → annexe 2 n° 12).
* Entries split by a threshold (déchets below or above 20 t/j, carrières below or above
  300 000 t/an) are both listed, each with its condition.

Each suggestion has a `when` (the condition it depends on), and optionally a `case` when it only
applies to one case of the rubrique (2101: "1) fabrication" → B6, "2) emploi ou stockage" → annexe 2
n° 14). A rubrique without a suggestion has a `note` saying what applies. The page shows the
suggestions with their conditions, a "no entry of its own" choice, and every other entry: **the user
chooses** each activity's entry.

`npm run data:eie` checks the file (every activity rubrique covered, every entry and case real) and
writes `data/eie-links.md`, the same suggestions as a table to review against both texts.

`lib/studies.ts` then decides:

| Situation | Entry | Study |
|---|---|---|
| New project, or existing unit extended, transformed or changing its process (art. 12) | annexe 1 A | Étude d'impact, catégorie A (3 months instead of 21 days near a protected area, art. 9) |
| same | annexe 1 B | Étude d'impact, catégorie B |
| same | annexe 2 | Cahier des charges |
| Unit already operating, regularising | annexe 1 or 2 | Étude de dépollution, on the ANPE's terms of reference |
| Any | none | Demande d'avis |

The establishment takes the most demanding study of its activities. The page lists the steps
with their articles: who writes the study (art. 2, 6, 7), how many copies go where (art. 8), the
ANPE's deadline and tacit agreement (art. 9), the avis of a protected area's manager (art. 10),
and that no authorisation comes before (art. 5).

## Not done yet

* **Reading of the addition rule**: the text does not say which threshold Qx is. The reading
  above (the category just above) is the only one under which the rule can ever leave a category
  unchanged; it should be confirmed.
* **Étude de dépollution**: it is not in décret n° 2005-1991. Circulaire n° 27 du 7 novembre 2024
  allowed it as a regularisation route until 31 December 2025; the page asks to check that it is
  still in force. Whether an existing annexe 2 unit regularises with a dépollution study or with
  its cahier des charges should be confirmed with the ANPE.
* **Reading of 2724**: the 2010 text restates rubrique 2724 as a definition only, in its "complete"
  annex, and moves the thresholds to 2724 bis 1 and bis 2. The parser treats the restatement as a
  replacement. This reading should be confirmed (see `data/review.md`).
