# Task 256: unknown study routes return 404

## Scope

Touched only `tests/e2e/404.spec.ts` and this status note. The regression checks that unknown study paths return HTTP 404 and render the existing branded 404 page with noindex metadata.

## Validation

- `npm run check` passed with 0 errors and 12 existing hints.
- `npm run build` passed with 33 pages built.
- `npm test` passed: 3,547 tests in 118 files.
- Focused Playwright execution was attempted, but all 5 phone cases were blocked before navigation because Chromium headless shell 1248 is unavailable in this environment. CI must run the changed spec.
- `git diff --check` passed.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.
