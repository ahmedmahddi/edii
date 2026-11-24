# Where we left off (24 November 2026)

This file is for picking the work up in a new Claude account or session. `CLAUDE.md` has the
standing rules; `HANDOFF.md` has the full project history (§11 lists what was built in November).

## The prompt to paste in the new session

Open a Claude Code session on the repository `ahmedmahddi/edii`, branch `claude/veille`, then
paste:

> We are continuing the ABClassement project from another account. Check out the branch
> `claude/veille` and read `CLAUDE.md`, `CONTINUE.md`, `HANDOFF.md` and `DEPLOY.md` in that order.
> Then run `npm ci`, `npx tsx scripts/veille.ts --reassess` and `npm run check` to confirm that
> everything still passes. Tell me in a few lines where the project stands, what is waiting on
> me, and what you suggest we do next. Follow the standing rules in `CLAUDE.md`: push only to
> `claude/veille`, no pull request unless I ask, and give me the full PowerShell commands after
> every push.

## State of the code

* Branch `claude/veille` is well ahead of `main` and is not merged. No pull request.
* Last commit before this file: "Classifications kept: list, open again, change, copy, delete;
  linked to their register".
* The November rebuild is done (steps 1, 2 and 3; see `HANDOFF.md` §11): new design system and
  shell, served veille data split by use, registers stored as rows with per-line sync, client
  workspaces on Supabase, error reports, an admin area.
* Last two features asked by the user, both done and pushed:
  * **Classifications kept:** `/classement` lists them, `/classement/[id]` edits one (saved at
    each change), `/classement/nouveau` creates one; copy and delete; a register made from a
    classification links back to it.
  * **Register keyboard:** j / k go through every text, also while a text is open (asks before
    dropping an evaluation being written).
* Last full check: 161 unit tests, the database rules, 30 browser tests (local mode) and 4 browser
  tests with accounts all passed.

## Waiting on the user

1. **Run the newer Supabase migrations** on the real project, in order, in the SQL editor
   (`supabase/migrations/`): `20261118000000_lignes.sql`, `20261119000000_erreurs.sql`,
   `20261120000000_creation.sql`, `20261121000000_classements.sql`. The first six were run
   earlier. From the project folder in PowerShell, one at a time:
   `Get-Content supabase\migrations\20261118000000_lignes.sql -Raw | Set-Clipboard`, then paste
   into the SQL editor and run it.
2. **Custom SMTP** in Supabase (Resend is described in `DEPLOY.md`). Supabase's own mailer only
   sends to the project team and is limited to a few e-mails an hour: clients can't sign up
   without it.
3. **Deploy on Vercel** following `DEPLOY.md`.
4. **Legal pages** (mentions légales, confidentialité, CGU) need a lawyer's reading before clients.

## Not tested yet

* Realtime (live updates between two people on the same register) has only been tested against
  a local stand-in, not on a real Supabase project. Test it with two browsers once the
  migrations are run.

## Still open from earlier (see `HANDOFF.md` §11 "Earlier items")

* Registers still propose many texts for large sites; the next lever is judging whether old
  general texts are still in force.
* Review the veille rules on the oldest years (1957-1975), housekeeping of tracked data files,
  legal readings to confirm, the Arabic edition later.

## Business: pricing and the buyer panel (16 November)

The user asked for a simulated panel of 100 buyers. The page is in
`docs/business/buyer-panel.html` (open it in a browser). **The buyers are invented: it is a list
of objections to prepare for, not a forecast.**

Proposed pricing (TND, excluding VAT, per year):

| Plan | Price | What's included |
|---|---|---|
| Classement | Free | EDII classification and ANPE study, to get people trying the app |
| Essentiel | 1,200 | 1 establishment, 1 user, JORT alerts and the register, no evidence storage |
| Site | 2,400 | 1 establishment, 3 users, evidence, history, PDF and Excel export; setup by an ABC consultant 1,800 once, free on a 2-year commitment |
| Multi-sites | 1,500 per establishment | From 3 establishments, no cap |
| Partner (consultants) | 4,800 | 10 client workspaces, own logo on reports |
| Groupe / public | On quote | Through tenders |

Panel results: 22 of 100 bought. Main reasons for passing: price or no budget (17), no
inspection pressure (17), Excel or a consultant already does it (10), "who answers if a text is
missing" (8). Best buyers: ISO 14001/45001 certified industrial sites, multi-site groups,
independent consultants (about 38% each). 1,200 is the price most would accept; 2,400 is what
the actual buyers accepted.

**First real test suggested:** 10 existing ABC clients certified ISO 14001 or 45001, each with
their own register loaded before the call, offered a 3-month paid pilot at 600 TND (credited
against the first year). Success: at least 3 of 10 pay within two weeks. Not run yet as far as
this file knows: ask the user how it went.

Product ideas that came out of the panel: a coverage list (which texts are in, which are not, and
when summaries were last checked), a contract clause on data if the service stops, documented
hosting and backups, PDF reports with a consultant's logo.
