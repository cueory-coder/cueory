# Moving from GitHub to GitLab: the migration package

Written 2026-11-11 by Claude (migration agent). Nothing here is switched on yet. Every change to CI, rules files or
settings waits for Christian (CLAUDE.md rule 3). Proposed text for CLAUDE.md, AGENTS.md and the other rules files is in
[proposals/RULES-FILES-GITLAB.md](proposals/RULES-FILES-GITLAB.md).

## Where things stand

- The code is on GitLab, `cueory1/cueory`, **private**, on GitLab Free. GitHub is gone (account suspended), so nothing
  in `.github/` runs anywhere. GitLab ignores that folder.
- `staging` has **no `.gitlab-ci.yml`**, so no automatic checks run on merge requests today. The only checks are the
  ones Claude's reviewer runs in its own sandbox before posting "Verified by Claude".
- The green marks on merge requests come from **Cloudflare Workers Builds** (pipelines with source `external`). They
  mean the site built and a locked preview deployed. They are not tests.
- Three open merge requests try to fix CI or the rules files: !10, !15 and !9. They are compared below.

## 1. Inventory: what was GitHub-only

| Item | What it did | On GitLab | Plan |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml` | Type check, build, unit tests, Chromium in four parts, WebKit and Firefox on release PRs, gitleaks, Semgrep | Not running | Replace with `.gitlab-ci.yml` (section 2) |
| `.github/workflows/codeql.yml` | CodeQL (only ran while the repository was public) | Not available | Semgrep in CI (section 3) |
| `.github/dependabot.yml` | Weekly npm and Actions update PRs | Not available | Weekly `npm audit` job plus a monthly update MR by Claude (section 3) |
| `.github/workflows/staging-automerge.yml`, `scripts/automerge/*`, `scripts/staging_automerge.ts`, `automation.json` | Merged clean PRs into `staging` (D-39) through GitHub's API | Can't run (GitHub API, Codex GitHub app) | Retire. The lead merges into `staging` after a "Verified by Claude" note |
| `.github/workflows/database.yml` | pgTAP tests on a throwaway local Supabase when `supabase/**` changed | Not running | Later: run on Christian's runner or on demand (section 2, step 5) |
| `.github/workflows/prod-backup.yml` | Draft nightly encrypted backup of cueory-prod | Never ran | Later: a GitLab scheduled pipeline with protected variables. Separate approval |
| `.github/CODEOWNERS` | Asked for Christian's review on sensitive paths | No effect: GitLab Code Owners is Premium only ([docs][gl-codeowners]) | Keep as a list; the rules files carry the same list |
| `.github/pull_request_template.md` | PR description template | Not used | Optional: copy to a GitLab merge request template later |
| GitHub secret scanning and push protection | Blocked pushes that contained keys | Push protection is Ultimate only ([docs][gl-push-protection]) | gitleaks in CI (section 3) |

Code and tests that mention GitHub:

- **`scripts/check-legal-release.mjs`** blocks a production build with draft legal pages. It only recognises GitHub's
  variables, or a Cloudflare build of a branch named exactly `main`. **Cloudflare's production branch is currently
  `legacy/main`, so this gate does not run on production builds today.** Fix before any launch: either point Cloudflare
  at `main` or teach the script the branch actually used. This is a deployment gate, so it needs Christian's approval.
- `playwright.config.ts` uses the `github` reporter whenever `CI` is set. GitLab sets `CI` too, so the log fills with
  GitHub-style annotations. Harmless; the GitLab job passes `--reporter` to override it (as !10 and !15 do).
- `src/pages/sw.js.ts` reads `WORKERS_CI_COMMIT_SHA` first and `GITHUB_SHA` only as a fallback. Fine as is.
- Unit tests read the GitHub files: `ci-workflow`, `dependabot`, `release-browser-gate`, `legal-release-readiness`,
  `staging-automerge`, `automerge-event`. **Keep `.github/` until a cleanup MR moves these tests to
  `.gitlab-ci.yml`**; deleting the folder first would break `npm test`.

Docs that describe GitHub as current (to update in one docs MR after Christian approves the plan): `SECURITY.md`
(GitHub's vulnerability form, GitHub secrets, CodeQL), `README.md` ("edit on GitHub"), `CONTRIBUTING.md`, `GEMINI.md`,
`docs/SETUP.md` (GitHub two-factor, Cloudflare's GitHub connection, `raw.githubusercontent.com` migration links that no
longer open), `docs/BACKUPS.md`, `docs/GO-LIVE.md`, `docs/TESTING.md`, `docs/ADMIN-CONSOLE.md`. `docs/STATUS.md` and
`docs/DECISIONS.md` are history and stay as written.

## 2. The CI plan (one plan, $0)

### The budget, with real numbers

GitLab Free gives **400 compute minutes a month** per top-level group, and the standard small Linux runner counts 1
minute per minute of work ([GitLab: compute minutes][gl-minutes]). The count resets on the first of each month. When
it runs out, GitLab's runners stop taking jobs; nothing is charged. Runners you register yourself (project or group
runners) **don't count** ([GitLab: compute quota][gl-quota]).

MR !10 ran the full Chromium suite on GitLab's runners on 2026-11-11 ([pipeline 3055831133][p-10]). Times from its
job logs:

| Job | Billed minutes |
| --- | ---: |
| Type check, build and unit tests (including `npm ci`) | 2.0 |
| Browser tests, part 1 / 2 / 3 / 4 | 22.6 / 17.4 / 21.6 / 27.8 |
| **Whole pipeline (all four Chromium projects)** | **about 91** |

So one full Chromium run uses almost a quarter of the month. Phone and desktop alone (the old rule for MRs into
`staging`) are 2,428 of the 4,466 passing tests, about 48 minutes, so **about 50 minutes per MR**: eight MRs a month.
Tonight's 20 worker MRs alone would need 1,000 minutes. **Browser tests can't run on GitLab's runners for every MR.**
(!15 estimated 35 minutes per MR; the measured figure is higher.)

### The plan

| Check | Where it runs | When | Billed minutes |
| --- | --- | --- | ---: |
| **fast**: sample-content check, type check, build, unit tests | GitLab runner | Every MR into `staging` or `main` that is not a draft; Markdown-only MRs into `staging` skip it | about 2–3 |
| **secrets (changes only)**: gitleaks on the MR's own commits | GitLab runner | Same MRs | under 1 (estimate) |
| **weekly**: gitleaks over the whole history, Semgrep, `npm audit` | GitLab runner | Monday schedule, and MRs into `main` | about 4 (estimate) |
| **browsers, release**: every Playwright project, Chromium, WebKit and Firefox | **Christian's Mac** (runner tagged `cueory-mac`) | Automatically on MRs into `main` | 0 |
| **browsers, staging**: phone and desktop | Christian's Mac | A **play button** on MRs into `staging` (optional; doesn't block if the Mac is off) | 0 |
| Browser specs for each worker MR | Claude's reviewer sandbox, before its "Verified by Claude" note | Every worker MR | 0 |

Estimated month: about 3 minutes × 100 MR updates + 4 × 4 weekly runs + 4 release MRs × 7 ≈ **345 of 400**. If the
month gets tight, Claude batches commits (one `add_commit` per change) and marks MRs ready only when they are finished.

If the Mac is off on release day, the release browser job waits. The fallback is to run it once on GitLab's runners:
about 91 minutes for Chromium plus an unmeasured amount for WebKit and Firefox, so at most about two of those a month.

**This changes one rule.** CLAUDE.md says browser tests run in Chromium on every pull request. Under this plan they run
on every MR in Claude's sandbox (recorded in the MR note), and on GitLab only for release MRs. It needs Christian's
written OK (proposed wording in the proposals file).

### Christian's Mac as a runner: disk and safety

GitLab supports a runner on macOS with the shell executor, run as a normal (not admin) user that starts at sign-in
([GitLab: install on macOS][gl-runner-mac]). Registering it as a **project runner** keeps it to `cueory1/cueory`
([GitLab: project runners][gl-runner-project]).

Disk, estimated from this project's sizes (to be checked with real numbers after the first run):

| Part | Size |
| --- | ---: |
| Runner program | about 0.1 GB |
| One working copy of the code (the history is about 75 MB) | about 0.1 GB |
| `node_modules` (measured 718 MB) | about 0.7 GB |
| npm download cache | about 0.4 GB |
| Playwright's Chromium, WebKit and Firefox | about 1 GB |
| Build output and test reports | under 0.1 GB |
| **Total** | **about 2.5 GB; cap at 3 GB** |

How to keep it at that size: one job at a time (`concurrent = 1`), one working folder reused every run, test reports
kept only when a test fails and only for 7 days, and the weekly job reports the folder's size. If the Mac has less than
5 GB free, don't install it: use the fallback above.

Safety: the runner runs the branch's code on the Mac. So (1) install it under a **separate, non-admin macOS user**
(for example "cueory-runner") so jobs can't read Christian's own files, (2) automatic runs only for release MRs, whose
code is already reviewed on `staging`, and (3) staging runs only when someone presses play after Claude's review.

### What to do with !10, !15 and !9

| MR | What it is | Verdict |
| --- | --- | --- |
| !10 (worker) | `.gitlab-ci.yml` with checks plus all four Chromium projects in four parts. **Ran green on GitLab** (4,466 passed, 0 failed) | Close after Christian approves this plan. Its run gave the real timings above. It only runs for MRs into `legacy/staging` and hard-codes the project number, so it can't be used as is, and its 91 minutes per MR is far over budget |
| !15 (Claude) | `.gitlab-ci.yml` plus `docs/CI-GITLAB.md`: drafts skipped, Markdown-only skip, WebKit and Firefox on `main`, gitleaks, Semgrep, cancel on first failure | **Use as the base.** Change it to: move both browser jobs to the `cueory-mac` runner (release automatic, staging manual); gitleaks on the MR's commits only, full history weekly; Semgrep on `main` MRs and weekly, without the `p/github-actions` rules (no GitHub workflows run now); add a weekly schedule with `npm audit`; set `CUEORY_LEGAL_RELEASE_AUDIT=1` on MRs into `main` so the legal gate runs; replace its minute estimates with the measured ones |
| !9 (worker) | Rewrites AGENTS.md, CLAUDE.md and CONTRIBUTING.md to point at `legacy/staging` | **Close.** The branch map is wrong now. Its good points (imported GitHub checks prove nothing on GitLab; `.gitlab-ci.yml` is a sensitive file) are in the proposals file |

### Order of work after Christian says yes

1. Claude updates !15 as described and marks it ready. Christian approves and merges it (workflow file).
2. Christian turns on two settings (steps in section 5).
3. Claude opens one docs MR with the approved rules-file text and the doc updates listed in section 1.
4. Christian sets up the Mac runner (section 5) or decides to skip it.
5. Later, separate approvals: the database test job, the backup schedule, and a cleanup MR that moves the six GitHub
   unit tests to `.gitlab-ci.yml` and removes `.github/` and `scripts/automerge/`.

## 3. Replacements for GitHub's security tools (GitLab Free)

| GitHub tool | GitLab Free option | Recommendation |
| --- | --- | --- |
| Secret scanning + push protection | Push protection is Ultimate only ([docs][gl-push-protection]). Pipeline secret detection is on every tier but only gives a downloadable report on Free, and by default checks only new commits ([docs][gl-secret-pipeline]) | **gitleaks** in CI (fails the pipeline), on each MR's commits and weekly on the full history. Skip GitLab's template; it would spend minutes twice |
| CodeQL | GitLab SAST is on every tier; on Free it uses open-source analyzers (Semgrep-based for JavaScript and TypeScript) and gives a JSON report, with no MR findings ([docs][gl-sast]) | **Semgrep Community Edition** with `--error`, as before, so a finding fails the run. On MRs into `main` and weekly |
| Dependabot alerts | Dependency scanning is Ultimate only ([docs][gl-depscan]) | Weekly **`npm audit`** job; a high or critical finding fails it, and GitLab emails the pipeline failure |
| Dependabot update PRs | Renovate: Mend's hosted app needs a paid GitLab account ([Mend docs][mend-gitlab]); running it yourself needs a token with `api` scope ([Renovate docs][renovate-gitlab]), and project access tokens need Premium on GitLab.com ([docs][gl-pat]) | **A monthly dependency MR by Claude** (`npm outdated`, small groups, full checks). Renovate would need a personal token with full API access stored in CI, which is more risk than it is worth for one project |
| Code owner approval | Premium only ([docs][gl-codeowners]) | Branch protection on `main` (only Christian merges) plus the `needs-christian` label |

## 4. Cloudflare facts

- With Workers Builds, previews are all or nothing: one checkbox, **Enable Preview Builds** (Settings → Build → Branch
  control). When it is on, every push to any branch other than the production branch builds a preview. There is no
  branch filter ([Cloudflare: build branches][cf-branches]). Previews are locked by Cloudflare Access (Christian
  checked this).
- Free plan: **3,000 build minutes a month, one build at a time, 20-minute limit per build**
  ([Cloudflare: limits][cf-limits]). Tonight's preview builds took about 40–90 seconds each; about 70 ran in seven
  hours. Because only one build runs at a time, a busy night queues them (one `staging` build waited almost an hour).
  Fewer pushes is the fix: one `add_commit` per change, not one per file.
- The production branch is `legacy/main`. When the live site moves to GitLab `main`, change it in the same Branch
  control screen and re-check the legal gate (section 1).

## 5. Steps only Christian can do (when he approves)

**A. Check this month's minutes now.** GitLab also ran about 30 "duo_workflow" jobs tonight on its own runners (about
1–2 minutes each). GitLab's docs don't say whether those count against the 400 minutes.

1. Open gitlab.com and go to the `cueory1` group (if `cueory1` is your personal account: your avatar → **Edit
   profile**).
2. Select **Settings** → **Usage quotas**.
3. Select the **Pipelines** tab. You should see minutes used this month out of 400. !10's two full runs probably used
   about 180 between them (one was timed at 91).

**B. Two project settings** (after !15 is merged), exactly as written in `docs/CI-GITLAB.md` on !15: tick **Auto-cancel
redundant pipelines** (Settings → CI/CD → General pipelines), and tick **Pipelines must succeed** (Settings → Merge
requests → Merge checks).

**C. The Mac runner** (optional; Claude can do steps 4–6 for you through the connected-computer tool if you allow it).

1. Check free disk: Apple menu → **System Settings** → **General** → **Storage**. You need at least 5 GB free.
2. Add a user: **System Settings** → **Users & Groups** → **Add User**, type **Standard**, name "cueory-runner".
3. In GitLab open `cueory1/cueory` → **Settings** → **CI/CD** → expand **Runners** → **Create project runner**. Choose
   **macOS**, type the tag `cueory-mac`, leave **Run untagged** unticked, select **Create runner**. Keep the page open:
   the token shows only once.
4. Sign in as "cueory-runner" and install the runner with the commands on that GitLab page (shell executor).
5. Install Node 24 and the Playwright browsers for that user.
6. Back in GitLab → **Settings** → **CI/CD** → **Runners**, edit the runner and tick **Lock to current projects**. You
   should see it with a green dot when the Mac is on.

[gl-minutes]: https://docs.gitlab.com/ci/pipelines/compute_minutes/
[gl-quota]: https://docs.gitlab.com/ci/pipelines/instance_runner_compute_minutes/
[gl-runner-mac]: https://docs.gitlab.com/runner/install/osx/
[gl-runner-project]: https://docs.gitlab.com/ci/runners/runners_scope/
[gl-push-protection]: https://docs.gitlab.com/user/application_security/secret_detection/secret_push_protection/
[gl-secret-pipeline]: https://docs.gitlab.com/user/application_security/secret_detection/pipeline/
[gl-sast]: https://docs.gitlab.com/user/application_security/sast/
[gl-depscan]: https://docs.gitlab.com/user/application_security/dependency_scanning/
[gl-codeowners]: https://docs.gitlab.com/user/project/codeowners/
[gl-pat]: https://docs.gitlab.com/user/project/settings/project_access_tokens/
[renovate-gitlab]: https://docs.renovatebot.com/modules/platform/gitlab
[mend-gitlab]: https://docs.mend.io/integrations/latest/install-mend-developer-platform-for-gitlab-com
[cf-branches]: https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
[cf-limits]: https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/
[p-10]: https://gitlab.com/cueory1/cueory/-/pipelines/3055831133
