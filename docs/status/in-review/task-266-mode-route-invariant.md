# Task 266: validate study mode destinations

## Scope

Touched only `tests/unit/modes-routes.test.ts` and this status note. The test checks every currently open mode in `src/config/modes.ts` against the static route produced in `dist/` after a build.

## Validation

- `npm run check` passed with 0 errors and 12 existing hints.
- `npm run build` passed with 33 pages built.
- `npm test -- --run tests/unit/modes-routes.test.ts` passed: 1 test.
- `npm test` passed: 3,548 tests in 119 files.
- `git diff --check` passed.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.
