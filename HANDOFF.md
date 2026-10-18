# ABClassement (repo `edii`): project handoff

State on **18 October 2026**, branch **`claude/veille`** (commit after `c030ad2`). This file is for a
new working session: what the app is, how it is built, what has been decided, what the data holds
today, and what comes next. `README.md` stays the reference for the classification pipeline and the
ANPE study; this file covers the whole project and its history, and does not repeat those details.

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
   (JORT, French edition, `lake.jort.tn`) issue by issue, from each issue's sommaire, and flags the
   texts that concern companies: établissements classés, environnement, santé et sécurité au
   travail, hygiène, incendie, produits dangereux, droit du travail et RH, code de la route,
   fiscalité, and the sectors of the nomenclature.
5. **Registres.** From a validated classification, the app creates the establishment's *registre de
   veille légale et réglementaire*: the texts that apply are proposed with why, the consultant adds
   or removes texts and evaluates each one (conformité C/NC/NA, risque, plan d'action, responsable,
   échéance), is reminded when evaluations are due, and is alerted when a new JORT text modifies a
   text of the register. Export to Excel in the client's **ID-QSE-002** layout.

**Where things stand:**

* Classification, ANPE study, report: done and tested.
* Veille: JORT **2023 to 2026** read (551 issues). Issues **1995 to 2025** read correctly (probe);
  **1995 to 2022 are not read yet** (the scan stopped after 2023). **1960 to 1990 are scans**:
  they need OCR, not built yet.
* Registers: done (browser storage), with alerts, reminders, update from a new classification.
* Branch `claude/veille` is **19 commits ahead of `main`** and not merged; no pull request yet.

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
* **Cloud sessions cannot reach the JORT.** `jort.tn` and `lake.jort.tn` are refused by the
  session's network policy. Everything that downloads JORT issues runs **on the user's laptop**;
  the user commits and pushes `data/veille/` and the session pulls it. To let a session download
  directly, the user must add both hosts under the environment's Network access → Allowed domains
  (https://code.claude.com/docs/en/cloud-environments#network-access).
* **Working loop used so far:** the session changes code and pushes `claude/veille`; the user runs
  `git pull` and the commands given, then pushes the data; the session pulls and reviews.

### Commands

```bash
npm install
npm run dev              # http://localhost:3000 (rebuilds public/veille/feed.json first)
npm test                 # vitest: 82 tests in 5 files
npm run typecheck
npm run build            # static page (rebuilds feed.json first)

npm run veille                               # new issues of this year
npm run veille -- --years 1995-2022          # older years, most recent first, resumable
npm run veille -- --reread                   # read again issues that gave 0 texts or glued titles
npm run veille -- --probe 1960,1970          # sample issues (2 per year) into data/veille/probe/
npm run veille -- --reassess                 # re-apply edited rules to stored sommaires (no download)
npm run veille -- --list --year 2026         # every title read, with its level ("-" = not flagged)
npm run veille -- --file x.pdf --year 2010 --number 18   # a PDF already on disk
JORT_BASE=http://localhost:3999 npm run veille -- …        # read from a copy of lake.jort.tn (tests)

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
| `app/components/registres.tsx` | Registers: list, new-register step (name, site profile, duplicate detection), register view (to-do panels, groups by domain, evaluation cards, add a text, Excel export), backup/restore. |
| `app/components/download.ts` | Browser downloads; `downloadWorkbook` (exceljs on demand). |
| `app/globals.css` | All styles (design tokens on `:root`; the user's redesign, see `DESIGN.md`, `design-tokens.json`, `design-preview.html`). |
| `lib/classify.ts`, `lib/establishment.ts`, `lib/studies.ts`, `lib/report.ts`, `lib/sectors.ts` | Classification, establishment and addition rule, ANPE study, report model, sector names (see README). |
| `lib/veille/jort.ts` | JORT sommaire parser: `parseIssue`, `isSommairePage`, `kindOf`, `isoDate`, `pdfUrl`, `pdfPage`. |
| `lib/veille/pdf.ts` | PDF → positioned lines: `pdfLines(data)`, `pdfLinesFromUrl(url)` (HTTP range requests), `pdfPageImages` (render pages to PNG/JPEG), `toLines`. |
| `lib/veille/glyphs.ts` | Decoder for 2000-2005 fonts that write glyph numbers instead of letters. |
| `lib/veille/watch.ts` | Rules engine: `assess`, `hitsOf`, `record`, `reassess`, `ignored`, `subject`, `fold`; types `Hit`, `Feed`, `Amendment`, `Sommaires`. |
| `lib/veille/registre.ts` | Excel export in the ID-QSE-002 layout (`fillRegister`, `registerRow` for JORT hits, `ligneRow` for register lines, `systeme`). |
| `lib/registre/profil.ts` | Site profile: `Site`, `FLAGS` (24 facts in 5 groups), `derivedFlags`, conditions `applies(when, site)` with reasons. |
| `lib/registre/referentiel.ts` | Référentiel: curated texts + JORT texts (`catalogue`), text keys (`keysOf`, `namedKeys`, `citedKeys`), `proposals`, `amendments` (JORT texts modifying a référentiel text). |
| `lib/registre/registre.ts` | Register model and logic: create, add, update from a new classification, new texts, texts no longer applicable, alerts, due evaluations, menu count, localStorage, backup/restore. |
| `scripts/veille.ts` | The scanner CLI (options above). |
| `scripts/veille-hebdo.ps1` | Weekly scan for the Windows task scheduler. |
| `scripts/python.mjs` | Finds a working Python on any OS for `npm run data:*`. |
| `data/sources/`, `data/ocr/`, `data/pipeline/`, `data/nomenclature.json`, `data/eie*.json`, `data/corrections.json`, `data/review.md` | Classification and decree data (see README). |
| `data/veille/watch.json` | Veille rules (domains, levels, ignore lists, `when`, register mapping). |
| `data/veille/sommaires/<year>.json` | Every sommaire read (committed; the source of truth of the veille). |
| `data/veille/probe/` | Probe samples: `<year>-<nnn>.json` (lines of the first pages, parse result) and, for scans, `<year>-<nnn>-p1.jpg`, `-p2.jpg` (150 dpi). |
| `data/referentiel/textes.json` | Curated référentiel (74 texts). |
| `public/veille/feed.json` | Texts flagged + amendments: **derived, not in git**, rebuilt by `npm run veille` and before `dev`/`build`. |
| `tests/` | `edii.test.ts` (classification, data in sync), `report.test.ts`, `veille.test.ts` (JORT parsing on real issues, rules, glyphs), `registre.test.ts` (Excel export, register recall), `etablissement-registre.test.ts` (profile, référentiel, registers). |

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

**Address of an issue:** `https://lake.jort.tn/journal-officiel/fr/<year>/<nnn>.pdf` (numbers from 1
each year, 3 digits). A missing issue answers 404 or an HTML page.

