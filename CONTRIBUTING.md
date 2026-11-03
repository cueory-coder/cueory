# Contributing to Cueory

Cueory uses small pull requests that target `staging` first. Please keep each pull request focused and do not merge it yourself.

## Before you start

1. Install the Node version listed in `.node-version`.
2. Install the locked dependencies:

   ```sh
   npm ci
   ```

3. Create a branch from `staging` using the `task-N/short-description` naming pattern.

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
| `npm run preview` | Preview the built site locally. Run `npm run build` first. |

Run `npm run verify` before opening a pull request. If a browser is unavailable locally, record that limitation and do not claim the browser tests passed.

## Pull requests

1. Keep the change limited to one task.
2. Add tests for changed behavior when the task calls for them.
3. Add one status note at `docs/status/in-review/<branch-name-with-dashes>.md` with a plain-English `status:` line.
4. Open the pull request with `staging` as its base branch.
5. Include the checks you ran and any environment limitations in the pull request description.

Changes to authentication, accounts, databases, policies, payments, workflows, deployment settings, security headers, DNS, or secrets need Christian's approval. Never edit `docs/STATUS.md` or `docs/DECISIONS.md` in a feature pull request.

## Content batches

Content batch files must be checked before they are imported. The checker accepts a batch directory:

```sh
npm run check-batch -- content/batches/<folder>
```

Read `docs/BATCHES.md` for the complete review and import process. Do not put private questions, answer keys, rationales, or student data in this public repository.

Cueory does not accept outside pull requests. To report a security or privacy problem, use GitHub's private **Report a vulnerability** form or the address documented in `SECURITY.md`, rather than opening a public issue.
