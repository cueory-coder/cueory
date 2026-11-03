# Task 209: main-content tap-target sweep

Adds a route-wide Playwright regression test for visible links and buttons in `main`. Inline prose links remain exempt, while visual link controls and every button must measure at least 44 by 44 CSS pixels at the configured phone viewport.

The test discovers built routes, includes the generated 404 response, waits for Astro islands to hydrate, and reports the route and measured control when a target is too small. It does not change application behavior or styling.

Validation on the publishing environment:

- `npm run check` passed with 0 errors, 0 warnings, and 11 existing hints.
- `npm run build` passed with 31 pages built.
- `npm test` passed: 3,297 tests in 108 files.
- `npx playwright test tests/e2e/tap-targets.spec.ts --project=desktop` was attempted, but browser launch was blocked before navigation because Chromium headless shell 1248 is not installed. Browser CI remains required.

Target: `staging`. Do not merge.
