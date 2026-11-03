# Task 178: static anatomy text catalog for students without JavaScript

Status: in review

## Problem
The interactive Anatomy Lab is a React island loaded using `client:only`. With JavaScript blocked, it renders no study catalog. A WebGL failure after React starts is handled by a different proposed UI fix, but does not help someone whose browser never runs JavaScript.

## Change
- On `/preview/anatomy-lab`, a `<noscript>` link leads to `/preview/anatomy-text` whenever there is draft/approved source data to open.
- The static route shows system links, groups, original source names, draft-review notices, source-name attribution, model release and the existing BodyParts3D license link.
- No GLB or three.js is loaded on the text route, and its `noindex` flag matches the interactive preview.
- The catalog uses `labDataForBuild` and the same build-time production gate. Unreviewed draft names remain excluded from production markup. The test fixture is not passed off as anatomy.
- A Playwright spec disables JavaScript, follows the link and checks readable names, source credit, noindex and no model requests.

## Scope
Built from lead PR #290 (`ad5304355678dbc7a806ff7b251f8c4c3167f9be`), stacked for review only. No clinical facts, generated model assets, approval statuses, dependencies, auth or deployment settings changed. Target files: `src/pages/preview/anatomy-lab.astro`, `src/pages/preview/anatomy-text.astro`, `tests/e2e/anatomy-no-javascript.spec.ts` and this note.

## Verification
Static source anchors and branch diff verified. Full `npm run verify` unavailable without checkout/Node 24 in the connected environment. Exact-head CI, Playwright, Codex review and staged manual accessibility checks are required. Not approved for production publication.
