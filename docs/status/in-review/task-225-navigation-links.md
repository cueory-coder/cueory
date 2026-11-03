status: READY_FOR_REVIEW — W35, Task 225, board #225 revision 11.

Scope: tests/e2e/navigation-links.spec.ts and this note only.
The new regression clicks each configured internal menu/footer destination and
checks its resulting URL and main content. Existing footer-theme and pages specs
already cover keyboard theme switching, persistence and disclosure interaction.
No application, authentication, workflow or deployment files change.

Validation against staging 20ec843: check passed with zero errors/warnings,
build passed, all 3,692 unit tests in 130 files passed. Playwright discovered
48 configured cases. Focused browser execution was blocked before assertions
because Chromium headless shell 1248 is absent. Browser CI remains required.
