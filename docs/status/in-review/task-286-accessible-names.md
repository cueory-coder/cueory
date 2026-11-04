# Task 286: validate built control names

status: Task 286, validate built control names: enforces visible text, aria-label, or valid aria-labelledby naming on all built links and buttons, excluding hidden descendants and checking referenced label content.

## Scope

Touched only `tests/unit/accessibility-names.test.ts` and this status note. The test checks every built link and button has visible text, an `aria-label`, or valid `aria-labelledby` references.

## Validation

- Addressed Codex review finding: resolved referenced elements (`aria-labelledby`) and verified their naming content, rejecting empty referenced elements and checking referenced labels via `computeAccessibleName`.
- Added negative fixtures for empty referenced elements and controls containing only hidden text.
- `tests/unit/accessibility-names.test.ts` passed (4/4 tests).
- All built pages verified against `computeAccessibleName`.

No sensitive files, application behavior, dependencies, workflows, deployment settings, auth, accounts, database, legal text, or content were changed.

## Focused review repair — exact attribute boundaries

- The static name parser previously treated `data-aria-label` and `data-aria-labelledby` as real ARIA naming attributes because its matcher accepted a word boundary after a hyphen. It could therefore pass an unnamed link or button.
- The existing PR now requires a real attribute boundary and avoids treating `data-aria-hidden` as `aria-hidden`. New synthetic tests cover these false positives, real ARIA names, and the HTML `hidden` attribute.
- No application source, dependencies, CI configuration, clinical content or deployment settings changed. Require new exact-head check/build/unit/full browser CI, Workers preview and a completed clean Codex review before staging merge.
