# Task 522: Progress words sweep

## Summary
- Replaced student-facing occurrences of "mastered"/"mastery" in `LearnSession.tsx` UI labels with the approved progress states (`recalled today`, `still learning`):
  - `Mastered {mastered} of {total}` -> `recalled today {mastered} of {total}`
  - `aria-label="Cards mastered"` -> `aria-label="Cards recalled today"`
  - `Mastered: {total} · Still learning: 0` -> `recalled today: {total} · still learning: 0`
- Updated E2E test assertions in `tests/e2e/learn-modern.spec.ts` and `tests/e2e/pages.spec.ts`.
- Added unit test in `tests/unit/progress-words.test.ts` scanning pages, components, layouts, configs and learn session UI markup to ensure no student-facing "master" words are present.
- Preserved internal engine code and test variables (`masteredCount`).
