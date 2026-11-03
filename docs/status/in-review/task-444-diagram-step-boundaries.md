STATUS: READY_FOR_REVIEW — W01 Task 444 adds 20 missing untrusted-input and boundary cases to the existing diagram-steps unit suite. Scope: tests/unit/diagram-steps.test.ts and this note only. No source behavior, clinical content or dependencies change.

Tested source: staging 20ec8437c761b6272985246272678c9db83a0604. Check passed (0 errors, 0 warnings, 12 existing hints), build passed (33 pages), all 34 focused tests passed, and all 3,712 tests in 130 files passed with maxWorkers=1 under the shared validation lock. No browser specs changed and no browser execution claimed.

New coverage checks non-object rows, absent/non-text captions, missing/non-numeric/non-finite durations, exact 1/12-step and timing/caption limits, trimming/extra-field removal without input mutation, non-finite and fractional manual seeks, and single-step playback completion. Existing normal playback coverage remains intact.
