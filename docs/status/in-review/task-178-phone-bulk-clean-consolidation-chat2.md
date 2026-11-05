# Task 178: phone whole-body bulk-load confirmation and keyboard cancellation
status: in review. Consolidated integration-safe replacement for #470 and #473. This five-file PR starts directly from #414 head e32701d4b00769ddf866e25b127ef96e4769935b, without merging independent staging changes.

## Change
On viewports below 768 CSS pixels, Show all asks students to explicitly confirm when the action would fetch two or more unique uncached GLB files. The screen identifies the number of extra files and warns that the large scene may respond slowly. Keep current view or Escape cancels and downloads nothing. Keyboard focus enters the confirmation and returns to Show all. A body-system change discards the pending confirmation. Larger viewports, one-file and cached actions retain the original behavior and the integration branch's visibility-intent protections.

## Coverage
Pure tests cover the threshold, invalid counts and shared-file deduplication. The existing phone browser regression covers no requests on first tap, cancellation, Escape, focus recovery and positive consent. The browser test aborts confirmed downloads to avoid decoding the full scene in CI.

## Review and release
Exactly four anatomy code/test files and this status note. No clinical facts, structure names, model binaries, rights metadata, draft approval statuses, accounts, dependencies, security policies, workflows or deployment settings change. No source GLBs are approved for publication. Require exact-head type-check, build, unit, browser, security and independent code review, then staging/manual QA and Christian's separate anatomy/rights release approval. #416 addresses the independent isolated fixture-copy test failure, while #331 addresses browser CI sharding and requires separate founder approval.

Do not integrate #409, #470 or #473 as additional implementations if this consolidation is used.
