# ABClassement: instructions for Claude

Claude Code reads this file at the start of every session in this repository. Read
**`CONTINUE.md` first** (where the work stopped and what comes next), then `HANDOFF.md` (the
whole project: stack, data, decisions, history) and `DEPLOY.md` (hosting).

## The project in three lines

A Next.js 15 / React 19 / TypeScript app for **ABC Consulting**, a Tunisian QSE consultancy:
EDII classification of establishments and the ANPE study, JORT regulatory monitoring (veille),
and a shared compliance register per establishment, in client workspaces on Supabase, hosted on
Vercel. It is sold to clients by ABC Consulting.

## Standing rules (agreed with the user)

* **Branch:** work and push on `claude/veille` only (`git push -u origin claude/veille`).
  No pull request unless the user asks. `main` stays as it is until the user says so.
* **Commits:** English, explain why. End with the attribution lines the session gives you.
  Never put a model name or identifier in commits, code, comments or files.
* **Before every push:** `npm run check` (types + unit tests) runs from `.githooks/pre-push`.
  Run the browser tests that cover what you changed (`npm run test:e2e`; in a cloud session
  prefix with `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`).
* **After every push, give the user the full PowerShell command list** to update their laptop:
  pull, `npm ci`, any new Supabase migration to run (with the command that copies its SQL to the
  clipboard), and how to start the app. The user works on Windows with PowerShell.
* **Language:** the app's UI is in French; code, comments, docs and commits are in English.
* **Never call the product a "SaaS".**
* **Design direction "precision instrument":** like Linear or Stripe: Inter, neutral greys, one
  blue, 1px borders, dense tables, no blur or gradients, keyboard shortcuts. Components are in
  `app/ui`, tokens in `app/styles/tokens.css`. Check pages at phone width (390) and desktop.
* **The client Excel ID-QSE-002 is only an example** of a register layout: never copy its wording.
* **Secrets:** `.env.local` holds only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The service role key stays on the server (Vercel). Never write a
  password or key in a file, a commit or a reply, even one the user pasted.
* **Destructive commands** (`rm -rf`, `git reset --hard`, force pushes): give them to the user to
  run instead of running them.

## Useful commands

```bash
npm ci                     # install (also sets the git hooks)
npm run dev                # http://localhost:3000
npm run check              # types + unit tests (Vitest)
npm run test:e2e           # browser tests, local mode
npm run test:e2e:comptes   # browser tests with accounts (needs a Supabase or the stand-in)
npm run test:db            # database rules (throwaway Postgres)
npm run db:types           # regenerate lib/cloud/database.types.ts after changing a migration
```

After a fresh clone, the served veille data must be rebuilt once:
`npx tsx scripts/veille.ts --reassess` (`npm run dev` and `npm run build` also rebuild it).
