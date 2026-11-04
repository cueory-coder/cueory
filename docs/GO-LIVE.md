# Go-live runbook (launch: Friday, November 13)

Every dashboard step Christian does before and on launch day, in order. One action per step. "You should see" says
what to check. Settings and menu paths come from the official pages linked in brackets, read on 2 November 2026.
Where those pages don't confirm a menu path, the step says **find** and describes what the setting does. If a
screen doesn't match, stop and tell Claude what you see. Don't guess.

Golden rules (the same as [SETUP.md](SETUP.md)):
- Use your **business Gmail** for every account (rule 9).
- Never paste a password, key or code into the chat. The publishable key and project address aren't secrets, but
  they still go only into Cloudflare's settings, never the chat.
- Don't add, change or delete any email DNS record (MX, SPF, DKIM, DMARC, or TXT records for email) until you've
  said yes to the email question in 1.9.

Where this comes from: the Task 141 go-live audit, with actual migration filenames rechecked on `staging` on 4 November. Never run SQL from an unmerged PR. Production changes require Claude's staging-first verification.

---

## 1. Before launch day (things that wait on you)

Do 1.1 to 1.4 this week. 1.4 (the domain) can take up to a day to become active, so start it early.

### 1.1 Two-factor on every account that controls Cueory (15 minutes)

CLAUDE.md rule 1 requires two-factor on the admin account. Do each one you haven't done yet.

1. **Google** (business Gmail): open https://myaccount.google.com/signinoptions/twosv and turn on 2-Step
   Verification if it's off. This also protects Google Cloud, where the sign-in client lives.
2. **GitHub**: click your profile picture (top right), then **Settings**, then **Password and authentication**
   (under **Access**), then **Enable two-factor authentication**. Download the recovery codes when it offers them,
   save them in your password manager, then click **I have saved my recovery codes**.
   You should see two-factor shown as enabled. [GitHub 2FA]
3. **Cloudflare**: click **Profile** (top right), then **Authentication**, then **Set up** under
   **Two-Factor Authentication**. [CF 2FA]
4. **Cloudflare backup codes**: go to **Profile** → **Security & Authentication** → **Backup codes** and save them in
   your password manager. Cloudflare says lost two-factor is the most common reason people contact its support.
   [CF backup codes]
5. **Supabase**: open https://supabase.com/dashboard/account/security and check two-factor is on, with a second
   authenticator on a different device. Supabase gives no recovery codes and can't restore an account whose
   two-factor is lost. [SB MFA]
6. **Kit** (if you made the account in SETUP Part I): find two-factor login in Kit's account settings and turn it on
   (SETUP Part I, step 3; Kit's own page wasn't checked for this runbook).

### 1.2 Check the lock on staging (5 minutes)

The lock (Cloudflare Access) must cover previews only. If it ever covered all traffic, the live site would ask
students to sign in to Cloudflare.

1. In Cloudflare, open **Workers & Pages** and click the **cueory** Worker.
2. Click the **Access** tab. [CF Access]
   You should see Access on, set to **Previews only** (not **All traffic**).
3. Look at who can sign in. It should be **your business Gmail** only, or **Cloudflare account** (members of your
   Cloudflare account, which is only you). [CF Access]
   If it says **Email domain** with `gmail.com`, stop and tell Claude: that would let anyone with a Gmail address in.
4. Click the **Previews** section of the Worker and find the `staging` preview. Copy its address. [CF Builds]
   It ends in `workers.dev` (the pattern is `staging-cueory.<your subdomain>.workers.dev`). [CF preview domains]
5. Open a private (incognito) window and go to that address.
   You should see a Cloudflare sign-in page, not the site. That means the lock works.

### 1.3 Check the production branch (2 minutes)

1. In the **cueory** Worker, go to **Settings** → **Build** → **Branch control**. [CF branches]
   You should see the production branch is `main`, and **Enable Preview Builds** is ticked.

### 1.4 Connect cueory.app (15 minutes, then up to a day of waiting)

The domain must be on Cloudflare before a Worker can use it. [CF custom domains]

1. If cueory.app isn't on Cloudflare yet, do SETUP Part H, steps 1 to 7 (nameservers). Don't delete any DNS
   record Cloudflare finds. Wait for the email saying cueory.app is **Active**.
2. In the **cueory** Worker, go to **Settings** → **Domains & Routes** → **Add** → **Custom Domain**.
   [CF custom domains] (Cloudflare also has a newer **Domains** tab on the Worker that does the same. [CF domains tab])
