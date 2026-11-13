# Public content sample-label audit (T29)

Audited staging `1de038ad2de60c7516106aa98728925ab910e2a4`, with the T28 safety guard from !127. This audit checks labels and schema boundaries; it does not approve clinical accuracy or publication of new content.

## JSON inventory

All 55 JSON files under `content/` were parsed and checked against their label category:

| Category | Files | Label and schema rule |
| --- | ---: | --- |
| Daily-game samples | 33 | `status: sample`; pulse 10, triage 7, cueword 9, suture 5, stat 1, hello-cards 1 |
| Study-mode samples | 4 | Fill-in, organizer, label-it and questions each require `status: sample`; every question also carries its own sample status |
| Break ideas | 1 | `sample: true`; imported directly rather than through the Astro collection map |
| Lesson and card placeholders | 2 | `status: placeholder`, with placeholder text rather than unreleased lessons |
| Empty video placeholder | 1 | Corrected from `draft` to the existing schema's `placeholder`; the sentinel id and empty caption/transcript links remain unchanged |
| Sourced visual manifests | 14 | `status: draft`; source/license review metadata, not playable question samples or unreleased lesson bodies |

The 38 everyday sample files already carry their required sample marker. The three instructional placeholders now explicitly say `placeholder`. No sample is relabeled as approved or published. Visual source metadata retains its separate draft/approved workflow.

## Schema cross-check

- `src/content.config.ts`: lessons/cards distinguish placeholder/sample from private draft/in-review and published statuses. Fill-in, organizer, label-it, questions, pulse, triage, cueword and suture require the literal sample status. Questions require the marker on every item as well as the collection.
- `src/content/game-schemas.ts`: strict sample schemas for pulse, triage, stat and hello-cards require `status: sample`. The Astro hello-cards collection separately allows an approved state; this audit grants no approval.
- `src/videos/schema.ts`: videos do not accept `sample`; `placeholder` is the supported marker for this empty stub. Only `published` is showable. The strengthened existing unit test requires the placeholder marker, sentinel id, empty links and non-showable state; the existing browser test still checks that no player appears on the lesson.
- Break ideas use `sample: true`, as documented in `docs/CONTENT-FORMAT.md`. There is no need to invent a second status field.

The workflow enums are not permission to commit private drafts. T28 inventories every content file and rejects new or changed payloads, including new fields hidden below a sample label. This MR updates only the exact video fingerprint and strengthens its expected status to match the label repair.

## CSV audit

There are two tracked CSV files under `content/`, and neither is an instructional sample or question batch:

| File | Data rows | Purpose / columns |
| --- | ---: | --- |
| `content/curriculum/blocks-v4.csv` | 248 | Curriculum outline; track/course/module/block identifiers and titles, scope/tags, wave/retired/pointer metadata |
| `content/curriculum/objectives-pilot-v4.csv` | 13 | Objective outline; objective/step/block identifiers, dependency/risk/wave/note metadata |

The related `docs/curriculum/medsurg-lesson-map.csv` has 351 data rows and lesson/unit/topic/status metadata. It is a real curriculum map, not a sample question CSV. None of these three header sets has answer-key or rationale columns; no fake sample-status column was added to real outline data. CSV files were parsed with a CSV reader, including quoting support, rather than split by commas.

No CSV sample or review-batch file is tracked under `content/batches/`; only its empty `.gitkeep` is present. `docs/BATCHES.md` documents the private CSV column formats rather than shipping a populated public batch. T28 covers the exact CSV bytes and all batch files, so changing a cell or adding a file cannot bypass the safety boundary.

## Result

One labeling gap found and repaired: the empty video stub said draft instead of placeholder. All existing samples and placeholders now carry their supported explicit marker. No content, schema, auth, storage, source/licensing decision or publication status was added. The video remains absent from its lesson page.
