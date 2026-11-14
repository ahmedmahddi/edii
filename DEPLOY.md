# Putting ABClassement online (Vercel + Supabase)

Everything to configure, in order, to host the app for ABC Consulting's clients. Allow an
afternoon the first time. Menu names in Vercel and Supabase change now and then: when one is not
where this says, search their settings for the word in bold.

What runs where:

| Piece | Service | What it does |
|---|---|---|
| The site and its server routes | **Vercel** | Pages, `/api/*` routes (fiches, Journal, errors, JORT check), the two scheduled jobs |
| Accounts, workspaces, registers, evidence files | **Supabase** | Postgres with row-level security, Auth, Storage, Realtime |
| E-mails (sign-up confirmation, password reset, Monday digest) | **Resend** or **Brevo** | Sends from ABC Consulting's own domain |
| The JORT read every day | **GitHub** (the repository) | The daily job commits the new issues; Vercel rebuilds the site with them |

---

## 0. Before starting: accounts, plans and costs

* **Vercel: Pro plan.** The free Hobby plan is for personal, non-commercial projects; ABClassement
  is sold to clients, so it needs Pro (per member of the Vercel team, monthly). Pro also lifts the
  limits on scheduled jobs and gives more build minutes.
* **Supabase: Pro plan for production.** Free projects are paused after a period without activity
  and have no daily backups; clients' registers need both. Keep a **second, free project for tests**
  (preview deployments, `npm run test:e2e:comptes`): never test on the clients' project.
* **Resend** (or Brevo): a free plan is enough to start (a few thousand e-mails a month).
* **A domain** for the app, for example `app.abc-consulting.tn` (a sub-domain of ABC Consulting's
  site works well), and access to its DNS settings.
* The **GitHub repository** `ahmedmahddi/edii`, with the rebuild merged into `main` (step 6).

Choose one **region** close to Tunisia for everything: Supabase **Frankfurt (eu-central-1)** and
Vercel functions in **Frankfurt (fra1)**. The app's server routes then talk to the database without
a long trip.

---

## 1. Supabase: the production project

### 1.1 Create it

Supabase → **New project** → name `abclassement-prod`, region **Frankfurt**, a strong database
password (keep it in a password manager; the app never uses it).

### 1.2 Run the migrations, in order

**SQL Editor → New query**, paste each file of `supabase/migrations/` and **Run**, one after the
other, in the order of their names. From the project folder (PowerShell), copy each in turn:

```powershell
Get-Content supabase\migrations\20261112000000_workspaces.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261113000000_preuves.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261114000000_notifications.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261115000000_plans.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261116000000_versions.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261117000000_signalements.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261118000000_lignes.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261119000000_erreurs.sql -Raw | Set-Clipboard
Get-Content supabase\migrations\20261120000000_creation.sql -Raw | Set-Clipboard
```

