STATUS: Task 630 (!8), resume lifecycle clear guard: preserve cleared or replaced study checkpoints during background and page-exit saves. Draft pending browser verification. Target: staging.

## Completed work

The lifecycle callback reads the persisted checkpoint immediately before saving and refreshes it only when its validated draft fields still match the open study session. Missing, invalid, expired, inaccessible, or replaced entries stay untouched. Explicit study actions keep their existing save behavior. No storage keys, UI, styles, dependencies, or sample content change.

Unit regressions cover deletion before a storage event arrives, storage.clear(), replacement by another mode or a newer response, fresh explicit saves, invalid and expired entries, and blocked storage. Three Playwright scenarios cover clearing progress in another tab, hiding and leaving the stale tab, and saving a fresh fill-in, matching, or organizer session.

## Verification record

The source and test files in commit `1900eb8129a73f6c2820b4871b4d47eed661e091` are unchanged by this status update. Their local Git blob hashes match the published files.

- `ASTRO_TELEMETRY_DISABLED=1 npm run verify -- -- --max-failures=1`: type check passed with 0 errors, 0 warnings, and 26 existing hints. The production build passed with 43 pages. All 200 unit-test files passed, with 5,267 tests passed and 3 existing tests skipped. The aggregate command failed at browser launch.
- `npm test -- tests/unit/resume.test.ts tests/unit/status-note-filenames.test.ts`: 27/27 passed after this status update, including all 26 resume tests and the status-note filename check.
- `playwright test tests/e2e/resume-cleared-progress.spec.ts --list`: 12 configured cases discovered across phone, phone-evening, tablet, and desktop. Discovery is not browser execution.
- Executed before/after lifecycle reproduction: the original callback restored a deleted checkpoint and overwrote a replacement. The fixed callback preserved both.
- Independent source review covered all five lifecycle callers. A Node compatibility smoke check with !7 at `edaf2bd61949a6bb213a8d366935eeeb70791e34` exercised five named/numeric/reordered flashcard-answer scenarios without a confirmed conflict. This did not exercise browser or React effect timing.
- Changed-file whitespace validation passed. The full four-file diff was reread against `CLAUDE.md` and the design handoff on 2026-11-11. No new visual design decision or D-pending item is needed for this change.

Validation used Node 24.22.1. It meets the package engine range but is one patch below the repository's 24.22.2 pin. No pin or dependency was changed.

### Browser blocker and remaining check

Playwright's pinned Chromium headless-shell executable is missing. A diagnostic launch of the installed Chromium also failed because the environment forbids its local process socket. Automatic approval review rejected an escalated launch. No browser assertion or axe pass is claimed, and the unchanged restriction was not retried.

Keep !8 in Draft until the browser scenarios and required browser/accessibility checks run in a supported environment. Include immediate navigation after a flashcard answer because CardDeck saves through a passive effect. No GitLab head pipeline was present when this status was reviewed, so no CI pass is claimed.

## Behavior limits

This guard handles deletion or replacement already visible at its storage read. The localStorage read/compare/write sequence is not an atomic transaction across tabs. It does not reset visible in-memory study state, and a later deliberate study action can save that state under the existing behavior. Lifecycle callbacks refresh an already saved checkpoint instead of retrying an unsaved change.

Reordered answer-object keys can conservatively skip a timestamp refresh. The existing checkpoint remains intact and restorable. The compatibility check found no reason to broaden this task into a new equality or flashcard-order implementation.

## Deferred findings outside !8

These are findings for later assignment, not changes in this merge request. No side-fix merge request or implementation commit was published.

- **Progress catalog visibility:** `src/pages/progress.astro` maps every cards collection entry into progress props instead of using the canonical visible lesson catalog. Shape-only fixture checks confirmed that a draft/in-review deck or a deck under a hidden owner can expose its title, deck ID, and card IDs in those props and count as active. Card fronts and backs are not included. The current content has only a visible placeholder deck, so this is not a confirmed exposure of hidden content in today's build. A later task should filter through the canonical catalog while retaining the existing retired-progress behavior for saved IDs that are no longer visible.
- **Study carousel fallback:** `src/components/ModesCarousel.astro` enables ring mode and hides fallback links even when the dialog preview cannot be created, such as when `showModal` is unavailable. An executed Node harness using the component's actual script confirmed a no-op preview button with the fallback links unavailable. This is a script-level reproduction, not a browser pass. A later task should require the necessary dialog capabilities before enhancing the fallback links.

The branch remains `task-630/resume-clear-guard`, targeting `staging`. The latest user instructions govern review and merging. Claude reviews and merges. This update does not change CI, project instruction files, migrations, sign-in, deployment settings, or any protected branch.