**What is read:** only the sommaire. `parseIssue(pages)`:

* header: issue number (`N° 18`) and date; `firstPage` from the first footer "Page N … Journal
  Officiel" minus its PDF page index;
* sommaire pages = pages with at least two lines ending in dot leaders + page number
  (`isSommairePage`); reading stops at the first page that is not;
* page 1 is skipped until the line "Sommaire";
* **institutions** (ministries) = lines less indented than titles (title indent = most frequent x
  of leader lines), or lines starting with Présidence/Ministère/Instance/Haute Instance/Conseil/
  Cour/Banque Centrale/Assemblée; consecutive institution lines join; **a line starting with a kind
  of text (Loi, Décret, Arrêté…) is never an institution** (laws sit as far left as headings);
* entry = title lines up to the leader line; `kind` from the first word; `numbers` = `n° 2006-2687`.

**Fixes from real issues** (all covered by tests):

* **Overlapping page-number digits** are split per character and re-sorted.
* **Glyph-numbered fonts (about 2000-2005)**: codes are glyph indices in the standard Macintosh
  order ("6RPPDLUH" = "Sommaire"; ASCII 3–97 = char + 29; 98+ = MacRoman order; pdf.js shows codes
  ≥ 128 as MacRoman). A font is decoded when any of its items contains a code below 32. Plain
  spaces are kept; apostrophes (code 10) come out as spaces and are restored after d/l/n/j/c/s/m/t/qu
  before a vowel. `lib/veille/glyphs.ts`.
* **Page numbers set 2–4 pt lower** than their leader dots (2000, 2020) are attached to the nearest
  leader line within 4 pt (`toLines`); this was gluing two titles together and losing texts.
* **Scans** (first pages < 200 characters of text) are stored as `sansTexte: true` with no entries.