(One command at a time: copy, paste in Supabase, Run, wait for "Success", then the next.) They can
be run again safely. They create the tables, their access rules, the private **preuves** bucket for
evidence files, and add the registers to **Realtime** (colleagues' changes appear live).

Check: **Table Editor** lists `organizations`, `memberships`, `registres`, `registre_lignes`,
`erreurs`…; **Storage** lists the bucket `preuves` (private).

### 1.3 Authentication

* **Authentication → URL Configuration**
  * **Site URL**: `https://app.abc-consulting.tn` (the production address, step 4.5).
  * **Redirect URLs**: add `https://app.abc-consulting.tn/**`. The confirmation and "mot de passe
    oublié" e-mails lead there; an address missing from this list makes those links fail.
* **Authentication → Sign In / Providers → Email**
  * **Enable email provider**: on. **Confirm email**: **on** in production (an account proves its
    address before entering).
  * **Minimum password length**: **8** (the app asks for 8; Supabase defaults to 6).
  * Other providers (Google, phone…): off; the app uses e-mail and password only.
* **Authentication → Emails → SMTP Settings**: ABC Consulting's own sender, step 2.3. Without it,
  Supabase's built-in sender only reaches the members of your Supabase team and a few e-mails an
  hour: clients could not confirm their account.
* **Authentication → Emails → Templates** (optional, recommended): the e-mails in French, with
  ABC Consulting's name. Keep the `{{ .ConfirmationURL }}` link in each.
* **Authentication → Rate Limits**: once the SMTP is set, raise **e-mails per hour** to suit (for
  example 100).

### 1.4 The keys the app needs

**Project Settings → API** (or **API Keys**):

| Key | Where it goes | Secret? |
|---|---|---|
| **Project URL** (`https://<ref>.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` | No |
| **anon / publishable** key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No: what it may read is decided by row-level security |
| **service_role / secret** key | `SUPABASE_SERVICE_ROLE_KEY` | **Yes**: reads every workspace. Server only, never in a `NEXT_PUBLIC_` variable, never in the browser, never in chat or e-mail |

The app refuses to start if a secret key is put in `NEXT_PUBLIC_SUPABASE_ANON_KEY` (it says so on
screen).

### 1.5 Backups

Pro projects are backed up daily (**Database → Backups**). For extra safety, consider
point-in-time recovery (paid add-on) once clients rely on the app.

---

## 2. E-mail: Resend (or Brevo)

### 2.1 The sending domain

Resend → **Domains → Add domain** → `abc-consulting.tn` (or a sub-domain such as
`mail.abc-consulting.tn`). Resend shows DNS records (SPF, DKIM, and a recommended DMARC): add them
at the domain's DNS provider, then **Verify** (a few minutes to a few hours). Without this, e-mails
land in spam or are refused.

### 2.2 An API key for the Monday digest

Resend → **API Keys → Create** (permission: sending only) → it becomes `RESEND_API_KEY` in Vercel.
The sender, `NOTIFY_FROM`, must use the verified domain: `ABClassement <noreply@abc-consulting.tn>`.

### 2.3 SMTP for Supabase's account e-mails

Supabase → **Authentication → Emails → SMTP Settings → Enable custom SMTP**:

| Field | Resend | Brevo |
|---|---|---|
| Host | `smtp.resend.com` | `smtp-relay.brevo.com` |
| Port | `465` | `587` |
| Username | `resend` | the SMTP login shown in Brevo (**SMTP & API**) |
| Password | a Resend API key | the Brevo **SMTP key** (not the API key) |
| Sender e-mail | `noreply@abc-consulting.tn` | same |
| Sender name | `ABClassement` | same |

Then test: create an account in the app with a real address; the confirmation e-mail must arrive.

---

## 3. GitHub: a token for the daily reading of the JORT

Every morning the scheduled job `/api/veille/cron` reads the JORT issues published since the last
ones stored, and **commits them to the repository** (`data/veille/sommaires/`); the commit makes
Vercel rebuild the site with them. It needs write access to the repository's files, and nothing
more.

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate
new token**:

* **Resource owner**: the owner of `ahmedmahddi/edii`; **Repository access**: only that repository.
* **Permissions → Repository permissions → Contents: Read and write.** Nothing else.
* **Expiration**: one year, with a reminder in the calendar to renew it (an expired token stops the
  daily reading; the app keeps working, the JORT stops being updated).

It becomes `VEILLE_GITHUB_TOKEN` in Vercel, with `VEILLE_GITHUB_REPO=ahmedmahddi/edii` and
`VEILLE_GITHUB_REF=main`.

If the repository's `main` branch is protected so that only pull requests can change it, allow this
token (or give the job its own branch): otherwise its commits are refused.

---

## 4. Vercel: the project

### 4.1 Import the repository

Vercel → **Add New → Project** → import `ahmedmahddi/edii`. Vercel recognises **Next.js**; keep the
defaults:

* Build command: `npm run build` (it first rebuilds the veille's files from the repository and runs
  the 156 unit tests: a failing test stops the deployment).
* Install command: `npm install` (or `npm ci`); output: Next.js default; root directory: `/`.

### 4.2 Project settings

* **Settings → General → Node.js Version**: **22.x**.
* **Settings → Git → Production Branch**: **`main`**. Other branches (`claude/veille`…) get preview
  addresses.
* **Settings → Functions → Function Region**: **Frankfurt (fra1)**, beside the database.
* **Settings → Deployment Protection**: keep **Vercel Authentication** on for previews (only your
  team opens them); production stays public (the app has its own sign-in).

### 4.3 Environment variables

**Settings → Environment Variables.** Production uses the production Supabase project; Preview uses
the test project.

| Variable | Production | Preview | What for |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod project URL | test project URL | Accounts, workspaces, registers |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod anon/publishable key | test key | Same (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | prod service_role/secret key | test key | Monday digest (reads every workspace), error log |
| `CRON_SECRET` | a long random value (below) | another one | Guards the scheduled jobs; signs the digest's unsubscribe links |
| `RESEND_API_KEY` (or `BREVO_API_KEY`) | the key of step 2.2 | — | Monday digest |
| `NOTIFY_FROM` | `ABClassement <noreply@abc-consulting.tn>` | — | Digest sender |
| `NEXT_PUBLIC_SITE_URL` | `https://app.abc-consulting.tn` | — | Links in the e-mails |
| `VEILLE_GITHUB_TOKEN` | the token of step 3 | — | Daily JORT reading |
| `VEILLE_GITHUB_REPO` | `ahmedmahddi/edii` | — | Same |
| `VEILLE_GITHUB_REF` | `main` | — | Same |

Not to set: `JORT_BASE`, `JORT_OCR_BASE`, `JORT_CATALOG` (tests and mirrors only).

A random `CRON_SECRET` (PowerShell):

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString("x2") }) -join ""
```

**`NEXT_PUBLIC_` values are written into the site when it is built**: after changing one,
**redeploy** (Deployments → the last one → ⋯ → Redeploy). The others are read at run time, but a
redeploy is the simplest way to be sure they are taken.

### 4.4 Scheduled jobs

They come from `vercel.json` with each production deployment; check them in **Settings → Cron
Jobs**:

| Job | When (UTC) | In Tunisia | Does |
|---|---|---|---|
| `/api/veille/cron` | every day 05:17 | 06:17 | Reads the new JORT issues, commits them, the site rebuilds |
| `/api/notifications/cron` | Mondays 05:23 | 06:23 | Sends the weekly digest to every account that wants it |

Vercel calls them with `Authorization: Bearer <CRON_SECRET>`; without the right secret they refuse.
They only run for the production deployment. **Run** (in Cron Jobs) starts one at once, to test.

### 4.5 The domain

**Settings → Domains → Add** → `app.abc-consulting.tn`. Vercel shows the DNS record to add (a
`CNAME` to `cname.vercel-dns.com` for a sub-domain); the HTTPS certificate follows by itself. Then
make sure the same address is in Supabase's **Site URL** and **Redirect URLs** (step 1.3) and in
`NEXT_PUBLIC_SITE_URL`.

---

## 5. ABC Consulting's administrator accounts

Create your account in the app (production address), confirm it, then in Supabase **SQL Editor**:

```sql
insert into public.platform_admins (user_id)
select id from public.profiles where email = 'votre.adresse@abc-consulting.tn';
```

Reload the app: **Administration** appears in the menu (clients' workspaces and offers, reports on
texts, errors). Repeat for each colleague who administers the platform. Administrators do not see
the clients' registers unless a client invites them into its workspace.

---

## 6. Merge the rebuild into `main` and deploy

From the project folder (PowerShell). The pre-push check (types and tests) runs on its own.

```powershell
taskkill /F /IM node.exe
git checkout main
git pull origin main
git merge claude/veille
git push origin main
```

If the merge reports conflicts, stop there and ask for help rather than forcing it. The push starts
the production deployment on Vercel (**Deployments**, about 3 to 5 minutes: the build rebuilds the
veille's files and runs the tests).

**Migrations and code go together**: run new migrations on the production project (step 1.2)
right before merging the code that needs them. The current code needs all nine.

---

## 7. After the first deployment: checks (15 minutes)

1. Open `https://app.abc-consulting.tn`: the sign-in screen, no message "Configuration à corriger".
2. Create an account with a real address: the confirmation e-mail arrives (from your domain), its
   link opens the app signed in.
3. "Mot de passe oublié": the e-mail arrives, its link lets you choose a new password.
4. Create a workspace, a register; evaluate a text with a photo as evidence; reload: all kept.
5. Open a text's sheet: its requirements appear (the fiches come from `/api/fiches`).
6. Veille: the Journal lists texts; search works.
7. Two browsers, two accounts in the same workspace, the same register: an evaluation made in one
   appears in the other within a few seconds (Realtime).
8. Vercel → **Cron Jobs → `/api/veille/cron` → Run**: in **Logs**, "Veille : … numéro(s) lu(s)";
   if an issue was new, a commit appears in GitHub and a new deployment starts.
9. The digest without sending anything (PowerShell, your `CRON_SECRET`):

   ```powershell
   Invoke-RestMethod -Uri "https://app.abc-consulting.tn/api/notifications/cron?dry=1" -Headers @{ Authorization = "Bearer VOTRE_CRON_SECRET" }
   ```

   It answers with the number of accounts and an overview; nothing is sent with `dry=1`.
10. **Administration → Erreurs**: empty, or the errors met so far.

---

## 8. Running it

* **Errors**: Administration → Erreurs (grouped, with the screen and the version); details in Vercel
  → **Logs**.
* **The JORT**: read every morning; "Vérifier maintenant" in Veille reads at once. If the daily
  reading stops (Vercel logs show an error), check the GitHub token first.
* **Offers**: Administration → a client → the offer (trial, standard, pro), its end and limits.
* **Updates of the app**: merge into `main` and push; new migrations first (section 6).
* **Keys**: never in chat, e-mail or a commit. A key seen by anyone else: regenerate it in its
  service, update it in Vercel, redeploy.
* **Before the first client**: the legal pages (`/cgu`, `/confidentialite`) have passages in
  [brackets] to complete and have checked by a lawyer.

---

## 9. When something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| "Configuration à corriger" on the site | A `NEXT_PUBLIC_SUPABASE_*` value missing or wrong | Fix it in Vercel, redeploy |
| "Connexion au serveur impossible" | Wrong Supabase URL or key, or the project paused | Check the values; Pro projects do not pause |
| Sign-up: "adresse refusée" | An address that cannot exist (e.g. Gmail with fewer than 6 characters) | Use a real address |
| Sign-up: "e-mails de confirmation… configuration" or no e-mail | No custom SMTP, or the domain not verified | Steps 2.1 and 2.3 |
| "Trop d'e-mails envoyés" | Supabase's e-mail limit per hour | Custom SMTP, then raise the limit (1.3) |
| The e-mail's link opens a page in error | The address is not in Supabase's Redirect URLs | Step 1.3 |
| A deployment fails at "vitest run" | A unit test fails | Open the build log; fix, or ask |
| The JORT is no longer updated | GitHub token expired or without "Contents: write" | Step 3 |
| No Monday e-mail | `RESEND_API_KEY`, `NOTIFY_FROM` or `SUPABASE_SERVICE_ROLE_KEY` missing; domain not verified | Step 4.3, then the dry run of step 7.9 |
| A colleague's changes appear only after a reload | Realtime not enabled for the tables | Database → Publications → `supabase_realtime`: `registres` and `registre_lignes` must be in it (the migrations add them) |
| The site works, Administration is missing | Your account is not a platform administrator | Step 5 |
