# Task 249: keep noindex pages out of Pagefind

## Scope

Touched only `tests/unit/build-output.test.ts` and this status note. The regression reads the generated Pagefind manifest after `npm run build` and checks that its page count matches the built pages marked for search, with no preview or noindex pages included.

## Validation

- `npm run check` passed with 0 errors and 12 existing hints.
- `npm run build` passed and generated 15 searchable pages.
- `npm test -- --run tests/unit/build-output.test.ts` passed: 151 tests.
- `npm test` passed: 3,548 tests in 118 files.
- `git diff --check` passed.
- No browser spec was added or changed.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.