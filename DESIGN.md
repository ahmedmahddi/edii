# ABClassement — ABC Consulting

A working reference tool for establishment classification and environmental studies in Tunisia.

## Identity

ABClassement combines ABC and classement. The supplied ABC Consulting logo is displayed unchanged at public/brand/abc-consulting.jpg. The blue (#155a83), silver borders and navy utility strip follow the company identity. Avoid gradients, decorative pastel icons, large marketing headlines, floating tiles and repeated onboarding steps.

## Composition

A compact masthead contains the product name and company logo. Desktop navigation runs horizontally below it. The main area divides the numbered catalogue from the establishment dossier with a single vertical rule. Activities and substances appear in separate directory columns, using section codes and thin horizontal separators. A modest heading explains the current screen. The dossier uses a light grey document surface and a navy top rule.

Phones show one work surface at a time with four labeled bottom navigation controls. The catalogue stacks into one column below 560px. A tablet keeps two catalogue columns and mobile navigation. Desktop begins at 1000px. Long rubric tables and activity forms reflow into labeled vertical rows on phones. The remove control has a reserved 44px column with its padding accounted for; the table and tbody use block layout in compact dossier panels to avoid intrinsic table overflow. The full desktop establishment view restores normal table layout.

## Typography and interaction

DM Sans is bundled locally for body text and Manrope for headings and the product wordmark. Font licenses are in public/fonts. Mobile input text is 16px to avoid automatic field zoom. Controls are at least 44px, with visible keyboard focus. Search has a persistent label. Result counts and activity additions announce their state. Rubric selection focuses and scrolls to its details. Status colors always include category labels.

## Scope

The classification engine and legal data remain in lib/ and data/. The URL preserves the selected activities, quantities and environmental-study options. The interface does not imply server-side dossier storage or replace the official texts.

## Design references

The initial information architecture considered https://www.gov.uk/, https://entreprendre.service-public.gouv.fr/ and https://www.service-public.gouv.fr/ for task-based administrative navigation. The revised visual identity follows the supplied ABC Consulting branding.

## Files

app/globals.css is the visual source. design-tokens.json records the tokens. design-preview.html is a standalone preview of the identity and controls.

## Validated reports

The dossier ends with a validation control and an optional establishment name. Validation requires complete activity classifications and an explicit ANPE choice for each activity. A successful validation creates an independent snapshot at the end of the page. It includes all rubric cases and thresholds, selected lines, entered and canonical quantities, addition calculations, ANPE entries, consolidated study steps, and legal references. Edits invalidate export until the snapshot matches the current dossier or a new validation is made.

The report can be printed or saved as PDF through the browser, downloaded as standalone HTML with its logo embedded, or downloaded as complete JSON data. Print rules isolate the report, repeat table headers, and start each detailed activity on a new page. No dossier data is sent to an external service. The report model is in lib/report.ts and the document/export component is in app/components/classification-report.tsx.
