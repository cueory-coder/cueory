# Task 178 — reconciled viewer integration: mesh IDs and system switching

Status: in review. Branch begins at the exact head of PR #414, `5085cce47985d6ecacb94ab5408a78bac5604efa`. This is an optional alternative to applying the same changes from PR #494 to a different base.

## Fixes
- Register later GLB meshes under their already-known structure ID and refresh bounds for every touched ID. The isolated `anatomymeshindex.ts` helper and synthetic Vitest cases are copied from the previously reviewed mesh correction in PR #494/#482.
- Invalidate in-flight PNG exports and stale layer-visibility intents in the system-picker handler. Retire the prior on-demand loader and clear its scene immediately, so late initial GLBs and on-demand results cannot repopulate the old model. Mark the newly chosen model loading and clear the former selection and quiz before the passive React load effect runs. Preserve the existing reset of search and keyboard list pagination from PR #414.
- Include the synthetic same-tick PNG-race Playwright test from the PR #469 work, and assert the quiz and PNG controls are disabled while a held new-system GLB is still loading.

## Merge guidance
PR #414 contains the broader accessibility, 3D viewer and catalog reconciliation changes, while PR #469/494 contain parallel smaller fixes. Claude should use this branch **only if integrating into PR #414**. Do not apply this same mesh index or system-switch guard again from PR #494; they are alternative integration paths, not additive PRs. This branch preserves PR #414's viewer scheduler, quiz state, text fallback and catalog modifications.

## Release gates
No real anatomy models, medical content, structure names, licenses, approval states, auth, dependencies, workflows, deployment settings or CSP changed. Source and diff were reviewed through the GitHub connector. Local npm and browser tests were unavailable in this GitHub-only environment. Require exact-head CI, Codex review, full Playwright coverage and staging/founder source-rights approval before publication.
