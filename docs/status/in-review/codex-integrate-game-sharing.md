STATUS: Draft integration of sharing !2 (c913535f) on crossword candidate !97 (09713d63). The original branches remain intact. No merge approval.

Resolved five textual conflicts: CuewordGame.tsx, play.astro, global.css, play.spec.ts and build-output.test.ts. Preserved the level-aware crossword getResult payload, the current Sudoku/stat/word-path behavior, the Sudoku/crossword/result style blocks, the game print marker and every route budget. Crossword completion now provides level/time chips instead of using removed cue state.

Also fixed the OG file existence assertion to check the same games-scene image it expects in /play metadata. Corrected the first-visit promo test so its init script does not mark promo seen, uses the controlled clock, and asserts the promo can appear after the result closes. That browser test is authored, not executed here.

Validation on the integrated source: Node 24.22.1, Astro check 0 errors / 0 warnings / 26 hints, build passed, Vitest 212 files passed with 5486 tests passed and 3 existing skips, whitespace/conflict checks passed. The exact existing build-output scanner measured all four new landing routes at 89662 initial-JavaScript gzip bytes each, matching their committed baselines. No budget or assertion was weakened.

Browser blocker: pinned Chromium headless-shell is absent. System Chromium fails before assertions because socket() is denied. The earlier Chromium results on !2 or !3 do not validate this candidate. Claude must run current result-dialog/share/promo, crossword, Sudoku, word-path print, stats/privacy, keyboard/focus, axe, CSP and overflow coverage across configured projects.

Outstanding Claude integration review from !2 remains applicable. This conflict-only candidate does not claim to finish: official Threads URL verification, Facebook documented-link decision, final per-game share wording, direct Sudoku type/callback consolidation, stat result-host wiring, hello-cards tomorrow wording, config-driven Sudoku landing copy, and platform-button design. Native sharing activation and first-visit promo behavior need actual browser verification. The hard-crossword tap-target exception from !97 remains D-pending.

Dependency: this candidate includes !97. Review the sharing-only delta against codex/integrate-crossword-levels, then integrate in dependency order. No production, auth, CI, database, DNS or deployment changes were made by this work.
