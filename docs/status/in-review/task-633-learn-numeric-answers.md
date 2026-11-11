status: Task 633, Learn numeric-answer comparison: preserves meaningful notation in typed answers, fill-in recall and multiple-choice options. Draft for review. Focused Node verification passed. Full project verification remains blocked because Astro is not installed in this workspace.

## Problem and change

At integration commit `6b5ae956984672953716f537ff10f371c40afe61`, Learn's normalization removed meaningful symbols. Synthetic answers such as `.5` and `5`, `-3` and `+3`, and `<5` and `>5` could be marked equivalent. The same comparison also removed distinct numeric options from multiple-choice questions.

The comparison now preserves symbols, decimal separators, numeric ranges, ratios and percent notation. Canonical Unicode normalization retains superscripts, negated comparisons, combining numeric marks and unit glyphs. Ordinary case, letter accents, sentence punctuation, word hyphens and repeated spaces retain their existing tolerance.

This remains a lexical comparison. It does not calculate equivalent numerical values or introduce clinical content. Test strings are synthetic examples only.

## Verification

- Reproduced the original wrong-answer acceptance on the unmodified integration source before the fix.
- Ran Node assertions against the actual Learn, cards, progress and resume modules after TypeScript annotations were removed and local import extensions were adapted. Runtime application logic was unchanged in those temporary copies.
- Passed 22 distinct numeric/symbol pairs, 44 typed/fill-in session paths, 22 multiple-choice decks, 10 equivalent-format pairs, five existing prose normalization checks and the original nine-step mixed Learn session. Incorrect recall remains unmastered, while a corrected retry can complete the session.
- An independent review reproduced the original failures and checked the correction, including Unicode operators, units and retained choice options.
- Added corresponding Vitest regressions in `tests/unit/learn.test.ts`.
- Attempted `npm run verify`. It stopped at `npm run check` with `astro: not found`. This workspace contains targeted repository source snapshots and lacks project dependencies. Astro type checking, the build, the full Vitest suite and browser tests have not passed here.

Run the required project verification in a complete checkout before marking the merge request ready.

## Scope

Only `src/islands/learn.ts`, its unit tests and this status note change. The branch starts from `legacy/staging` and the merge request targets `legacy/staging`. No hosted service changes or merge actions are included.