3. Type `cueory.app`.
4. Click **Add Custom Domain**.
   You should see `cueory.app` in the list. Cloudflare makes the DNS record for it. If it refuses because a record
   for cueory.app already exists, stop and tell Claude. Don't delete records yourself.
5. Open https://cueory.app in a private window.
   You should see today's live site (with the "we're still building" bar), with no sign-in. That's expected until
   launch day.

### 1.5 Set up the database on cueory-prod (30 minutes, only when Claude says so)

Rule 4: every file runs on `cueory-staging` first (SETUP Part L), and only then on `cueory-prod`.

Use exactly the steps of SETUP Part L, with three changes:
- open **cueory-prod** instead of `cueory-staging`, and check the name at the top says `cueory-prod`;
- run the files in the table below, in this order, once each;
- the checklist must match the `staging` repository and the migrations **verified as successfully applied to `cueory-staging`**. There are now sixteen repository files after merged PRs #235, #332, #335 and #337. GitHub merges do not execute hosted SQL. Before any production SQL, verify staging results, approval, and which versions are already present in each project.

| # | File | Run it |
| --- | --- | --- |
| 1 | `20261101060000_locked_by_default` | only after verified staging execution and release approval |
| 2 | `20261101060100_profiles` | only after verified staging execution and release approval |
| 3 | `20261101080000_concepts_sources_rights` | only after verified staging execution and release approval |
| 4 | `20261101090000_items_and_versions` | only after verified staging execution and release approval |
| 5 | `20261101100000_attempts_and_check_answer` | only after verified staging execution and release approval |
| 6 | `20261101110000_review_state_and_exam_plans` | only after verified staging execution and release approval |
| 7 | `20261101120000_flags_and_submit_flag` | only after verified staging execution and release approval |
| 8 | `20261102090000_publish_item_version` | only after verified staging execution and release approval |
| 9 | `20261102100000_study_events` | only after verified staging execution and release approval |
| 10 | `20261102110000_delete_my_account` | after Claude verifies it passed on cueory-staging |
| 11 | `20261102130000_profile_display_name_from_signup` | after Claude verifies it passed on cueory-staging |
| 12 | `20261102135000_confirmed_accounts_only` | after Claude verifies it passed on cueory-staging |
| 13 | `20261102140000_update_display_name` | after Claude verifies it passed on cueory-staging |
| 14 | `20261102160000_fresh_sign_in_and_name_rules` | only after staging tests and specific founder auth/database approval |
| 15 | `20261102170000_my_sessions` | only after staging session-isolation tests and specific founder privacy approval |
| 16 | `20261104170500_enforce_opt_in_mfa` | only after staging MFA/policy tests and specific founder auth/database approval |

1. Open https://github.com/lilchristxan/Cueory/tree/staging/supabase/migrations.
   You should see exactly the sixteen files above. If the list differs, stop for an updated reviewed order. Open PR #338 proposes a seventeenth, earlier-timestamped admin RPC migration (`20261102153000_admin_flag_rpcs.sql`), but it must not be run while unmerged. If it merges, revise this table and verify the applied order before any production SQL.
