STATUS: Draft sharing !100 integration on staging 2ff7d451 with source f959bb81 preserved. Browser and remaining review holds are not cleared.

Resolved five textual conflicts: CuewordGame.tsx, play.astro, global.css, play.spec.ts and build-output.test.ts. Preserved the level-aware crossword getResult payload, the current Sudoku/stat/word-path behavior, the Sudoku/crossword/result style blocks, the game print marker and every route budget. Crossword completion now provides level/time chips instead of using removed cue state.

Also fixed the OG file existence assertion to check the same games-scene image it expects in /play metadata. Corrected the first-visit promo test so its init script does not mark promo seen, uses the controlled clock, and asserts the promo can appear after the result closes. That browser test is authored, not executed here.

Validation on the integrated source: Node 24.22.1, Astro check 0 errors / 0 warnings / 26 hints, build passed, Vitest 212 files passed with 5486 tests passed and 3 existing skips, whitespace/conflict checks passed. The exact existing build-output scanner measured all four new landing routes at 89662 initial-JavaScript gzip bytes each, matching their committed baselines. No budget or assertion was weakened.

Browser blocker: pinned Chromium headless-shell is absent. System Chromium fails before assertions because socket() is denied. The earlier Chromium results on !2 or !3 do not validate this candidate. Claude must run current result-dialog/share/promo, crossword, Sudoku, word-path print, stats/privacy, keyboard/focus, axe, CSP and overflow coverage across configured projects.

Outstanding Claude integration review from !2 remains applicable. This conflict-only candidate does not claim to finish: official Threads URL verification, Facebook documented-link decision, final per-game share wording, stat result-host wiring, hello-cards tomorrow wording, config-driven Sudoku landing copy, and platform-button design. Native sharing activation and first-visit promo behavior need actual browser verification. The hard-crossword tap-target exception from !97 remains D-pending.

Dependency: this candidate includes !97. Review the sharing-only delta against codex/integrate-crossword-levels, then integrate in dependency order. No production, auth, CI, database, DNS or deployment changes were made by this work.


## Repair after review: reliable Sudoku result delivery

The real completion effect emitted only a one-time Sudoku event, so completion before host hydration lost the result. A Vitest regression using the actual island completion effect with fake React/browser APIs first failed with an empty pending-result queue. The repaired island calls the queued display-result path directly using its canonical SudokuResult. The old public completion event remains available to observers, but the result host no longer consumes it, preventing duplicate cards. A compatibility type alias replaces the duplicated payload definition.

Two runtime unit cases cover a host that loads late and a live host receiving exactly one result. The existing adapter test now consumes the real Sudoku getResult output (including its 02:34 time format). The old implementation-specific listener assertion was replaced by these behavioral regressions. The Sudoku browser solve case now checks/closes the shared dialog before checking focus returns to the plain result, retaining its completion-hook and no-wrong-stats assertions.

Validation after this repair: focused Vitest 4 files / 34 tests passed. Astro check passed with 0 errors, 0 warnings, 26 hints. Build passed. Full Vitest passed 213 files / 5487 tests with 3 existing skips. Browser assertions are still not run locally and remain required for Claude. No new merge request was opened for this repair.

## Repair after review: fresh activation for native sharing

Two behavioral Vitest regressions reproduced the old handler calling native share after simulated activation expired during image generation, and still launching share after the result closed. The handler now prepares the image on demand and exposes a separate share-image action whose click invokes native sharing before any asynchronous preparation. Missing native file sharing still copies immediately without generating an image. Closing, replacing, or unmounting the result invalidates pending work. The preparing control stays focusable with aria-disabled and aria-busy, and its handler ignores repeated preparation requests.

Four unit cases run the actual result-host handlers with controlled hooks and browser/share stand-ins: fresh activation, close during preparation, result replacement, and immediate copy fallback. The first two failed against the original handler. A browser regression was added for delayed logo loading, no premature native share, retained keyboard focus, and Enter invoking file sharing with active user activation. It was discovered across all four configured Chromium projects, but actual browser assertions did not run because Playwright's pinned Chromium executable is missing. Historical browser results do not validate this new flow.

Validation on the repaired source: Astro check 0 errors / 0 warnings / 26 hints, build passed, full Vitest 214 files / 5491 tests passed with 3 existing skips, browser discovery 20 cases in game-results.spec.ts. Node 24.22.1, unchanged lockfile dependencies. No passing browser or full npm run verify claim. All remaining integration/design holds above stay in place. No new PR was opened.

## Integration follow-through: shared Sudoku copy and hello-cards message

Completed two explicit items from Claude's integration review. The Sudoku landing title, description, heading and introductory copy now read the Sudoku entry in src/config/games.ts, matching the other landing pages. Hello-cards results now say "a new card of the day comes out tomorrow." The other games keep their existing message.

Validation: Astro check 0 errors / 0 warnings / 26 hints, build passed, full Vitest 214 files / 5491 tests passed with 3 existing skips. A readback of the built Sudoku HTML confirmed its title, description, heading and landing copy match the current shared configuration. No new browser result or full npm run verify pass is claimed. The remaining platform/share-format/stat/design and hard-grid/browser holds still apply. No new PR was opened.

## Integration repair: preserve newly merged staging

Staging advanced through the canonical crossword integration, Sudoku hardening, Stat review, resources, onboarding, content-map/index and other reviewed changes. Reconstructed staging 2ff7d451 and verified all 953 source blob hashes, and reconstructed sharing 936dd415 with all 942 hashes verified. A real local three-way merge reproduced five conflicts. Resolved them by retaining the canonical crossword stylesheet and shared printGame helper, new Sudoku edit/settings/key helpers, canonical crossword status/print tokens, queued result delivery and native image-sharing repair. Removed the obsolete duplicate crossword CSS from global.css. The f959bb81 Sudoku-copy and hello-cards update was then reviewed and carried forward unchanged.

The final combined source passed Astro check with 0 errors / 0 warnings / 26 hints, build, and full Vitest: 222 files, 5611 tests passed, 3 existing skips. Whitespace and conflict-marker checks passed. Node 24.22.1, unchanged lockfile. This is a normal additive source-branch commit, with no history rewrite and no new PR. The final GitLab merge will record target ancestry.

The initial !97 dependency is superseded by the canonical crossword already merged on staging. Review this final net diff against current staging rather than reapplying the old crossword candidate. Existing hard-grid decision history is preserved without asserting a new exception approval. Actual browser/axe/print/native-share checks and the remaining platform/share-format/stat/design review are still required before this draft can merge.
