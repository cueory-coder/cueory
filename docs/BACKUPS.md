# Backups of the live database (Task 203)

**Status: proposal, waiting for Christian.** Nothing runs yet. The draft workflow is
`.github/workflows/prod-backup.yml` (option A below). Workflows and secrets need Christian's approval (CLAUDE.md
rule 3).

## Why we need our own

- Supabase backs up Pro, Team and Enterprise projects every day. The Free plan isn't on that list, and Supabase
  recommends that free projects "regularly export their data using the Supabase CLI `db dump` command" and keep
  off-site copies ([Supabase: Database backups][sb-backups]).
- Point-in-time recovery is a paid add-on, so it's out ($0 rule).

## What every option shares

1. **The dump.** Three files, made with the commands in Supabase's own guide ([Backup and restore using the
   CLI][sb-restore]): `roles.sql` (`--role-only`), `schema.sql`, and `data.sql` (`--data-only --use-copy`, minus the two
   vector tables the guide excludes). We use the same pinned Supabase CLI as the Database checks (2.122.0). It runs
   `pg_dump` in a container ([CLI reference: db dump][sb-cli-dump]), which GitHub's Ubuntu runners can do.
2. **How it connects.** A direct connection to a Free project is IPv6 only; the shared pooler is IPv4 on every plan
   ([Supabase: Connect to your database][sb-connect]). GitHub-hosted runners don't support IPv6 (GitHub's answer:
   "can't support this at this time due to infrastructure constraints", [runner-images #668][gh-ipv6]), and Supabase
   lists GitHub Actions as IPv4 only ([Supabase: IPv4 and IPv6 compatibility][sb-ipv4]). So the job uses cueory-prod's
   **Session pooler** address (port 5432), which is what Supabase's restore guide says to use without IPv6. The IPv4
   add-on would cost money, so it's out.
3. **Encryption, before anything leaves the runner.** The three files are packed and encrypted with
   [`age`][age] to a public key kept in `.github/age/backup-recipients.txt`. A public key can lock files but not open
   them, so it's safe in a public repository. The private key never touches GitHub: Christian keeps it in his password
   manager. The plain dump only exists in the runner's memory and is deleted when the job ends. The runner installs
   `age` from Ubuntu's signed package ([Ubuntu: age in 24.04][ubuntu-age]).
4. **Secrets.** Two values, kept as **environment secrets** of a GitHub environment named `prod-backup` whose deployment
   branch is `main` only. Environment secrets reach only jobs that use that environment, and only once its rules pass
   ([GitHub: Managing environments][gh-env]), so a workflow file on another branch can't read them. The job also masks
   the database password before any tool could print it ([GitHub: Masking a value][gh-mask]). Nothing secret is ever
   written to the log; the log shows each backup's name, size and SHA-256 fingerprint, which lets a restore confirm a
   file is the one the job made.
5. **Schedule.** Nightly at 3:41 am Arizona time. GitHub runs scheduled workflows only from the default branch
   (`main`), can delay them at busy times (the start of every hour), and in a public repository **turns them off after
   60 days without repository activity** ([GitHub: Events that trigger workflows][gh-schedule]). Claude checks the
   latest run in each daily report, so a stopped or failing backup is noticed within a day.
6. **Losing the private key means losing every backup.** Christian keeps two copies (password manager plus one
   offline copy, such as a printout in a drawer).

**What a dump does not hold** (redo these from SETUP.md if a new project is ever needed): sign-in settings (Site URL,
redirect addresses, Google client), API keys, Edge Functions and files in Storage buckets (Cueory has none yet).
Supabase's guide doesn't say whether the data dump includes accounts in the `auth` schema; the practice restore below
checks it before we rely on it.

## The options (all $0)

| | A. Oracle Object Storage (recommended) | B. GitHub Actions artifacts | C. A private GitHub repository |
| --- | --- | --- | --- |
| Where the backup lives | A private bucket in Christian's Oracle Cloud account | Attached to each workflow run in this public repository | A second, private repository, `cueory-backups` |
| Who can read the encrypted file | Only people signed in to Christian's Oracle account | **Anyone signed in to GitHub** (everyone has read access to a public repository) | Only Christian (and anyone he adds) |
| Who can open (decrypt) it | Only Christian (private key) | Only Christian | Only Christian |
| How long it's kept | 31 days (we choose) | Up to 90 days, the maximum for a public repository | Forever, unless history is rewritten |
| New account or secret | Oracle bucket + 1 upload address | None | 1 deploy key |
| Free limit | 20 GB and 50,000 requests a month | GitHub's storage rules for public repositories aren't stated in its billing docs | Repository size |

### A. Oracle Cloud Object Storage (recommended)

- **Cost:** $0. Oracle's Always Free tier includes 20 GB of Object Storage and 50,000 Object Storage API requests a
  month, for the life of the account ([Oracle: Always Free resources][oci-free]). One backup a night is about 30 requests a
  month, and the database is a few megabytes. Two cautions from the same page: if the account is still in its Free
  Trial and holds more than 20 GB when the trial ends, Oracle deletes all objects; and an account that was upgraded to
  pay-as-you-go would be billed for use beyond the free amounts, so step 2 below checks that and sets an alert.
- **Where and who:** a private bucket. The job gets only a **write-only pre-authenticated request** limited to the
  `prod/` prefix: it can upload, but it can't list or download anything ([Oracle: Pre-authenticated
  requests][oci-par]). Anyone holding that address could upload too, so it lives only in the environment secret; if it
  ever leaks, deleting the request revokes it at once.
