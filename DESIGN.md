# ABClassement — ABC Consulting

A working reference tool for establishment classification and environmental studies in Tunisia.

## Identity

ABClassement combines ABC and classement. The supplied ABC Consulting logo is displayed unchanged at public/brand/abc-consulting.jpg. The interface follows a light, glass language in the manner of Apple's platforms: the system font (San Francisco on Apple devices, Segoe UI on Windows), a brand blue (#0a6ed1) on a pale, softly tinted background, translucent surfaces with backdrop blur, 12 and 20px radii, hairline borders and soft shadows. Status colors always include labels. No gradients beyond the primary button and the soft background wash, no decorative illustration.

## Composition

Mobile first. Below 1000px a frosted top bar carries the wordmark (or the screen's title and a back control) and the account avatar; a frosted tab bar at the bottom holds the five destinations: Accueil, Nomenclature, Établissement, Registres, Veille. The avatar opens a bottom sheet with the workspace switcher, Équipe et espace, Mon compte and sign-out. From 1000px a frosted side menu replaces both: the wordmark, the client workspace (name, role, save state), the destinations in groups (Accueil; Classement; Conformité; Espace de travail) and, at its foot, the account and the ABC Consulting logo.

Every screen starts with a large title. The home (Accueil) is a dashboard: a greeting with the workspace, four stat tiles (establishments, evaluations late, evaluations to do, JORT texts to examine) that open the registers, three quick actions (classify, new register, Journal officiel), the establishments with their evaluation progress and alert pills, and the latest important texts of the Journal. With no register it shows one card with the two ways in. The nomenclature keeps its directory of sections, search results as rows with an add control, and the establishment dossier beside it from 1000px. Registers and the Journal are lists of glass cards with a colored left rule for severity or conformity. Long rubric tables and activity forms reflow into labeled vertical rows on phones. The remove control has a reserved 44px column with its padding accounted for; the table and tbody use block layout in compact dossier panels to avoid intrinsic table overflow.

The sign-in screen pairs a short statement of what the product does with the form; it stacks on phones.

## Typography and interaction

The system font stack renders the interface. Titles are 30px (34px on desktop) with tight letter-spacing; the eyebrow above a title is the section in brand blue. Mobile input text is 16px to avoid automatic field zoom. Controls are at least 44px, with a visible focus ring (a soft blue halo). Search has a persistent label. Result counts and activity additions announce their state. Rubric selection focuses and scrolls to its details, below the sticky top bar. Reduced motion disables the sheet's animation.

## Scope

The classification engine and legal data remain in lib/ and data/. The URL preserves the selected activities, quantities and environmental-study options. Registers are stored in the client workspace when accounts are configured (Supabase), in the browser otherwise; classification dossiers stay in the URL. The interface does not replace the official texts.

## Design references

The initial information architecture considered https://www.gov.uk/, https://entreprendre.service-public.gouv.fr/ and https://www.service-public.gouv.fr/ for task-based administrative navigation. The revised visual identity follows the supplied ABC Consulting branding.

## Files

app/globals.css is the visual source; the theme block at its end (tokens, shell, components) decides the look, the rules above it the layout. design-tokens.json and design-preview.html date from the first identity and are not updated.

## Validated reports

The dossier ends with a validation control and an optional establishment name. Validation requires complete activity classifications and an explicit ANPE choice for each activity. A successful validation creates an independent snapshot at the end of the page. It includes all rubric cases and thresholds, selected lines, entered and canonical quantities, addition calculations, ANPE entries, consolidated study steps, and legal references. Edits invalidate export until the snapshot matches the current dossier or a new validation is made.

The report can be printed or saved as PDF through the browser, downloaded as standalone HTML with its logo embedded, or downloaded as complete JSON data. Print rules isolate the report, repeat table headers, and start each detailed activity on a new page. No dossier data is sent to an external service. The report model is in lib/report.ts and the document/export component is in app/components/classification-report.tsx.
