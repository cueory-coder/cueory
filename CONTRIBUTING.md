# Contributing to Cueory

Cueory uses small GitLab merge requests in `cueory1/cueory` that target `legacy/staging`. Keep each merge request
focused. Agents do not merge requests or enable auto-merge.

## Current repositories and branches

- `legacy/staging` contains the newest games and site code and is the source for feature branches.
- `legacy/main` preserves the old live-site source. `legacy/anatomy-lab` preserves Task 178.
- Do not directly commit to, force-push, rewrite or delete `main` or any `legacy/*` branch.
- Read design work in `cueory1/cueory-design`, branch `task-0/design-notes`, at
  `docs/handoff/CODEX-WORKER-BRIEFS.md` and the relevant files in `renderings/`.
- Check current branch and merge-request ownership before starting. Preserve other workers' changes.

These are Christian's GitLab instructions from November 11, 2026. Older references to `staging`, GitHub automatic
merging or deployment are historical and do not grant merge or deployment authority.

## Before you start

1. Install the Node version listed in `.node-version`.
2. Install the locked dependencies:

   ```sh
   npm ci
   ```

3. Create a branch from the current `legacy/staging` head using the `task-N/short-description` naming pattern.

Do not commit secrets, private student data, real question-bank content, answer keys, or unreleased lessons. Keep study content in the approved content or data paths, and do not invent clinical facts. Read `AGENTS.md`, `CLAUDE.md`, and `SECURITY.md` before changing the project.

## Local commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Astro development server. |
| `npm run check` | Run Astro's type and project checks. |
| `npm run build` | Build the static site and its Pagefind search index. |
| `npm test` | Run the unit test suite once. |
| `npm run test:e2e` | Run the Playwright browser tests. |
| `npm run verify` | Run checks, the build, unit tests, and browser tests in order. |
| `npm run check-batch -- content/batches/<folder>` | Validate one content batch before import. |
| `npm run preview` | Preview the built site locally. Run `npm run build` first. |

Run `npm run verify` before opening a merge request. If a browser is unavailable locally, record that limitation
and do not claim the browser tests passed. Check CI against the current source head. Imported GitHub workflow
files and historical results are not evidence of a passing GitLab pipeline.

## Merge requests

1. Keep the change limited to one task.
2. Add tests for changed behavior when the task calls for them.
3. Add one status note at `docs/status/in-review/<branch-name-with-dashes>.md` with a plain-English `status:` line.
4. Open the merge request with `legacy/staging` as its target branch.
5. Include the checks you ran and any environment limitations in the merge request description.
6. Leave the request for Christian to review and merge. Do not merge it or enable auto-merge.

Changes to authentication, accounts, databases, policies, payments, workflows, deployment settings, security headers, DNS, or secrets need Christian's approval. Never edit `docs/STATUS.md` or `docs/DECISIONS.md` in a feature pull request.

Workflow changes include GitLab CI/CD configuration such as `.gitlab-ci.yml`. Feature work does not authorize
deployments, hosted database changes, DNS changes or paid services.

## Content batches

Content batch files must be checked before they are imported. The checker accepts a batch directory:

```sh
npm run check-batch -- content/batches/<folder>
```

Read `docs/BATCHES.md` for the complete review and import process. Do not put private questions, answer keys, rationales, or student data in this public repository.

Draft 4 curriculum data, its validator and the legacy crosswalk were proposed in separate pull requests. Until those
changes are verified in `legacy/staging`, do not assume `content/curriculum/blocks-v4.csv`,
`docs/curriculum/CROSSWALK.md` or `scripts/check-curriculum.mjs` is available. The historical lesson map remains in
`docs/curriculum/`.

Cueory does not accept outside pull requests. To report a security or privacy problem, use GitHub's private **Report a vulnerability** form or the address documented in `SECURITY.md`, rather than opening a public issue.
