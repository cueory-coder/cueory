# Testing

This guide explains the checks used by Cueory and when to run each one. The commands below assume Node 24, as pinned in `.node-version`.

## Before starting

Install the locked dependencies once:

```sh
npm ci
```

Run the full check before opening a pull request:

```sh
npm run verify
```

## Checks by purpose

| Command | What it checks |
| --- | --- |
| `npm run check` | Astro type checking and diagnostics |
| `npm run build` | Production build and Pagefind search index |
| `npm test` | Vitest unit tests in `tests/unit/**/*.test.ts` |
| `npm run test:e2e` | Playwright browser and accessibility tests in `tests/e2e` |
| `npm run check-batch` | Content batch validation using the files passed to the script |
| `npm run verify` | `check`, `build`, `test`, and `test:e2e` in that order |

The browser suite builds first because Playwright serves the generated `dist/` directory. It tests four Chromium profiles: phone, evening phone, tablet, and desktop.

## Focused checks

Run one unit test file:

```sh
npx vitest run tests/unit/example.test.ts
```

Run one Playwright file:

```sh
npx playwright test tests/e2e/example.spec.ts
```

List browser tests without running them:

```sh
npx playwright test --list
```

Replace the example paths with the test file you want to inspect. Use `--grep "text"` when a test title is easier to target than a file.

## Build and browser test flow

If you are running Playwright directly, build first:

```sh
npm run build
npm run test:e2e
```

The Playwright configuration starts Astro Preview on port 4322 and uses the generated `dist/` folder. The local browser suite may need the Playwright Chromium executable installed in the environment. CI provides the browser used by the pull request checks.

## Pull request checklist

Before requesting review:

- Run `npm run verify`.
- Confirm the pull request targets `staging`.
- Report any check that could not run and why.
- Include focused commands when the change has a narrow test.
- Do not put real questions, answer keys, personal data, or secrets in fixtures or test output.

For the project rules and sensitive areas, read [AGENTS.md](../AGENTS.md), [CLAUDE.md](../CLAUDE.md), and [SECURITY.md](../SECURITY.md).
