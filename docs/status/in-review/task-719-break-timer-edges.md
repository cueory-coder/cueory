status: Task 719 (W19) break timer edge cases: deadline-based timer on /breaks, session restoration with blocked-storage fallback, wake-up reconciliation, calm accessible updates and regression tests.


## Codex hydration repair

An elapsed saved break could start a new focus deadline on every reload because the hydrated phase was marked saved before it was persisted. Hydration now writes the restored state when a saved record exists. A failed write keeps the in-memory timer running and shows the existing storage warning. A page without a saved timer still makes no hydration write.

Added a Playwright regression for reopening an expired saved break, advancing five minutes and reloading again without extending the new focus deadline. Fixed the existing fake-clock TypeScript cast (TS2352). Browser assertions are written, not executed here.

Checks on staging `73ea0f81` plus exact !79 and !31 changes: Astro check passed (0 errors, 0 warnings, 26 hints), production build/Pagefind passed, and official Vitest passed 214 files with 5,496 tests passed and 3 skipped. The focused timer/resume/continue suite passed 198 tests. Playwright discovered 112 cases in the two specs; discovery is not browser execution. A bounded component/effect probe using the actual component and storage helpers reproduced the old deadline extension and verified the repair, blocked writes and an absent save. It is not a browser pass. Node 24.22.1 meets package engines but is one patch below the pin. Keep Draft for Claude's real browser, keyboard and axe run before merge.
