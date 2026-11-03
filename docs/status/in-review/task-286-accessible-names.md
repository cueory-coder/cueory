# Task 286: validate built control names

## Scope

Touched only `tests/unit/accessibility-names.test.ts` and this status note. The test checks every built link and button has visible text, an `aria-label`, or valid `aria-labelledby` references.

## Validation

- `npm run check` passed with 0 errors and 12 existing hints.
- `npm run build` passed with 33 pages built.
- `npm test -- --run tests/unit/accessibility-names.test.ts` passed: 1 test.
- `npm test` passed: 3,548 tests in 119 files.
- `git diff --check` passed.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.
