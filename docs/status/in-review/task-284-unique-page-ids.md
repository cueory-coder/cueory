STATUS: READY_FOR_REVIEW — W01 Task 284 checks every built HTML page for duplicate element IDs. Scope: tests/unit/duplicate-ids.test.ts and this note. No product files, dependencies or behavior change.

Tested base: staging beeebc0e8715af44298e114c9950bf061b896e66. Check passed (0 errors, 0 warnings, 12 existing hints), build passed (34 pages), and all 38 focused tests passed. The full suite passed (3,585 tests in 119 files) with maxWorkers=1 under the shared validation lock. No browser specs were changed or browser execution claimed.

Four regression fixtures cover hidden duplicates, numeric references, case-sensitive identifiers, first duplicate attributes, comments/raw text/quoted lookalikes, and fail-closed decoding of unsupported named references. All built pages had unique IDs without product edits. Missing build output fails instead of skipping coverage.
