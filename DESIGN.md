# ABClassement — ABC Consulting

A working reference tool for establishment classification and environmental studies in Tunisia.

## Identity

ABClassement combines ABC and classement. The supplied ABC Consulting logo is displayed unchanged at public/brand/abc-consulting.jpg (sign-in screen).

The interface is a precision instrument for people who keep compliance registers all day: neutral greys, one brand blue (#155a83, #2a76a8 in dark mode), crisp 1px borders, no blur, no gradients, no decorative shadows (only menus, the command palette and sheets float). Dense, legible tables; status always carries a word, never a colour alone. Inter (variable, self-hosted) for the interface, tabular figures for numbers.

Dark mode follows the device unless a choice is made (Automatique, Clair, Sombre: account menu, command palette, Mon compte). Printed documents (the compliance report, the classification report) stay on white.

## Tokens and components

app/styles/tokens.css holds every decision: type scale (12, 13, 14, 16, 20, 24px), spacing (4px steps), radii (4, 6, 8px), control heights (32px, 40px on touch screens), colours for light and dark (bg, panel, subtle, border, text, muted, accent, success, warning, danger and their subtle tints). Nothing else defines a colour or a size.

app/ui/ is the component library every screen is built from: Button and ButtonLink (primary, secondary, ghost, danger; one primary action per view), Badge, Field/TextField/SelectField/TextArea/SearchInput/Checkbox, Segmented, Tabs, Sheet (right side on desktop, bottom on phones; Radix Dialog), Menu (Radix DropdownMenu), Tooltip, Page/PageHeader/Panel/Stats/EmptyState/Progress/Notice/Kbd, and table classes. Styles are CSS Modules next to each component; the root of each carries data-ui.

## Composition

Mobile first. Below 900px: a top bar (workspace menu, search, account menu) and a tab bar with Accueil, Registres, Veille, Classement. From 900px a 240px side menu replaces both: the workspace menu (switch, Équipe, create a workspace), a search field that opens the command palette, the destinations (with the count of what waits in the registers), Équipe, Administration for ABC Consulting, and the account menu at its foot (Mon compte, appearance, conditions, sign-out).

Every screen has its own address: /, /registres, /registres/[id], /registres/nouveau, /veille, /classement, /equipe, /compte, /admin, /cgu, /confidentialite. Links of before (?vue=…, ?e=…) are redirected. Each screen starts with a PageHeader: title, one line on what it is for, its actions.

Ctrl+K (Cmd+K) opens the command palette: every register by name, the actions (new register, classify, check the JORT), every screen, the appearance.

The sign-in screen pairs what the product does with the form; it stacks on phones.

## The register

The register is a table: one row per text (title, reference and theme; conformity as a word with a dot; the follow-up: next evaluation, late, the action's due date; evidence count; the person responsible), grouped by domain (a header row with its counts, opens on a click), or flat and sorted by importance once filtered or searched. Above it: four figures (evaluated, conforming, non conforming, to do; each filters the table), the lists of what waits (texts modified at the JORT, new texts, texts that no longer apply; three shown, the rest on demand), the filters as tabs with counts, the search and the domain. Keyboard: / searches, j and k move between rows, Entrée opens. A text opens in a sheet (right side on desktop, bottom on phones) whose address is kept (?texte=…): its status, a new evaluation (conformity, date, frequency, comment, evidence: file, written note, link; for a non-conformity the risk and the action plan in the same form), the action plan of a current non-conformity, the requirements, the history, why the text is there and its amendments. "Enregistrer l’évaluation" stays at the foot of the sheet.

## Typography and interaction

Titles 20px (24px for the screen title), body 14px, secondary text 13px, labels 12px. Inputs are 16px on phones to avoid automatic zoom. A visible focus ring on every control; menus, sheets and the palette keep focus inside and return it (Radix). Reduced motion disables transitions.

## Scope

The classification engine and legal data remain in lib/ and data/. The URL preserves the selected activities, quantities and environmental-study options. Registers are stored in the client workspace when accounts are configured (Supabase), in the browser otherwise; classification dossiers stay in the URL. The interface does not replace the official texts.

## Design references

The initial information architecture considered https://www.gov.uk/, https://entreprendre.service-public.gouv.fr/ and https://www.service-public.gouv.fr/ for task-based administrative navigation. The revised visual identity follows the supplied ABC Consulting branding.

## Files

app/styles/tokens.css (decisions), app/styles/base.css (reset, body), app/ui/ (components), app/(app)/_shell/ (side menu, bars, command palette). Printed documents (the compliance report, the classification synthesis) have their own styles: they are paper.

## Validated reports

The dossier ends with a validation control and an optional establishment name. Validation requires complete activity classifications and an explicit ANPE choice for each activity. A successful validation creates an independent snapshot at the end of the page. It includes all rubric cases and thresholds, selected lines, entered and canonical quantities, addition calculations, ANPE entries, consolidated study steps, and legal references. Edits invalidate export until the snapshot matches the current dossier or a new validation is made.

The report can be printed or saved as PDF through the browser, downloaded as standalone HTML with its logo embedded, or downloaded as complete JSON data. Print rules isolate the report, repeat table headers, and start each detailed activity on a new page. No dossier data is sent to an external service. The report model is in lib/report.ts and the document/export component is in app/components/classification-report.tsx.
