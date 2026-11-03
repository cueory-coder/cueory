# Theme picker contract coverage

Adds focused unit coverage for the existing footer theme picker component. The tests pin its three user-visible choices, radio-group semantics, decorative icon and visible-label requirements, plus the existing theme persistence and browser-bar color synchronization hooks.

No component or runtime behavior changed.

Validation:

- `git diff --check` passed.
- Focused `npm test -- tests/unit/theme-picker.test.ts` passed: 3 tests.
- `npm run check` passed with 0 errors, 0 warnings, and 11 existing hints.
- `npm run build` passed with 33 pages built on the current staging tip.
- `npm test` passed: 3,405 tests in 114 files.

Target: `staging`. Do not merge.
