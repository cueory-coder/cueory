# Task 523: Finals survey component (UI only)

status: Task 523, finals survey UI, test coverage and accessibility review pending latest-head CI and staging preview.

## Summary
- Created `SurveyPrompt.tsx` island asking two questions:
  1. "did you use Cueory for a final or exit exam this semester?" (yes/no radio selection)
  2. "what would make it more useful?" (free text textarea with counter, capped at ≤ 200 characters)
- Added `activeQuestion` prop: ensures prompt never opens while a question or card is active.
- Dismissible via button, storing dismissal in `localStorage` wrapped in `try/catch` to safely support blocked storage.
- Pure UI with an `onSubmit` prop for the lead to wire into backend/storage later.
- Added design preview route at `src/pages/preview/survey.astro`.
- Added unit tests in `tests/unit/survey-prompt.test.tsx` and E2E + axe accessibility tests in `tests/e2e/survey-prompt.spec.ts`.
