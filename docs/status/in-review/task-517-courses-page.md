# Task 517 — Courses page

- **Status:** IN_REVIEW — branch `task-517/courses-page` into `staging`.
- **Changes:**
  - Added `src/config/courses.ts` listing Med-Surg I (`available`), Med-Surg II (`coming-soon`), Mental Health (`coming-soon`), and Med Math (`coming-soon`).
  - Added accessible `src/pages/courses.astro` presenting the courses grid with token-styled layout and non-link "coming soon" indicators.
  - Added `courses` entry in `src/config/site.ts` `menuLinks`.
  - Added E2E regression tests in `tests/e2e/courses.spec.ts`.
