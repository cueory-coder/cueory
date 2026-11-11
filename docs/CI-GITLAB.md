# Automatic checks on GitLab (Task 631)

The code moved from GitHub to GitLab (`cueory1/cueory`, private). GitLab runs the automatic checks from one file,
`.gitlab-ci.yml`. This page explains what runs, what it costs, and the settings you need to click once.

## What runs, and when

| When | What runs | About how long (billed minutes) |
| --- | --- | --- |
| A merge request into `staging` (not a draft) | Type check, build and unit tests; then the browser tests in Chrome's engine at phone and desktop size; a secret scan and a code security scan run alongside | about 35 (30 to 45) |
| A merge request into `staging` that only changes Markdown notes outside `content/` and `src/` | The quick check notices it and skips the build and browser tests; the two scans still run | about 5 |
| A Release merge request into `main` | Everything above, browser tests at every size, plus Safari's engine and Firefox | about 140 (120 to 170) |
| A merge into `staging` | Secret scan only | about 1 |
| A merge into `main` | Secret scan and code security scan | about 3 |
| A draft merge request | Nothing, until it is marked ready | 0 |

What each check is:

- **verify-fast**: the same type check, build and unit tests as `npm run verify`, on the Node version in
  `.node-version`.
- **e2e-chromium**: the browser tests (Playwright) in Chrome's engine.
- **e2e-engines**: the same tests in Safari's engine and Firefox, only for Release merge requests into `main` (D-48).
- **secrets-scan**: gitleaks looks through the whole history for passwords or keys that should never be there.
- **semgrep**: looks through the code for common security mistakes.

If any check fails, GitLab stops the rest of that run, so a broken change doesn't keep using minutes. If a new commit
is pushed to the same merge request, the older run is cancelled (once setting 1 below is on).

The browser-test times are estimates: the GitHub runs that D-135 describes took about 15 minutes on a machine twice
this size. The first real runs will show the true numbers, and this page should be updated then.

## What it costs

$0. GitLab Free includes **400 compute minutes a month** for the whole `cueory1` account, and the standard machine
uses 1 minute per minute of work ([GitLab: compute minutes](https://docs.gitlab.com/ci/pipelines/compute_minutes/);
[GitLab: hosted Linux runners](https://docs.gitlab.com/ci/runners/hosted_runners/linux/)). The count starts again at
0 on the first day of every month. Nothing is charged automatically: when the minutes are used up, GitLab simply stops
running checks until the next month
([GitLab: compute quota](https://docs.gitlab.com/ci/pipelines/instance_runner_compute_minutes/)).

**The honest catch:** at about 35 minutes each, 400 minutes is roughly **10 ordinary merge requests a month**, and one
Release merge request uses about a third of the month. On GitHub the helpers ran CI about 80 times in six hours
(D-74). See "If the minutes run out" below.

To see how many minutes are left (you get an email at 25% and 5% left):

1. Open GitLab and go to the `cueory1` group (or, if `cueory1` is your personal account, your avatar → **Edit
   profile**).
2. Select **Settings** → **Usage quotas**.
3. Select the **Pipelines** tab. You should see the minutes used this month out of 400.

## Settings to click once

You need the Owner or Maintainer role (you have it). Each step is one click or one choice.

### 1. Cancel old runs when a newer commit arrives

1. Open the project `cueory1/cueory`.
2. In the left sidebar, select **Settings** → **CI/CD**.
3. Expand **General pipelines**.
4. Tick **Auto-cancel redundant pipelines**.
5. Leave **Timeout** at 60 minutes (each check sets its own shorter limit in the file).
6. Select **Save changes**.

Source: [GitLab: pipeline settings](https://docs.gitlab.com/ci/pipelines/settings/).

### 2. Block merging until the checks pass

1. In the left sidebar, select **Settings** → **Merge requests**.
2. Scroll to **Merge checks**.
3. Tick **Pipelines must succeed**.
4. Leave **Skipped pipelines are considered successful** unticked.
5. Select **Save changes**.

You should now see "Pipelines must succeed" ticked. A merge request with no run at all can't merge, so a draft that
is marked ready needs one run first: open the merge request, select the **Pipelines** tab, then **Run pipeline**.
Source: [GitLab: auto-merge and merge checks](https://docs.gitlab.com/user/project/merge_requests/auto_merge/),
[GitLab: merge request pipelines](https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/).

### 3. Protect `main` and `staging`

`main` is GitLab's default branch, so it is already protected, and `staging` already shows as protected. Check both:

1. In the left sidebar, select **Settings** → **Repository**.
2. Expand **Branch rules**.
3. Select `main`. Under **Allowed to merge**, it should say **Maintainers**. Under **Allowed to push and merge**, select
   **Edit** and choose **No one**, then save. **Allowed to force push** should be off.
4. Go back and select `staging`. Make the same three choices.
5. If `staging` is not listed, select **Add branch rule** → **Branch name or pattern**, type `staging`, select
   **Create branch rule**, then make the same three choices.

Source: [GitLab: protected branches](https://docs.gitlab.com/user/project/repository/branches/protected/).

### Nothing to turn on for GitLab's own secret checks

- **Secret push protection** (blocking a push that contains a key) is an **Ultimate** (paid) feature, so it isn't
  available on Free ([GitLab: secret push protection](https://docs.gitlab.com/user/application_security/secret_detection/secret_push_protection/)).
- **Pipeline secret detection** works on Free, but on Free it only produces a downloadable report
  ([GitLab: pipeline secret detection](https://docs.gitlab.com/user/application_security/secret_detection/pipeline/)).
  The gitleaks check already does this job and fails the run when it finds something, so adding GitLab's would spend
  minutes twice. It is left off.
- **Code owner approval** is a Premium feature, so GitLab Free can't require your approval on specific files. The
  protection is the branch rules above plus "only you merge into `main`".

## What is not on GitLab yet

- **Staging auto-merge (D-39)** and the hourly sweep were GitHub-only (`.github/workflows/staging-automerge.yml`).
  Merge requests into `staging` wait for a person to merge them until a GitLab version is built and approved.
- **The database and backup workflows** (`.github/workflows/database.yml`, `prod-backup.yml`) and **CodeQL** are not
  moved. `.github/` stays in the repository as history; GitLab ignores it.

## If the minutes run out

These keep the cost at $0. Each needs your decision (D-pending in the status note):

1. **Use your own computer as a runner.** GitLab doesn't count minutes on runners you register yourself
   ([GitLab: compute quota](https://docs.gitlab.com/ci/pipelines/instance_runner_compute_minutes/)). This needs a
   one-time setup on a machine that is on when checks run, which could be your Mac or a free cloud machine.
2. **Run the browser tests only on Release merge requests into `main`**, with helpers running `npm run verify` on their
   own machine before every merge request. This changes the rule in CLAUDE.md that browser tests run on every pull
   request, so it needs your written OK.
3. **Batch work** into fewer, larger merge requests into `staging`.

Making the project public does not help on GitLab the way it did on GitHub: the lower cost applies only to projects
accepted into the GitLab for Open Source program
([GitLab: compute minutes](https://docs.gitlab.com/ci/pipelines/compute_minutes/)), and Cueory's license keeps all
rights.
