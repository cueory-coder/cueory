# Task 286: validate built control names

## Scope

Touched only `tests/unit/accessibility-names.test.ts` and this status note. The test checks every built link and button has visible text, an `aria-label`, or valid `aria-labelledby` references.

## Validation

- Addressed Codex review finding: resolved referenced elements (`aria-labelledby`) and verified their naming content, rejecting empty referenced elements and checking referenced labels via `computeAccessibleName`.
- Added negative fixtures for empty referenced elements and controls containing only hidden text.
- `tests/unit/accessibility-names.test.ts` passed (4/4 tests).
- All built pages verified against `computeAccessibleName`.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.
