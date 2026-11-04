# Task 178: keep meshes with repeated structure IDs in the same visual bucket

Status: in review. Based directly on the lead Anatomy Lab PR #290 at `09ea433c0bbbbcf44c3cb6d448ef24218ad35f5b`.

## Finding

In the current `anatomyscene.ts`, when adding a second GLB, a matching node was registered as an owner **only if** its structure ID was not already in `meshesById`. An ID reused across GLB files therefore caused meshes from the later file to become `unlabeled`, even if that ID was explicitly requested. Those meshes would not be hidden, highlighted, selected or labeled with the structure.

The current eleven draft source JSON files contain no cross-file duplicate structure IDs (checked by filename and label ID), so this is a forward-compatibility and shared-model integration regression guard, not a claim of a currently broken published model.

## Change

- Put the per-GLB mesh ownership logic into a renderer-independent Three.js helper, suitable for synthetic unit tests.
- Keep registering matching nodes even when an earlier GLB already populated their structure ID.
- Append their meshes to the existing ID bucket and re-evaluate bounds for every ID touched by a new model file.
- Add four synthetic tests: repeated IDs, bounds updates, unrelated/unlabeled meshes, and nested owner selection.

## Scope and release gates

Only one new source helper, the existing Anatomy Lab scene module, one synthetic unit test and this status note. No actual anatomical labels, clinical content, model assets, source/rights metadata, publication decisions, auth, dependencies, workflows or deployment settings change.

Integrate with #456's exact per-file ID mapping if that PR is adopted. A separate sibling PR addresses accurate `missing` counts, which this patch deliberately does not change. The feature stays on the lead's review branch until same-head type/build/unit/browser CI and independent review pass. Draft models still need source/rights review, locked staging verification and Christian's explicit publication approval.