**Downloads:** `pdfLinesFromUrl` asks for the first 64 KB with a Range header, then lets pdf.js fetch
only the chunks it needs (`PDFDataRangeTransport`, `disableAutoFetch`), and stops after the last
sommaire page. A 108 MB issue costs a few hundred KB. A server that ignores Range still works (whole
file). A failed chunk ends the read with a clear French error; the run is resumable.

**Scanning years:** `--years` goes most recent first; a past year ends after 3 missing numbers in a
row ("fin de l'année", or "année absente en français" if nothing was found); the current year stops
at the first missing number. Each issue is saved right away (sommaire + feed).

**Probe results (October 2026, two issues every 5 years):**

| Years | French edition | Text layer | Sommaire read |
|---|---|---|---|
| 1960–1990 | yes (1–8 MB per issue) | **no: scans** | needs OCR |
| 1995 | yes | yes | yes (22–61 texts) |
| 2000, 2005 | yes | yes, glyph-numbered fonts | yes after decoding (20–57) |
| 2010–2025 | yes | yes | yes |

All sampled issues 1995–2025 read with no glued titles. The server sends parts of files.

---

## 6. Veille: rules (`data/veille/watch.json`)

* **Matching** on the folded title (accents, case, quotes normalised), whole words only. The
  issuer ("Arrêté du ministre de … du 3 mars 2026,") is stripped before matching rules (`subject`),
  so a ministry's name is not a subject; references are matched on the full title.
* **Levels:** `critique` = cites a text the app is built on (nomenclature 15/11/2005, 2010, 2012
  amendments, décrets 2005-1991, 2006-2687, 68-88); `important` = an obligation for companies;
  `information` = sector news, a text found only by its institution, or anything matching `demote`
  (international agreements, ratifications, one-off acts like opening a local office).
* **Domains (10):** établissements classés, environnement, SST, hygiène, incendie, produits
  dangereux, droit du travail et RH, code de la route et transport, fiscalité/finances/entreprises,
  secteurs d'activité. About 55 rules; each has `label`, `level`, `domain`, optional `sectors`
  (nomenclature sections like 1200), `any`/`with` terms, `institution`, `impacts`, and **`when`**:
  the conditions under which a text it finds applies to a site (used by registers).
* **Ignored:** `ignore` (title starts with: nomination, cessation, promotion…) and `ignoreAnywhere`
  (concours, délégation de signature, statut particulier, budget de l'État, prêts/garanties de
  l'État, permis de recherche, concession d'exploitation, expropriation, prix et médailles,
  fonction publique…). **RH means private-sector employment**: careers of civil servants are ignored
  (a choice made in this project; the user can reverse it).
* **`registre`**: the ID-QSE-002 "SYSTEME" per domain (HSST, Environnement, HSST & Environnement,
  Social, Codes et recueils, Finance, Autres exigences) and the default frequency (Annuelle).
* **Tuning history:** reviewed on 5,049 titles (2024-2026): 94 hits → 69 (26 important) after
  removing mining permits, State loans, awards; laws were being missed because their first line was
  taken for an institution (fixed). Checked against a real client register (ID-QSE-002, 76 texts):
  55/76 flagged before, **72/76** after adding terms (the 4 left are paraphrases in the register).
  Today, on 2023-2026 (551 issues): **189 hits** (84 important, 105 information), **6**
  modifications of référentiel texts detected.
* After editing rules: `npm run veille -- --reassess` (no download), then `--list` to review.

---

## 7. Référentiel and registers

