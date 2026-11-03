# Task 249: keep noindex pages out of Pagefind

## Scope

Touched only `tests/unit/build-output.test.ts` and this status note. The regression reads the generated Pagefind manifest after `npm run build` and checks that its page count matches the built pages marked for search, with no preview or noindex pages included.

## Validation

- `npm run build` passed on the latest `origin/staging`.
- Existing built output contains 15 searchable pages and no preview pages in the generated Pagefind index.
- Focused Vitest validation and the full required checks are pending.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.