- **Protection:** a 30-day **time-bound retention rule** (left unlocked) stops anyone from overwriting or deleting a
  backup in its first 30 days ([Oracle: Retention rules][oci-retention]), and a **lifecycle rule** deletes backups after
  31 days ([Oracle: Lifecycle policies][oci-lifecycle]), so about a month of nightly backups is kept and deleted
  accounts don't linger longer than that.
- **Why recommended:** the encrypted file is never public, the job can't read or erase old backups, and retention is
  ours to choose.

### B. GitHub Actions artifacts

- **Cost:** $0, no new account. The job attaches the encrypted file to its run with `retention-days: 30`.
- **Who can read:** "People who are signed into GitHub and have read access to a repository can download workflow
  artifacts" ([GitHub: Downloading artifacts][gh-artifacts]). On a public repository that is any GitHub user. The file
  is encrypted, but student data would be published as ciphertext with no way to take it back.
- **Retention:** 1 to 90 days on a public repository; the default is 90 ([GitHub: Retention for artifacts and
  logs][gh-retention]). GitHub's billing page lists storage allowances only for private repositories, so whether these
  files count against the account's storage isn't documented ([GitHub: Actions billing][gh-billing]).
- **Use it as:** a fallback if Oracle can't be set up, not the main copy.

### C. A private GitHub repository

- **Cost:** $0. The job pushes the encrypted file to a private repository with a deploy key that can write to that one
  repository only ([GitHub: Deploy keys][gh-deploy-keys]). Pushing doesn't use Actions minutes in the private
  repository.
- **Who can read:** only Christian.
- **Drawbacks:** every backup stays in the repository's history forever unless it's rewritten, which breaks the
  promise that deleted accounts disappear. Deploy keys never expire, and a write key could also delete history.
  Supabase's own guide warns never to back up to a public repository; this one is private, but it's still the weakest
  fit for a growing binary file.

## Recommendation

**Option A.** It keeps the encrypted file private, gives the job no power to read or delete old backups, and costs $0.
If Christian prefers no new setup in Oracle, option B works today, accepting that the ciphertext is public for 30 days.

## Christian's steps

### For every option: the backup key (10 minutes)

1. On your Mac, ask Claude to "make the Cueory backup key". Claude installs `age` from its official download and runs
   `age-keygen -o ~/Desktop/cueory-backup-key.txt`. You should see one line starting with `Public key: age1`. Claude
   never opens the file.
2. Open `cueory-backup-key.txt` on your Desktop with TextEdit. You should see three lines; the last starts with
   `AGE-SECRET-KEY-1`.
3. In your password manager, create a secure note named **Cueory backup key**, paste all three lines, and save.
4. Make one offline copy (print the note and keep it somewhere safe). Without this key no backup can ever be opened.
5. Send Claude the line that starts with `age1`. It is safe to share. Claude adds it to
   `.github/age/backup-recipients.txt` in a pull request for your approval.