2. Open https://supabase.com/dashboard, click **cueory-prod**, and check the name at the top says `cueory-prod`.
3. Go to the **SQL Editor** section. [SB functions]
4. For each **approved, not-yet-applied** file, in verified timestamp order: open it on GitHub (SETUP Part L's links, or click the file above and then **Raw**), copy all of it, click **New Query**, paste, and click **Run**. [SB functions]
   You should see it finish with no error before considering the next file. Never execute a version already applied in this project.
5. If a file shows an error or a box asks you to confirm something: stop, don't run it again, don't run the next
   one, and send Claude the error text and the file's number (SETUP Part L explains why).
6. Run the check query from SETUP Part L, step 10.
   If all sixteen migrations have passed and been approved for production, the SETUP Part L public-schema query should show 13 tables (all `RLS on`) and 15 public functions, including the new `display_name_ok` and `my_sessions`. The MFA helper in the private schema is not included. Verify policy behavior, migration history, and the database regression suite as well as names and counts. If anything differs, stop before proceeding.
7. Tell Claude "prod database done through file N".

If a later pull request adds a file with an earlier date than one you've already run, tell Claude before running it.

**Migration history note (for Claude, nothing for you to do):** the SQL Editor doesn't record runs in Supabase's
migration history (`supabase_migrations.schema_migrations`), so the command-line tool would think nothing has run.
Before anyone uses the command-line tool on `cueory-staging` or `cueory-prod`, every file run by hand there is
marked as run, without running it again: `supabase migration repair <version> … --status applied --linked`, for
example `supabase migration repair 20261101060000 20261101060100 --status applied --linked`. It only updates the
history table; it doesn't apply or undo any SQL. [SB migrations] [SB repair]

### 1.6 Sign-in settings on cueory-prod (25 minutes)

This is SETUP Part O, step 1. The settings, briefly:

1. Open the URL Configuration page, https://supabase.com/dashboard/project/_/auth/url-configuration (the link
   Supabase's docs give), and pick **cueory-prod** if it asks. In SETUP Part M it's **Authentication** → **URL
   Configuration**. [SB redirect URLs]
2. Set **Site URL** to `https://cueory.app` and save.
3. Under **Redirect URLs**, add `https://cueory.app/auth/callback**`.
4. Add `https://cueory.app/reset-password`.
   You should see exactly these two, and no `localhost` or staging address. Supabase recommends exact paths on a
   live site; the callback keeps `**` because each sign-in carries the page to open next (SETUP Part O). [SB redirect
   URLs]
5. Do SETUP Part M, steps 9 to 26, on **cueory-prod**: **Confirm Email** on (in the Email provider's settings),
   **Allow anonymous sign-ins** off, **Allow new users to sign up** on, minimum password 10, default email templates,
   default rate limits, authenticator two-factor on. [SB general config] The confirmed-account policy from merged PR #235 requires **Confirm Email** to be on. Do not apply this migration to production until it has passed staging verification:
   unconfirmed or anonymous accounts cannot answer questions, submit flags, or record study events.

### 1.7 Google sign-in for the live site, and publish the consent screen (25 minutes)

1. Open Supabase's Google provider page, https://supabase.com/dashboard/project/_/auth/providers?provider=Google
   (the link Supabase's docs give), and pick **cueory-prod** if it asks. [SB Google] In SETUP Part N it's under
   **Authentication** → **Sign In / Providers** → **Google**.
2. Copy the callback address shown there. It ends in `/auth/v1/callback`. [SB Google]
3. In Google Cloud (https://console.developers.google.com/auth/overview, business Gmail, project `Cueory`), open
   **Clients** and click **Create client**. [Google clients]
4. **Application type:** **Web application** [SB Google]. Name it `cueory-prod` if it asks for a name (Google's page
   doesn't list a name field; check on screen).
5. **Authorized JavaScript origins:** `https://cueory.app` (nothing after it). [SB Google]
6. **Authorized redirect URIs:** the callback address from step 2.
7. Click **Create** and save the **Client ID** and **Client secret** in your password manager as "Google client
   cueory-prod". Google shows the secret in full only once. [Google clients]
8. Back in Supabase's Google page, turn Google on, paste the Client ID and Client secret, and click **Save**.
   [SB Google]
9. In Google Cloud, open **Branding**. Under the app domain, add `https://cueory.app` (home page),
   `https://cueory.app/privacy` (privacy policy) and `https://cueory.app/terms` (terms), and add `cueory.app` under
   **Authorized domains**. Save. [Google branding]
   Google says live apps need all three links, and the home page must be on a verified domain you own. Wait until
   the terms text is on the site (audit blocker 5). If Google asks you to verify that you own cueory.app, stop and
   tell Claude: it may need a DNS record.
10. Open **Data Access** and check only `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` are
    listed. Other scopes bring Google's review. [SB Google]
11. Open **Audience** and click **Publish app**. [Google audience]
    You should see the status change from **Testing** to **In production**, which opens sign-in to any Google
    account. If Google asks for verification or payment, stop and tell Claude.
12. Don't upload a logo: a new logo on a live app starts brand verification. [Google branding]

### 1.8 Cloudflare build settings: staging values now, live values on launch day (10 minutes)

The site reads two settings when it's built: `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (D-73).
Workers Builds keeps one set for production builds (`main`) and one for previews (`staging` and every other branch);
changes reach a site only on its next build. [CF Builds API] [CF Builds config]

Get the values (they're safe in a browser, but keep them out of the chat): in Supabase, open the project's
**Connect** dialog for the address and publishable key, or **Settings** → **API Keys** for the key. Use only the
key that starts with `sb_publishable_`, never a secret key. [SB API keys]

1. In the **cueory** Worker, go to **Settings** → **Build** and find **Build variables and secrets**. [CF Builds config]
2. Find the switch between **Production** and **Previews Base** on that page (Cloudflare's docs mention both for
   Builds, but don't show this section's exact layout; check on screen). [CF Artifacts builds] [CF Previews config]
3. With **Previews Base** chosen, add `PUBLIC_SUPABASE_URL` = the **cueory-staging** address.
4. Add `PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the **cueory-staging** publishable key. Save.
5. Switch to **Production**.
   You should see **no** Supabase settings there yet. Leave it empty until launch day (step 2.2): any release
   merged after the live values go in turns accounts on for the live site.
6. Cloudflare's docs say an existing preview keeps its own copy of the base settings; new values reach only previews
   made afterwards. [CF Builds API] So check staging: open the staging preview (1.2, step 4) after its next build and
   go to `/signin`.
   You should see the sign-in form. If it says "accounts open soon", find the `staging` preview's own build settings
   in the **Previews** section, or tell Claude.

After PR #239 merges, a wrong value (only one of the two, a bad address, or a secret key) stops the build with a
reason, and the site keeps its previous version.

### 1.9 The email question (your decision)

Supabase's built-in email sends only to your Supabase team, at 2 messages an hour, and is meant for testing.
Students' confirmation and password-reset emails need your own mail service (custom SMTP). [SB SMTP] The plan is
Resend (free, 100 emails a day). Resend sends only from a domain you verify by adding the records it generates:
DKIM and SPF as `TXT` and `MX` or `CNAME` records, plus DMARC afterwards. Resend strongly recommends a subdomain of
cueory.app rather than cueory.app itself. [Resend domains] Those are email DNS records, so rule 9 needs your yes.

**Choose one and tell Claude:**

- **A. Yes to Resend.** Claude gives you the steps (Resend account with your business Gmail and two-factor, add the
  subdomain, copy Resend's records exactly into Cloudflare DNS, verify, make an API key, and paste it into Supabase's
  SMTP settings: host `smtp.resend.com`, port `465`, username `resend`, password = the API key). [Resend Supabase]
  After saving, Supabase starts at 30 emails an hour, raisable under **Rate Limits**. [SB SMTP] The privacy page then
  names Resend (audit (h)).
- **B. Google-only sign-in at launch.** No DNS change. Email-and-password sign-up stays off the live site until you
  say yes; students sign in with Google, which needs no email from Cueory. Claude makes the code change that hides
  email sign-up and "forgot password" on the live site (it touches sign-in, so you approve it), and on staging checks
  that a Google account can answer a real question (merged PR #235 requires a confirmed, non-anonymous account for those actions).

---

## 2. Launch day, Friday, November 13

Do these in order. After each step, check the live site as it says.

1. **Check staging one last time.** Open the staging preview in a private window, sign in through Cloudflare, then
   sign in to Cueory with Google (and email, if you chose A).
   You should see the account corner with your initials, and `/account` should open.
2. **Put the live settings in.** In the **cueory** Worker, **Settings** → **Build** → **Build variables and
   secrets**, choose **Production** and add `PUBLIC_SUPABASE_URL` = the **cueory-prod** address and
   `PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the **cueory-prod** publishable key. Save. [CF Builds config]
   Check: https://cueory.app doesn't change yet. Settings reach the live site only with the next build.
3. **Check cueory-prod is awake.** Open https://supabase.com/dashboard and click **cueory-prod**.
   You should see it running. If it says paused, click **Resume project** and confirm. [SB pausing]
4. **Merge the release.** Open the Release pull request from `staging` into `main` (Claude sends the link). Wait for
   every check to be green, then click **Merge pull request** → **Confirm merge**. Only you merge into `main`.
5. **Watch the build.** In the Worker, open **Deployments** and **View build history**. [CF Builds]
   You should see a production build for `main` finish, and a new version become the **Active Deployment**.
   If the build fails, the live site keeps the old version: send Claude the build's error text.
6. **Check the live site** in a private window at https://cueory.app:
   - the home page loads with the padlock, and the "we're still building" bar is gone (if that release removed it);
   - `/signin` shows the sign-in form, not "accounts open soon";
   - **Sign in with Google** works with your business Gmail and returns you to cueory.app, showing your initials;
   - `/account` opens with your name, **download my data** gives a file, and **sign out** works;
   - the flag button on a lesson page sends (after PR #237 merges);
   - `/privacy`, `/terms` and `/disclaimer` show final text, with no "paste your … here" box.
7. **Check the lock is still on staging.** Open the staging preview address in a new private window.
   You should see the Cloudflare sign-in page.
8. **Check the data landed in cueory-prod.** In Supabase **cueory-prod**, open the **SQL Editor**, click **New
   Query**, paste `select count(*) from public.profiles;` and click **Run**. [SB functions]
   You should see `1` (your account from step 6), or the number of accounts made so far.
9. **Tell Claude** on the "Daily report" issue: "launched", or what looked wrong on which page.

---

## 3. Rollback: how to undo each step

Undo the release first if students are affected; fix the cause afterwards through `staging`.

| Step | How to undo it | Notes |
| --- | --- | --- |
| Release (2.4) | SETUP's "If a release breaks the live site": Worker → **Deployments** → three dots on the last version built from `main` before the release → **Rollback**. [CF rollbacks] | Takes effect right away. Only the code changes; the database stays as it is. The 100 most recent versions can be rolled back to. |
| Live settings (2.2) | Delete the two **Production** build variables. | Takes effect only on the next build. To turn accounts off now, also roll back to a version built before the settings were added: the settings are read at build time (`astro.config.mjs`), so that version has accounts off. |
| Preview settings (1.8) | Delete or correct the two **Previews Base** variables. | Previews that already exist keep their own copy. [CF Builds API] |
| Database files (1.5) | No undo button. Don't delete tables. Tell Claude: a fix comes as a new file, tested on staging first. | `migration repair --status reverted` only edits the history table; it undoes no SQL. [SB repair] |
| Sign-in addresses (1.6) | Put the old **Site URL** and **Redirect URLs** back on the URL Configuration page. [SB redirect URLs] | |
| Google sign-in (1.7) | Turn the Google provider off in Supabase **cueory-prod** and save. [SB Google] | Existing accounts stay; nobody new signs in with Google. To go back to **Testing**, find the publishing status on **Audience** (Google's page shows **Publish app** but not the way back; check on screen). [Google audience] |
| Custom domain (1.4) | Find the remove option next to `cueory.app` under **Settings** → **Domains & Routes**. Cloudflare's page doesn't give the steps, so ask Claude first. [CF custom domains] | Removing it doesn't remove its certificate; that's under **SSL/TLS** → **Edge Certificates**. [CF custom domains] The `workers.dev` address keeps working. |
| Email (1.9, choice A) | Find the custom SMTP on/off switch on Supabase's SMTP settings page and turn it off. [SB SMTP] | Sign-up emails stop reaching students. Removing Resend's DNS records is an email DNS change: ask Claude first. |
| Lock (1.2) | Never undo. If it's ever off, turn it back on in the **Access** tab with **Previews only**. [CF Access] | |
| Two-factor (1.1) | Never undo. | |

---

## 4. After launch: open decisions

These need your call. None costs money unless you choose a paid option.

1. **Backups of cueory-prod.** Free projects have no downloadable backups; Supabase tells free projects to export
   their data regularly with the command-line tool's `db dump` and keep off-site copies. [SB backups]
   [SB production checklist] D-73's nightly encrypted backup workflow already exists as a **draft** in
   `.github/workflows/prod-backup.yml` on `staging`. Do not create a duplicate. Before it reaches `main` or runs,
   review the workflow, explicitly approve its protected settings, and configure the `prod-backup` environment and
   secrets in GitHub. Then decide: (a) enable that existing nightly backup (free), (b) Supabase Pro with daily
   backups (paid, needs your written approval), or (c) neither for now.
2. **Keeping the projects awake.** Supabase pauses free projects after a 7-day stretch of low activity, emails a
   warning about a week before, and a paused project can be resumed (**Resume project**). [SB pausing] A few
   database requests a day is enough. `cueory-staging` will pause when nobody tests for a week; `cueory-prod` could
   too in a quiet week, and only the paid plan guarantees it never pauses. [SB production checklist] D-73 plans a
   daily keep-alive run (free, a workflow plus secrets, so it needs your approval). Decide: keep-alive for staging
   only, for both, or none (and resume by hand when Supabase emails you).
3. **The live site's `workers.dev` address** stays public next to cueory.app (search engines are pointed to
   cueory.app). Turning it off is a code change (`workers_dev: false` in `wrangler.jsonc`), because a dashboard-only
   change comes back on the next deploy, and it must not switch off the staging preview addresses. [CF workers.dev]
   It's a deployment change, so you'd approve it. Nice to have, not needed for launch.
4. **Visit counting (Web Analytics).** For a domain on Cloudflare: **Web Analytics** → **Add a site** → pick
   `cueory.app` → **Done**. Cloudflare then adds its counting script automatically; the site's security policy
   already allows it. [CF Web Analytics] Turn it on when you're ready.

---

## Sources (read 2 November 2026)

[GitHub 2FA]: https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication
[CF 2FA]: https://developers.cloudflare.com/changelog/post/2025-10-30-email-2FA/
[CF backup codes]: https://developers.cloudflare.com/changelog/post/2025-10-07-recovery-codes/
[SB MFA]: https://supabase.com/docs/guides/platform/multi-factor-authentication
[CF Access]: https://developers.cloudflare.com/workers/configuration/cloudflare-access/
[CF Builds]: https://developers.cloudflare.com/workers/ci-cd/builds/
[CF preview domains]: https://developers.cloudflare.com/workers/previews/custom-domains/
[CF branches]: https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
[CF custom domains]: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
[CF domains tab]: https://developers.cloudflare.com/changelog/post/2026-05-14-domains-tab/
[SB functions]: https://supabase.com/docs/guides/database/functions
[SB migrations]: https://supabase.com/docs/guides/deployment/database-migrations
[SB repair]: https://supabase.com/docs/reference/cli/supabase-migration-repair
[SB redirect URLs]: https://supabase.com/docs/guides/auth/redirect-urls
[SB general config]: https://supabase.com/docs/guides/auth/general-configuration
[SB Google]: https://supabase.com/docs/guides/auth/social-login/auth-google
[Google clients]: https://support.google.com/cloud/answer/15549257
[Google branding]: https://support.google.com/cloud/answer/15549049
[Google audience]: https://support.google.com/cloud/answer/15549945
[CF Builds config]: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
[CF Builds API]: https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
[CF Artifacts builds]: https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/artifacts-integration/
[CF Previews config]: https://developers.cloudflare.com/workers/previews/configuration/
[SB API keys]: https://supabase.com/docs/guides/api/api-keys
[SB SMTP]: https://supabase.com/docs/guides/auth/auth-smtp
[Resend domains]: https://resend.com/docs/add-a-domain
[Resend Supabase]: https://resend.com/docs/send-with-supabase-smtp
[SB pausing]: https://supabase.com/docs/guides/platform/free-project-pausing
[CF rollbacks]: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
[SB backups]: https://supabase.com/docs/guides/platform/backups
[SB production checklist]: https://supabase.com/docs/guides/deployment/going-into-prod
[CF workers.dev]: https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
[CF Web Analytics]: https://developers.cloudflare.com/web-analytics/get-started/

- GitHub: [Configuring two-factor authentication][GitHub 2FA]
- Cloudflare: [Email two-factor][CF 2FA], [Backup codes][CF backup codes], [Access for Workers][CF Access],
  [Builds][CF Builds], [Build configuration][CF Builds config], [Build branches][CF branches],
  [Builds API (production vs preview settings)][CF Builds API],
  [Artifacts integration (Previews Base in Builds)][CF Artifacts builds],
  [Previews configuration][CF Previews config], [Preview custom domains][CF preview domains],
  [Custom Domains][CF custom domains], [Domains tab][CF domains tab], [workers.dev][CF workers.dev],
  [Rollbacks][CF rollbacks], [Web Analytics][CF Web Analytics]
- Supabase: [Dashboard two-factor][SB MFA], [Database functions (SQL Editor)][SB functions],
  [Deploy database migrations][SB migrations], [migration repair][SB repair], [Redirect URLs][SB redirect URLs],
  [General configuration][SB general config], [Login with Google][SB Google], [API keys][SB API keys],
  [Custom SMTP][SB SMTP], [Project pausing][SB pausing], [Backups][SB backups],
  [Production checklist][SB production checklist]
- Google: [Manage OAuth Clients][Google clients], [Manage OAuth App Branding][Google branding],
  [Manage App Audience][Google audience]
- Resend: [Add a domain][Resend domains], [Send with Supabase SMTP][Resend Supabase]
