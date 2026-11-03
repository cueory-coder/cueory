# Task 521: Fill-in with dropdowns

## Summary
- In `src/islands/fillin.ts`, added optional `distractors?: string[]` to `FillInItem` and updated `parseItems` to validate them if present. Added `blankOptions(answer, distractors, otherAnswers, seed)` returning 4 deterministic distinct options containing the answer.
- In `src/content.config.ts`, added `distractors: z.array(z.string().min(1).max(200)).optional()` to `fillIn` collection item schema.
- In `src/islands/FillInBoard.tsx`, added dropdown `<select>` as the default missing-word input with 4 options alongside a "type instead" toggle. Maintained keyboard and screen reader accessibility and parity.
- In `tests/unit/fillin.test.ts`, added unit tests verifying options construction, item distractor preference, other answers fallback, and generic fallback.
- In `tests/e2e/fill-in-dropdown.spec.ts`, added E2E test verifying dropdown default mode, toggle to typing, selecting dropdown answer, and axe accessibility.
- Updated existing E2E tests to toggle into typing mode where typed keystrokes/typing flows are verified.
