status: Task 629, GitLab application verification: adds same-project merge-request checks for legacy/staging, with type checking, build, unit tests, sample-content validation, and four Chromium browser shards. Needs Christian's approval for the CI workflow.

## Why this change

The migrated application at `legacy/staging` commit
`6b5ae956984672953716f537ff10f371c40afe61` contains GitHub Actions workflows but no
`.gitlab-ci.yml`. The GitLab project has no custom CI configuration path and Auto
DevOps is disabled. Existing pipeline results on the separate site-foundation
branch do not validate this application.

## Behavior

- Runs only for ready, same-project merge requests targeting `legacy/staging`.
  Draft merge requests wait until ready, preserving the existing resource-use policy.
- Explicitly checks the execution, source, and target project IDs against
  `cueory1/cueory` (`88789754`). All other events are excluded.
- Uses official `node:24.22.2-bookworm`, matching `.node-version`, and rejects a
  future mismatch between the image and the pin.
- Installs from `package-lock.json` with `npm ci`. Only npm downloads are cached.
  The checks job writes the cache. Browser shards only read it.
- Runs sample-content validation, Astro type checking, the normal build, and all
  unit tests. Then four shards run all configured Chromium projects: phone,
  phone-evening, tablet, and desktop. Playwright performs its existing anatomy
  fixture build in each shard.
- Uses line and JUnit browser reports instead of the GitHub-only CI reporter.
  Project names are included in test names, and each shard has its own artifact
  name. Reports and failure traces expire after seven days.
- Superseded verification jobs are interruptible. No deployment, database write,
  merge, or service-credential setup is added.

## Local verification

- Reconstructed an isolated snapshot and verified all 882 tracked file hashes
  against the GitLab base before changing either file.
- Local Node: `24.22.1`, within `package.json`'s supported range but one patch below
  the repository pin. GitLab uses the exact `24.22.2` pin.
- Existing dependencies from a trusted local checkout were copied into the
  isolated snapshot. `npm ls --depth=0` confirms all declared packages are present.
  A fresh runner `npm ci` remains part of GitLab validation.
- `npm run check-sample-content`: passed.
- `npm run verify`: type checking passed with 0 errors and 26 hints, build passed,
  and unit tests passed: 200 files, 5,259 tests passed, 3 skipped.
- Browser verification is **not passed**. The run was stopped after repeated
  browser-launch failures because Playwright's Chromium 1248 executable is absent.
  `npx playwright install chromium` also failed because the downloaded archive
  was invalid. No browser assertion was weakened or skipped to hide this blocker.
- YAML parsing, eight shell-fragment syntax checks, and 20 local workflow-policy
  cases passed. The cases cover permitted staging work, drafts, foreign/missing
  project IDs, wrong targets, and non-MR pipeline sources. This is local validation,
  not GitLab CI Lint.
- Independent review found no material defect in the configuration.
- GitLab pipeline validation is pending on this merge request.

## Rollout limits and follow-ups

This is application verification only. It does not migrate gitleaks, Semgrep,
CodeQL, database tests, backups, deployment, or production legal-release gates.
Those remain separate migration work. Main-target pipelines are deliberately
excluded because the legal prebuild currently recognizes GitHub and Workers
release variables, not GitLab release events.

The project currently does not require a successful pipeline before merge.
Changing that setting needs a separate owner-reviewed action. Normal MR pipelines
test source-branch contents, not the merged result. Existing game branches need
this configuration and fresh passing results after Christian accepts it.
The YAML project checks do not replace GitLab's permissions or an immutable
fork-pipeline restriction. Do not trigger parent-project builds of fork code.

## Primary references

- [GitLab merge request pipelines](https://docs.gitlab.com/ci/pipelines/merge_request_pipelines/)
- [GitLab workflow rules](https://docs.gitlab.com/ci/yaml/workflow/)
- [GitLab predefined variables](https://docs.gitlab.com/ci/variables/predefined_variables/)
- [GitLab CI YAML reference](https://docs.gitlab.com/ci/yaml/)
- [Official Node image tags](https://hub.docker.com/_/node/)
- [Playwright JUnit reporter](https://playwright.dev/docs/test-reporters#junit-reporter)
