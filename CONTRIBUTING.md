# Contributing to Cueory

Cueory is a public repository for Christian's study site. Read [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md), and [SECURITY.md](SECURITY.md) before making a change.

## Before you start

- Keep changes small and focused on one topic.
- Start a branch from the latest `staging` branch.
- Do not add secrets, personal data, real questions, answer keys, rationales, or unreleased lessons.
- Do not change authentication, database policies, payments, deployment settings, workflows, security headers, or DNS without Christian's approval.
- Keep lessons, cards, questions, puzzles, and other study content in the approved content or data paths. Do not invent clinical facts.
- Add a status note at `docs/status/in-review/<branch-name-with-dashes>.md`. Do not edit `docs/STATUS.md` or `docs/DECISIONS.md` in a feature pull request.

## Install and run locally

The project requires Node 24. Install the locked dependencies, then start the development server:

```sh
npm ci
npm run dev
```

For a production-style local preview, build first and then run the preview server:

```sh
npm run build
npm run preview
```

## Validate a change

Run the checks that match the files you changed. Before opening a pull request, run the full verification command when the environment supports the browser suite:

```sh
npm run check
npm run build
npm test
npm run test:e2e
npm run verify
```

`npm run verify` runs the type check, build, unit tests, and browser tests together. If browser executables are unavailable, report that limitation in the pull request and do not claim that the browser tests passed.

## Open a pull request

Open one small pull request targeting `staging`. Describe what changed, list the validation commands and their results, and mention any validation that was blocked. Never merge a pull request into `main` yourself.

Cueory does not accept outside pull requests. To report a security or privacy problem, use GitHub's private **Report a vulnerability** form or the address documented in [SECURITY.md](SECURITY.md), rather than opening a public issue.