6. Keep the Desktop file until the practice restore below, then move it to the Trash and empty the Trash.

### Option A: Oracle bucket and upload address (20 minutes)

1. Sign in to Oracle Cloud. Before creating anything, tell Claude whether your account shows **Free Tier** or
   **Pay As You Go** on its billing page, so Claude can give you the right check (on pay-as-you-go, a $1 budget alert,
   which only emails you and never stops anything ([Oracle: Budgets][oci-budgets])).
2. Make sure the Console shows your **home region** (Always Free resources are free there), go to the Object Storage
   **Buckets** list page, and select **Create bucket**.
3. Name it `cueory-prod-backups`. Leave **Default storage tier** on **Standard**. Leave **Enable object versioning** off
   (a retention rule can't be added to a versioned bucket). Leave encryption on **Encrypt using Oracle-managed keys**.
   Select **Create bucket**. You should see it in the list. Don't change its visibility.
4. Open the bucket, select **Policies**, find **Retention rules**, and select **Create rule**. Name: `keep-30-days`.
   Type: **Time-bound**. Duration: **30 Days**. Leave **Enable retention rule lock** unticked. Select **Create rule**.
5. Still under **Policies**, find **Lifecycle policy rules** and select **Create rule**. Name:
   `delete-after-31-days`. Target: **Objects**. Lifecycle action: **Delete**. Number of days: **31**. Select **Create rule**. If the Console warns
   that a policy is missing, let it create the policy (Object Storage needs permission to delete on your behalf).
6. Select **Management**, find **Pre-authenticated requests**, and select **Create pre-authenticated request**.
   Name: `nightly-upload`. Target: **Object with prefix**. Prefix: `prod/`. Access type: **Permit object writes on those
   with the specified prefix**. Leave **Enable object listing** unticked. Expiration: a date ten years from today.
   Select **Create pre-authenticated request**.
7. Copy the **Pre-authenticated request URL**. Oracle shows it only once. Don't paste it in chat or anywhere but step 9.
8. In GitHub, open the repository's **Settings**, then **Environments**, select **New environment**, name it
   `prod-backup`, and select **Configure environment**. Under **Deployment branches and tags**, choose **Selected
   branches and tags** and add `main`.
9. In that environment, under **Environment secrets**, select **Add secret**. Name: `BACKUP_UPLOAD_URL`. Value: the
   address from step 7. Select **Add secret**.
10. In Supabase, open **cueory-prod**, select **Connect**, and copy the **Session pooler** connection string. Replace
    `[YOUR-PASSWORD]` with the database password from your password manager. If that password has anything other than
    letters and numbers, stop and tell Claude (the address must be percent-encoded).
11. Back in the `prod-backup` environment, add a second secret. Name: `PROD_DB_URL`. Value: the string from step 10.
12. Approve the pull request with the workflow and merge it into `main` with the next release. Then open **Actions**,
    select **Production backup**, and select **Run workflow** on `main`. You should see a green run whose last step
    says `Uploaded prod/cueory-prod-…tar.gz.age`, and the file in the bucket under `prod/`.

### Option B: artifacts instead

1. Do the key steps above, then steps 8 and 10 to 11 of option A (no Oracle steps, no `BACKUP_UPLOAD_URL`).
2. Tell Claude to switch the workflow's last step to attach the file to the run for 30 days, and approve that change.

### Option C: a private repository instead

1. Do the key steps above.
2. Create a private repository named `cueory-backups` under your account.
3. Claude makes a key pair in a file on your Mac without showing it. You paste the public half in that repository's
   **Settings**, **Deploy keys**, with **Allow write access** ticked, and the private half as the `prod-backup`
   environment secret `BACKUP_DEPLOY_KEY`, then delete the file.
4. Do steps 8 and 10 to 11 of option A, then approve Claude's change to the workflow's last step.

## Restoring

**A real restore always needs Christian's approval and is done with Claude**, never improvised (docs/OPERATIONS.md).
These steps follow Supabase's restore guide ([Backup and restore using the CLI][sb-restore]).

1. Choose the backup: in the Oracle bucket, under `prod/`, the newest file from before the problem. Download it.
2. In GitHub **Actions**, open that night's **Production backup** run and check its SHA-256 matches the file's
   (Claude runs `shasum -a 256` on it). Run logs are kept 90 days.
3. Decrypt it on your Mac: Claude runs `age --decrypt -i <your key file> <backup> | tar -xzf -`, giving `roles.sql`,
   `schema.sql` and `data.sql`. Delete the key file afterwards.
4. Make the project to restore into. Supabase's guide restores into a **new** project. The Free plan allows two active
   projects, so pause `cueory-staging` first if needed, then create `cueory-prod-restore` in a West US region and
   enable any extensions the old project used.
5. Copy the new project's **Session pooler** connection string from **Connect**.
6. Claude runs, from Supabase's guide:
   `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname "<connection string>"`.
7. Check it: the table list and row counts match what the old project showed, row-level security is on for every table
   (SETUP.md Part L's check query), and student accounts are there.
8. Point the site at it: redo the sign-in settings for the new project (SETUP.md Parts M and N), update the production
   build variables in Cloudflare, and release through staging as usual.
9. Delete the decrypted `.sql` files.

**Practice restore (before launch, then every few months):** steps 1 to 3, then restore into a throwaway local
database on your Mac (Docker Desktop and the Supabase CLI, the same way CI's Database checks do) instead of a new
project, and check step 7. It proves the key, the file and the steps work, without touching staging or prod.

## Keep-alive for cueory-staging (proposal only)

- Supabase pauses a Free project "if it gets too little database activity over a week". Opening the project in the
  dashboard or sending real requests from the app counts, and "a few requests a day is usually enough ... though that
  isn't a guarantee" ([Supabase: Do Supabase projects pause?][sb-pause-faq]). The docs don't say whether automated
  pings are allowed or counted ([Supabase: Project pausing][sb-pausing]).
- A paused project keeps its data, comes back with **Resume project** in the dashboard, and can be restored for up to a
  year after pausing. Supabase emails a warning before it pauses.
- **Proposal:** because the docs don't address automated pings, no keep-alive workflow is drafted. Until Christian
  decides: staging gets real use whenever he checks a preview; if a pause warning arrives, he opens the project in the
  dashboard. If he wants automation, the smallest version is one daily read of a public table with the publishable key,
  from a scheduled workflow in its own pull request, after asking Supabase support whether it's acceptable.
- cueory-prod: once students use it, their requests keep it awake. Before launch, the docs don't say whether the
  nightly backup's connection counts as activity.

## Before backups start

- **/privacy** should say that encrypted backups are kept for 31 days, so a deleted account can remain in a backup for
  up to 31 days (Christian approves the wording).
- **SECURITY.md** already says the database "is dumped nightly". That is true only once this runs; Christian may want
  to change it to "from launch".
- **docs/OPERATIONS.md** (PR #268) should link to this page's restore steps.

Every link on this page goes to the official documentation it cites, all checked on 2 November 2026.

[sb-backups]: https://supabase.com/docs/guides/platform/backups
[sb-restore]: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
[sb-cli-dump]: https://supabase.com/docs/reference/cli/supabase-db-dump
[sb-connect]: https://supabase.com/docs/guides/database/connecting-to-postgres
[sb-ipv4]: https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP
[sb-pausing]: https://supabase.com/docs/guides/platform/free-project-pausing
[sb-pause-faq]: https://supabase.com/kb/faqs/platform/free-project-pausing
[gh-ipv6]: https://github.com/actions/runner-images/issues/668
[gh-env]: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
[gh-mask]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
[gh-schedule]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[gh-artifacts]: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts
[gh-retention]: https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization
[gh-billing]: https://docs.github.com/en/billing/concepts/product-billing/github-actions
[gh-deploy-keys]: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
[oci-free]: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
[oci-par]: https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingpreauthenticatedrequests.htm
[oci-retention]: https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usingretentionrules.htm
[oci-lifecycle]: https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/usinglifecyclepolicies.htm
[oci-budgets]: https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm
[age]: https://github.com/FiloSottile/age
[ubuntu-age]: https://packages.ubuntu.com/noble/age
