# Task 178 — clean Anatomy Lab system-switch browser regression

status: Task 178: prevent a held-GLB system-switch Playwright deadlock after progressive loader integration by waiting for each replacement request and always releasing stalled routes during cleanup; in review.

## Reproduced risk
The existing system-switch Playwright test drains held GLB requests as soon as the UI displays its loading overlay. That overlay can render before the new request arrives in the route handler, leaving a late request blocked forever. Multi-GLB anatomy systems can also enqueue additional sibling requests after the current set is drained. An early test failure can strand a route without cleanup.

## Fix
Port only the focused Playwright test correction from PR #513 onto the exact six-file integration PR #506 head `f0e2535b4550ec7afe5e4a1787e538a3a2eac85c`. Per-phase `holdRequests` guards all late sibling requests. The test waits for an actual held replacement URL before releasing the next phase, checks the camera/quiz/export/structure readiness gates, asserts the draft-enabled body-system picker is present instead of silently skipping the test, and uses `finally` to release held requests on failure. No runtime source code changes.

## Files and compatibility
This status note plus `tests/e2e/anatomy-lab.spec.ts`. PR #513 was not used as the base because its current comparison contains 12 unrelated exam-plan, print and forced-color files; this is a clean two-file alternative, not an additive change. Earlier PR #505 contains an older version of this test fix and also has unrelated changes in its current comparison. Claude should apply exactly one clean version, once, after the selected progressive loader integration.

## Verification and release gates
GitHub exact-head TypeScript check, Astro build, Vitest, Chromium Playwright, CodeQL and independent Codex review are required. Local Node here lacks the installed repo dependencies and a browser executable, so no local npm or browser pass is claimed. Publication still requires locked staging and Christian's anatomy source/rights approvals. No GLB assets, clinical content, auth, dependencies, workflows, secrets or production settings changed.