**Référentiel** = `data/referentiel/textes.json` (74 curated texts: seeded from the client's
ID-QSE-002 register with its summaries and risks, cleaned by hand, plus the app's reference texts)
**∪** every JORT hit (`fromHit`: conditions from the matched rules' `when`). A JORT text already
curated only adds its source. A text is known by `n:<kind>:<number>` or, without a number,
`d:<kind>:<ISO date>`.

**Conditions** (`when`, any of them; `a+b` = both): `tous`, `classe`, `categorie:1`,
`secteur:1200`, `rubrique:2505`, `etude:eie` / `etude:eie_a` / `etude:cahier_des_charges`…,
`effectif`, `effectif:50`, or a profile fact: `vehicules`, `transport-marchandises`,
`transport-personnel`, `transport-matieres-dangereuses`, `appareils-pression`, `levage`,
`groupe-electrogene`, `froid`, `rayonnements`, `produits-chimiques`, `hydrocarbures`, `explosifs`,
`denrees`, `animaux`, `rejets-eau`, `emissions-air`, `dechets-dangereux`, `bruit`, `erp`,
`restauration`, `import-export`, `forage`, `energie`, `chantier`. Some facts are ticked from the
rubriques' sections (1200 → denrées, 2500 → hydrocarbures, 1400/2100/2200/2300/2700 → produits
chimiques, 1500 → déchets dangereux, 2400 → explosifs, 2600 → rayonnements, 1100 → animaux).

**Proposals:** a text whose conditions hold is proposed (ticked) when curated or `important`;
`information` texts are unticked suggestions. Texts with no `when` (conventions collectives,
marchés publics, contrat KARAMA…) are added by hand only.

**Register lifecycle** (`lib/registre/registre.ts`, UI in `registres.tsx`):

1. Validated report → "Créer le registre de veille" → profile step (name required; classification
   facts shown; effectif and facts to tick). If a register **of the same name** exists: update it
   (evaluations kept; category, rubriques, study follow; facts of removed rubriques unticked) or
   create another.
2. Register view: summary counters; to-do panels (each shows 3 items, "Voir les N autres"):
   * **modified at the JORT** (`alertes`): "Ajouter ce texte et réévaluer" or "Réévaluer
     seulement" (clears evaluation; the amendment id goes to `vus`);
   * **new texts for this site** (`nouveautes`): Ajouter / Écarter / Tout ajouter;
   * **no longer applicable** (`plusApplicables`): Retirer / Garder (`garde`).
3. Texts grouped by domain in collapsible sections; each card: retenu, theme, état badge, title
   (link to the JORT page), why; conformité (sets today's date if none), last evaluation, frequency
   (Mensuelle … Tous les deux ans); details: résumé, risque, plan, responsable, échéance.
4. Due evaluations (`prochaine`): jamais évalué / en retard / sous 30 jours / à jour. The **menu
   badge** counts JORT modifications + late or soon-due evaluations across registers (never-evaluated
   texts are left out, or a new register would show ~96).
5. Excel export (ID-QSE-002 columns: SYSTEME, DOMAINE, TYPE, REF TYPE, TITRE with link, RESUME
   EXIGENCE, CONFORMITE, Fréquence d'évaluation, RISQUE, Plan d'action, Responsable et échéance; the
   header rows mimic the client's file).

**Storage:** `localStorage` key `abclassement-registres` (the user chose "in the app"; no server).
Saved after rendering (an effect), then a window event `abclassement-registres` lets the badge
recount; "Sauvegarder les registres" / "Restaurer une sauvegarde" (JSON file, merges by id). Journal
statuses (à lire / pertinent / sans objet) are in `abclassement-veille-statuts`.

Example measured: a 2ème catégorie dairy (1214 + 2505), 40 employees, vehicles → 97 texts proposed,
2 real JORT modifications flagged (maladies professionnelles list amended 18/09/2025; loi 96-41 on
waste amended by loi 2024-2).

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
* The report page is still long by nature (5,700 / 9,000 px): it is the printable document.

---

## 9. Data state (18 October 2026)

| Year | Issues read | Texts in sommaires | Issues with 0 texts (not scans) | Glued titles |
|---|---|---|---|---|
| 2023 | 135 | 2,931 | 15 | 2 |
| 2024 | 159 | 3,321 | 18 | 0 |
| 2025 | 156 | 3,391 | 13 | 1 |
| 2026 | 101 (to n° 101) | 2,163 | 8 | 0 |

`--reread` already ran on 2024-2026 (0-text issues went from 26/31/10 to 18/13/8). The remaining
0-text issues are not understood yet (only "Avis", Arabic-only issues, another layout?).

Probe samples in `data/veille/probe/` (5.4 MB): JSON for every 5th year 1960–2025 (issues 1 and
40) and JPEG pages of the scans of 1960, 1970, 1980, 1990.

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
* Not answered yet: should subsidies/aid to a sector (subventions, primes) appear as information?
  (Currently ignored.)

---

## 11. Next steps (in order)

1. **Finish reading 1995–2022** on the laptop: `npm run veille -- --years 1995-2022`, then push
   `data/veille`. Expect about 4,000 issues and a few hours; resumable. Then `--reread` for any
   year that shows 0-text issues.
2. **OCR for 1960–1990** (scans). Plan:
   * render the sommaire pages with `pdfPageImages` at **300 dpi** (the probe JPEGs are 150 dpi:
     fine to look at, too coarse for OCR);
   * OCR on the laptop with **`tesseract.js`** + **`@tesseract.js-data/fra`** (npm, works offline
     on Windows, no install); cloud sessions have system `tesseract` 5 with `fra` for prototyping;
   * build `Line {x, y, text}` from OCR word boxes (y flipped to PDF coordinates), then
     `parseIssue`;
   * layout seen in the 1980 sample (`data/veille/probe/1980-001-p1.jpg`): **two columns**, ministry
     headings **centred** (italic/bold, "Premier Ministère" too), kinds in capitals ("ARRETE",
     "NOMINATION"), dot leaders and page numbers at the column's right. So: split columns first
     (gap in x), treat centred lines starting with Ministère/Premier Ministère as institutions;
     accept capitalised kinds; tolerate OCR noise in leaders ("…….", ". . .") and digits;
   * store results like other sommaires (clear `sansTexte`, maybe `ocr: true` + confidence);
     a `--ocr` option to process the stored `sansTexte` issues; cost: a few seconds per page,
     2–3 pages per issue, ~3,500 issues for 1960–1990: run overnight, resumable;
   * test on the probe images, then on a few full issues pushed by the user.
3. **Investigate the remaining 0-text issues** (add a `--dump <year>/<n>` that saves the first
   pages' lines like the probe, ask the user to push a few, adapt the parser).
4. **Review the rules on the larger set** (as for 2024-2026: `--list`, count hits per rule, look for
   misses and noise), with decades of texts the registers will grow: consider proposing only
   curated + important texts and grouping a base text with its modifications.
5. **Grow the curated référentiel**: other client registers (an importer for ID-QSE-002 files would
   help: the seed was done by a one-off script, the register was messy), and have a QSE specialist
   review the `when` conditions of the 74 texts.
6. **Housekeeping:** `data/veille/feed.json` is tracked again by mistake (re-added by a
   `git add data/veille`); it is stale and unused: `git rm --cached data/veille/feed.json` and add
   it to `.gitignore`. Then open a pull request `claude/veille` → `main` when the user asks.
7. Test `scripts/veille-hebdo.ps1` on Windows.
8. Legal readings still to confirm (README "Not done yet"): Qx of the addition rule, rubrique 2724
   reading, dépollution route (circulaire 27 still in force?), annexe 2 units that regularise.

---

## 12. How things were verified

* **Vitest** (82 tests): parsing of real JORT issues kept in `data/sources/` (2006 n° 83, 2010
  n° 18) and of the probe's 2000 n° 40; rules on real titles; registers end to end.
* **Local JORT mirror** for the scanner: a small Node HTTP server that serves PDFs under
  `/journal-officiel/fr/<year>/<nnn>.pdf` **with Range support** (clamp the end of a range to the
  file size, or small files break), plus `python3 -m http.server` for a server without Range; run
  the scanner with `JORT_BASE=http://localhost:<port>` in a **copy of the project** so real data is
  untouched. A fake scan: a blank page saved as PDF with Pillow.
* **Playwright** (Chromium at `/opt/pw-browsers/chromium`, playwright from the global npm root):
  scripted flows (validate → create register → add modifying text → change classification →
  update register), page heights and horizontal overflow on desktop and phone, console errors.
* The probe data was used offline: lines can be cut back into items and re-run through `toLines`
  and `parseIssue`.

---

## 13. Conventions and gotchas

* UI text is French; code, comments, README and commits are English. Comments explain *why*.
* Commits end with the two trailer lines used in this repo (`Co-Authored-By: …` and
  `Claude-Session: …`); never put a model identifier in commits or files. Push only to
  `claude/veille` (`git push -u origin claude/veille`); no pull request unless the user asks.
* `.gitattributes` forces LF; Python scripts read/write UTF-8 explicitly (Windows cp1252 broke
  them once); `scripts/veille-hebdo.ps1` is saved with a UTF-8 BOM (Windows PowerShell 5.1).
* pdf.js **takes over the buffer** passed to `getDocument`: measure `data.length` before.
* Never update another component's state while rendering (registers are saved in an effect; doing
  it inside a state updater broke React).
* In the cloud shell: `pkill -f <pattern>` / `pgrep` can match the shell's own command line and kill
  it; split the pattern (`a="mirr"; b="or.mjs"; pgrep -f "node .*${a}${b}"`). `rm -rf` on a
  relative path after `cd` is refused by a safety check: use absolute paths. Scripts outside the
  project cannot resolve its packages: put scratch scripts under the project (and delete them).
* The JORT numbering: an issue's own number in the PDF may differ from its address (`! the PDF says
  n° …`): the address number is kept.
