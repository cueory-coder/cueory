status: Task 633, Learn numeric-answer comparison: preserves meaningful notation in typed answers, fill-in recall and multiple-choice options. Type check, production build and all 200 unit-test files passed. MR !11 targets staging and remains Draft because browser verification could not run.

## Problem and change

At integration commit `6b5ae956984672953716f537ff10f371c40afe61`, Learn's normalization removed meaningful symbols. Synthetic answers such as `.5` and `5`, `-3` and `+3`, and `<5` and `>5` could be marked equivalent. The same comparison also removed distinct numeric options from multiple-choice questions.

The comparison now preserves symbols, decimal separators, numeric ranges, ratios and percent notation. Canonical Unicode normalization retains superscripts, negated comparisons, combining numeric marks and unit glyphs. Ordinary case, letter accents, sentence punctuation, word hyphens and repeated spaces retain their existing tolerance.

This remains a lexical comparison. It does not calculate equivalent numerical values or introduce clinical content. Test strings are synthetic examples only.

The follow-up review found that checking for `!=` inside the per-character filter repeatedly scanned the same separator. That check now runs once per separator. A regression covers 32,000 punctuation characters, both alone and before a final `=5`. In one local measurement with the pinned Node version, the punctuation-only case fell from 5,432 ms to 10 ms with the same result. This is a local observation, not a cross-device performance guarantee.

## Verification on 2026-11-11

The complete checkout was verified against all 883 tracked files at MR head `8505de05f4df96936edb77c550349446553de4a2`, then the performance fix and its regression were applied. Checks used Node **24.22.2**, matching `.node-version`, with dependencies installed by `npm ci --no-audit --no-fund`.

Ran `CI=1 npm run verify -- -- --max-failures=1`. This runs the repository's unchanged check, build, unit-test and browser-test scripts, with the browser runner stopping after its first reported failure. Results:

| Check | Observed result |
| --- | --- |
| `npm run check` | Passed across 588 files: 0 errors, 0 warnings, 26 hints. |
| `npm run build` | Passed: 43 pages and Pagefind output generated. Build warnings are recorded below. |
| `npm test` | Passed: 200 test files, 5,315 tests passed and 3 pre-existing skips. No tests were skipped or loosened by this MR. |
| `npm run test:e2e -- --max-failures=1` | Failed during browser launch, before assertions. Of 5,188 configured tests, 4 concurrent launches failed and 5,184 did not run. No browser or axe pass is claimed. |

The aggregate verification command exited **1** because the browser stage failed. The earlier `astro: not found` setup problem is resolved and is superseded by the results above.

Browser recovery attempts also failed. Playwright's pinned Chromium headless shell was missing. `playwright install chromium --only-shell --no-progress --no-remove` could not unpack the official download because it was not a valid ZIP archive. Installed Chromium failed to start with `socket() failed: Operation not permitted`. The connected-browser tool was unavailable. A shared-browser manual check could not reach the local preview, and its error page could not be inspected under the browser URL policy. No browser security settings or test configuration were changed.

Before this full run, focused Node assertions reproduced the original defect and passed 22 distinct numeric/symbol pairs, 44 typed/fill-in session paths, 22 multiple-choice decks, 10 equivalent-format pairs, five prose checks and the original nine-step mixed Learn session. The Vitest regressions now run in the actual project suite. Independent focused review checked the numeric correction and the performance fix.

Browser coverage, including the existing Learn keyboard, responsive and axe tests, remains required before this MR is considered finished. Keep it Draft until that gap is resolved.

## Scope

Only `src/islands/learn.ts`, `tests/unit/learn.test.ts` and this status note change. Existing branch `task-633/learn-numeric-answers` and MR !11 target `staging`. The open-MR inventory was checked before continuing. Other workers' MRs and known duplicate branches were left alone.

The whole diff was reread against `CLAUDE.md` and the current design handoff at `cueory1/cueory-design`, `task-0/design-notes`, `docs/handoff/CODEX-WORKER-BRIEFS.md`. This pure-logic change introduces no UI, styling, assets, dependencies or clinical content. There is no new visual decision requiring D-pending.

No CI files, instruction files, migrations, sign-in code or deployment settings change. No push to `main` or `legacy/*`, force-push, approval, merge or auto-merge action is included.

## Findings outside this task, deferred

- The build reported CSP compatibility warnings for Shiki's inline syntax-highlighting styles and a bundle-size warning. Those concern existing configuration and other code, so they were recorded without a side fix.
- An earlier read-only staging inspection found that deployed `public.delete_my_account()` lacked the `app_private.mfa_access_allowed()` guard present in `supabase/migrations/20261104170500_enforce_opt_in_mfa.sql`, although that migration was recorded as applied. This needs Christian's investigation. No account-deletion call was made, and no hosted function, authentication code, migration or deployment setting was changed.
