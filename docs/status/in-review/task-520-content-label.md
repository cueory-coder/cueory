# Task 520 — Content label

- **Status:** IN_REVIEW — branch `task-520/content-label-disclaimer` into `staging`.
- **Changes:**
  - Added configurable disclosure text in `src/config/site.ts`: `"researched against cited sources, with citations; not yet reviewed by a licensed nurse"`.
  - Created `src/components/ContentLabel.astro` linking to `/disclaimer`.
  - Added `ContentLabel` to `src/pages/learn/study-skills/index.astro` and all study-mode pages (`cards`, `fill-in`, `label-it`, `learn-mode`, `matching`, `organizer`, `questions`).
  - Added unit test in `tests/unit/content-label.test.ts`.
