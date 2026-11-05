# Task 178 — correct per-GLB result status for repeated structure IDs

status: Task 178 Anatomy Lab cumulative scene results: a structure already found in a previous GLB must not be reported as missing when a later file contributes more meshes to it; synthetic regression coverage in review.

## Source-level defect
`anatomyscene.ts` previously populated `LoadResult.missing` as every requested ID not in the list of newly added structure IDs. Because repeated structure IDs from later GLBs already exist in the scene's `order`, they are omitted from `added` and incorrectly enter `missing`. This happens even when `meshesById` contains visible meshes from both files. Duplicate input IDs can also repeat an ID in `order` or the missing array.

## Fix
Add the pure `summarizeIndexedAnatomyIds` helper to the existing mesh-index module. It returns newly discovered IDs separately from IDs whose cumulative scene mesh bucket is actually empty, while preserving input order and collapsing duplicate input IDs. Use the helper inside `integrate` without changing material conversion, mesh ownership, camera behavior, source names, or the existing merged scene.

## Synthetic regressions
Three Three.js unit cases: a shared structure appears in both GLBs but is not missing after the second, a newly loaded structure appears only once despite duplicate source IDs while genuinely absent IDs remain missing, and an ID becomes newly found again after the previous scene order was cleared.

## Isolation and merge
Based on exact reviewed mesh/resource integration #559 commit `24df56b77f99a90968625c4be218ceaf9502c1a1`. Only `src/islands/anatomymeshindex.ts`, `src/islands/anatomyscene.ts`, `tests/unit/anatomymeshindex.test.ts`, and this status note change. This is distinct from the whole-body **catalog missing-count** fixes (#522/#525), which count across published GLBs. It repairs the scene's per-file result object. No clinical facts, real source GLBs, licensing, permissions, dependencies, workflows, deployment settings or release approvals change.

Require exact-head TypeScript, build, Vitest, Playwright, CodeQL, independent Codex review, locked staging QA, and founder source-rights/content approval before Claude integrates the small patch. Do not merge into staging/main or publish draft anatomy files directly.
