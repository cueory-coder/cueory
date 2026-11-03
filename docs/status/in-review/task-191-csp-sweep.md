status: READY_FOR_REVIEW — W14, Task 191, board #225 revision 6.

Scope recorded before edits: tests/e2e/csp-sweep.spec.ts and this status note only.
Existing CSP checks cover the body viewer and flashcards, not every built route.
No security policy or application files will change.

Adds a built-output inventory of all 31 HTML routes, including preview pages and
the real 404 response. Each page must have an enforced CSP and no CSP DOM events
or console errors during initial loading and island hydration. A deliberately
blocked inline-style fixture checks that the detector records violations.

Validation: npm run check passed with zero errors and warnings (11 existing hints).
npm run build passed. npm test passed: 108 files, 3,297 tests.
The new Playwright spec discovered 32 desktop cases, but browser launch failed
before any assertions because Chromium headless shell 1248 is not installed.
No browser pass or absence of runtime CSP defects is claimed. CI must run it.
