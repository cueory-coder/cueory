# Testing Cueory

Use the Node version in [`.node-version`](../.node-version), then install the locked dependencies:

```sh
npm ci
```

## Local checks

| Command | What it runs |
| --- | --- |
| `npm run check` | Astro's type and template checks. |
| `npm run build` | Astro's production build, followed by the Pagefind index for `dist/`. |
| `npm test` | Vitest, once, for `tests/unit/**/*.test.ts`. |
| `npm run test:e2e` | Playwright browser tests in `tests/e2e/`. Build first. |
| `npm run verify` | Check, build, unit tests and browser tests, in that order. Stops if a command fails. |

The unit suite covers application logic and repository/build-output contracts. Build before running the complete suite because some tests inspect `dist/`. The browser suite exercises rendered pages, interactions, accessibility and offline behavior. Test names and assertions are the source for each feature's coverage, rather than a guarantee that every behavior is covered.

Run a focused test while working:

```sh
npm test -- tests/unit/exportdata.test.ts
npm run build
npm run test:e2e -- tests/e2e/footer-theme.spec.ts --project=desktop
```

Install Chromium before the first browser run:

```sh
npx playwright install --with-deps chromium
npm run verify
```

## Browser projects

[`playwright.config.ts`](../playwright.config.ts) normally enables Chromium projects `phone` (390 × 844), `phone-evening` (the same viewport in dark mode), `tablet` (820 × 1180) and `desktop` (1440 × 900). Setting `ALL_ENGINES=1` also enables `webkit-phone`, `webkit-desktop` and `firefox-desktop`. Install those engines before selecting them.

Playwright starts Astro preview on port 4322 and serves the already-built `dist/`. It can reuse an existing server outside CI. Service workers are blocked by default so request mocks can intercept requests. The offline spec enables them for its own tests. Failed tests retain traces. CI retries once, rejects focused `.only` tests and uses the GitHub reporter. Local runs use the list reporter without retries.

## CI and security checks

The source of truth is [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Ready pull requests and pushes to `main` run CI. The verification job runs install, check, build, unit tests and Chromium browser tests. Pull requests into `staging` select phone and desktop. Other verification runs use the normal Chromium project list. Release pull requests into `main` add separate WebKit phone/desktop and Firefox desktop jobs.

Markdown-only pull requests outside `content/` and `src/` skip the verification job's install/build/test steps. This is a CI optimization, not evidence that tests ran. Secret scanning with gitleaks and Semgrep security scanning are separate jobs. On browser failure, CI uploads `test-results/` for seven days. Report failures and unavailable browser execution accurately rather than calling them passes.

## Content batch checks

`npm run check-batch -- <folder>` checks a private review batch. Follow [BATCHES.md](BATCHES.md) for its format and results. Keep real questions, answer keys and reviewer files outside the public repository. The import command writes content and is not part of `npm run verify`.

For a preview after building, use `npm run preview`. For development, use `npm run dev`. Neither command runs the test suites.

Sources: [`package.json`](../package.json), [`vitest.config.ts`](../vitest.config.ts), [`playwright.config.ts`](../playwright.config.ts) and the CI workflow linked above.
