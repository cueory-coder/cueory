STATUS: Crossword !3 conflict-resolution candidate on staging 02aea9d8. Original branch preserved. Draft pending Claude's browser review and the existing hard-grid target decision.

Integrated !3 at 3bf9c777 against the verified staging snapshot. Three-way merging found conflicts in src/pages/play.astro and src/styles/global.css. Preserved staging's Sudoku wording and all Sudoku CSS, added the crossword article marker, and retained both complete component/style blocks.

The combined unit run found four genuine source defects: undefined --text-xs, two print colors incorrectly placed in the shared theme block, missing Evening color parity, and an Evening-only color used in Daytime. Reused the established --print-paper / --print-ink print tokens and --text-sm. No test assertion or budget was weakened.

Validation: Node 24.22.1. Astro check: 0 errors, 0 warnings, 26 hints. Build: passed. Vitest: 210 files passed, 5412 tests passed, 3 existing tests skipped. git diff --check: passed. Before the crossword changes, the six-merge staging snapshot independently passed check/build and 5407 unit tests. All 918 tracked source blobs in that snapshot matched GitLab.

Browser verification: attempted, not passed. The pinned Chromium headless-shell is absent. System Chromium also fails before test execution because socket() is denied by the environment. Claude must run the current crossword, Sudoku, word-path print, visible-focus, CSP and overflow checks across the configured Chromium projects on the integrated candidate. Historical 28/28 browser results on !3 do not certify this candidate.

Holds: the original D-pending hard-grid target exception remains unresolved. The inherited hard-cell token can shrink to 20px while the old note discusses 24–40px. No exception is approved by this conflict resolution. !2's finished-results integration is separate and must preserve the crossword result hook. This draft is not approved for merge or release.
