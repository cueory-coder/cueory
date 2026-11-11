status: Task 629, flashcard resume order: restore marks in the saved round order so numeric card IDs and reordered answer objects keep the student's place and piles.

The restore helper now lives in `src/islands/cardresume.ts`. It still rejects missing, extra, unanswered, unknown, or invalid marks and inconsistent deck, round, or position data.

Focused verification: the four ordering regressions failed before the repair, with 22 rejection/compatibility checks passing. After the repair, all 26 tests in `tests/unit/cardresume.test.ts` pass. The card-resume, card-state, and shared-resume suites pass together (69 tests). An independent source review found no findings.

Project verification on 2026-11-11: `npm run verify -- -- --max-failures=1` passed the type check, build, and all 201 unit-test files (5,285 passed, 3 skipped). The browser stage could not run because Playwright's bundled Chromium executable is unavailable. Its download returned an invalid archive. The installed system Chromium also failed to launch because the environment forbids a required local socket, and the approval policy rejected running outside that restriction. No browser or axe pass is claimed. Node was 24.22.1, within the package engine range but one patch below the repository's 24.22.2 pin.

Review status: keep the merge request in draft until the browser checks can run in a permitted environment. The GitLab integration branch currently has no `.gitlab-ci.yml` or external CI configuration, so no GitLab pipeline pass is claimed. No protected branch, hosted service, or sample content was changed.

Coverage note: numeric card IDs are allowed by the existing content schema. Current sample decks use named IDs, so this repairs a reproduced valid-content failure without changing any sample content.
