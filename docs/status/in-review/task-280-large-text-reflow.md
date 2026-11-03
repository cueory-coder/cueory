# Task 280: large-text reflow

## Scope

Touched only `tests/e2e/large-text-reflow.spec.ts` and this status note. The new sweep sets the root font size to 32px on every built route, then checks for horizontal overflow and visible controls extending beyond the viewport.

## Validation

- `npm run check` passed with 0 errors and 12 existing hints.
- `npm run build` passed with 33 pages built.
- `npm test` passed: 3,547 tests in 118 files.
- Focused Playwright execution was attempted across all 33 phone routes, but every case was blocked before navigation because Chromium headless shell 1248 is unavailable in this environment. CI must run the changed spec.
- `git diff --check` passed.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.
