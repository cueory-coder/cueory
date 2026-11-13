# How to edit Cueory content

Christian: use this guide to choose the right file, make an edit, and ask a builder to check it. You do not need to edit a page component or a database table to prepare content.

## First choose public files or a private batch

The repository is public. A draft status hides a lesson from the site; it does **not** hide a committed file from people reading the repository. Keep unreleased lessons, real questions, answer keys, rationales, reviewer results and personal information in the approved private workflow. Never paste them into an issue or merge request.

Use repository files only for deliberately labeled everyday samples/placeholders and approved public material permitted by the collection. Use a private batch for real questions. Passing a format check proves the file can be read; it does not approve its accuracy or publish it.

## Find the file you mean to change

| What you are editing | File or folder | Fields to look for |
| --- | --- | --- |
| An existing lesson | `content/lessons/<lesson-id>.json` | `course`, `order`, `title`, `summary`, `status`, `sentences` |
| That lesson's card deck | `content/cards/<lesson-id>.json` | `lesson`, `title`, `status`, `cards` |
| An everyday fill-in sample | `content/fill-in/<lesson-id>.json` | `lesson`, `status`, `items` |
| An everyday sorting sample | `content/organizer/<lesson-id>.json` | `lesson`, `status`, `title`, `groups`, `items` |
| An image-label sample | `content/label-it/<lesson-id>.json` | `lesson`, `status`, `image`, `labels` |
| A lesson's video details | `content/videos/<lesson-id>.json` | `lesson`, `title`, `status`, `videoId`, `captionsUrl`, `transcriptUrl`; optional `thumbnail` |
| A public game sample | The appropriate folder under `content/games/` | Follow that game's entry in [Content formats](CONTENT-FORMAT.md); the formats differ |
| Break suggestions | `content/breaks/ideas.json` | `sample: true`, then `ideas` with unique `id` and `text` |
| The lesson outline | `docs/curriculum/medsurg-lesson-map.csv` | The seven columns below; this is an outline, not lesson text |
| A private question batch | A local folder under `content/batches/` | Separate CSV files listed below; never commit the batch |

For an existing everyday example, the lesson and companion files use `study-skills-01.json`. Its page address is `/learn/study-skills`; the older file name is intentional. Preserve it. For a new mapped lesson, use its stable map id in lowercase as the file name. Companion files use the same lesson id in their `lesson` field. Do not rename existing ids to tidy them: links and saved progress may depend on them.

The two CSVs in `content/curriculum/` are planning drafts, not the source of lesson-page text. Use [Content map](CONTENT-MAP.md) to choose a folder and [the lesson-map guide](curriculum/README.md) before changing the outline. Visual source/rights records follow [Visuals kit](VISUALS.md); do not create or approve a clinical statement while editing its format.

## Make one small JSON edit

1. Ask the builder to prepare an isolated task branch from `staging`, or use the prepared branch they identify. Do not edit `main` or `legacy/*`.
2. Open the existing file. JSON uses named fields, not spreadsheet columns. Change the intended text value and keep the surrounding quotes, commas and brackets.
3. Preserve the file name and existing item ids. New ids must follow the collection's rules and be unique within the relevant list. Copying an item also copies its id, so give a genuinely new item a new id.
4. Save and ask for the checks below. Do not remove a failing check or change a sample's status just to make the check pass.

For lessons, each entry in `sentences` has `id` and `text`. Keep `text` nonblank and at most 400 characters. Lesson `title` is 1–120 characters, `summary` is at most 300, and `order` is a positive whole number. A lesson needs at least one sentence.

For cards, each entry has `id`, `front` and `back`. The front is 1–300 characters; the back is 1–600. If the optional `blank` field is present, it must contain 1–120 characters after trimming and appear in the back **exactly as written**. Changing the back may require changing or removing that optional blank.

For fill-in samples, each item has an `id` and a `sentence` with exactly one missing part inside double brackets. Optional `distractors` provide extra choices. Organizer items point to a listed group through `group`; changing a group id requires updating its references. Image labels need percentage boxes that remain inside the image and an image credit. Use [Content formats](CONTENT-FORMAT.md) for their full field rules rather than guessing from another activity.

For video details, keep both `captionsUrl` and `transcriptUrl` fields, even when their values are empty strings. The video id has exactly 11 allowed characters; a full watch-page URL is not an id. Nonempty caption/transcript links must be HTTPS or same-site paths. Thumbnails are self-hosted files. Only published videos appear through the normal lesson-video path.

### What status means

| Collection | Allowed values | Editing consequence |
| --- | --- | --- |
| Lessons and cards | `placeholder`, `sample`, `draft`, `in_review`, `published` | Preserve visible sample/placeholder labels. Draft and review text stays private until approved for public release |
| Organizer, fill-in, label-it and public sample questions | `sample` | These files are sample activities; changing the word to `published` does not create a supported real-content format |
| Pulse, triage, crossword and word-path samples | `sample` | Keep everyday samples labeled; real daily answers stay private |
| Hello cards | `sample`, `approved` | Keep sample text labeled until approved |
| Videos | `placeholder`, `draft`, `in_review`, `published` | Normal lesson pages show published videos |
| Visual records | `draft`, `approved` | Teaching visuals require source/rights review and approval |

There is no universal status list. A valid status is not a release approval. Preview-only features have their own build gates, so ask the builder which page and build were checked.

## If you are editing a CSV

Save as CSV UTF-8. Keep the header row and one record per row. Use a spreadsheet application's CSV export so commas, quotes and line breaks inside text remain properly quoted. Do not insert a second header row into the middle of a file. Keep ids as text and do not let the spreadsheet turn them into dates or numbers.

### Lesson outline columns

`docs/curriculum/medsurg-lesson-map.csv` has this exact header and order:

```text
lesson_id,unit,unit_code,topic,lesson,unit_note,status
```

`lesson_id` identifies the lesson; `unit_code` identifies its unit. `unit`, `topic` and `lesson` hold the outline names. `unit_note` and `status` are planning information; they do not replace the lesson JSON's publication status. Keep the existing ids stable. Request a map review before adding or moving a lesson so its unit/topic relationships and companion files stay consistent.

### Private question-batch columns

Each batch is a separate local folder under `content/batches/`. Git ignores its contents, but that is not permission to share it through an issue, MR attachment or another public folder. Do not override the ignore rule.

| File | Columns and purpose |
| --- | --- |
| `items.csv` | `item_id`, `concept_id`, `stem`, `choice_a`, `choice_b`, `choice_c`, `choice_d`, `rationale`, `fact_ids`, `source_ids`; per-choice `rationale_a` through `rationale_d` are also required by validation. Optional `choice_e` needs `rationale_e` when used. Optional `type` is blank/`single` or `sata` |
| `key.csv` | `item_id`, `answer`; only the private answer key goes here |
| `facts.csv` | `fact_id`, `source_id`; connects each fact to its source |
| `sources.csv` | `source_id`, `url`; links must be valid HTTPS addresses. The importer additionally needs `title`, `publisher`, `license` for a new source |
| `reviewers/<name>.csv` | `item_id`, `answer`, `verdict`; optional `notes`. Use only reviewer names allowed in [Content batches](BATCHES.md) |
| `concepts.csv` | Optional importer file: `concept_id`, `title` for new concepts |

Keep an `item_id` forever and do not reuse it for a different question. In list cells such as `fact_ids` and `source_ids`, separate ids with semicolons. A select-all answer also uses semicolon-separated letters. Every offered choice needs its own rationale. At least five allowed reviewer files are required, and every reviewer must agree with the key and mark the item `pass`; a majority does not pass it. Do not fill in another person's review or replace a `pending` verdict yourself.

## Ask the builder to check before review

You can send: “Please check my content edit on this task branch, tell me each file/field to fix, and show it on staging before release.” No secret or private batch contents need to be pasted into that message.

For public collection files, the builder runs these commands from the Cueory project folder, using its pinned Node and existing dependencies:

```sh
node scripts/check-content.mjs
npm run check-sample-content
npm run check
npm run build
npx vitest run
```

The first command reads the actual collection schemas and lesson-map relationships. It writes nothing and reports `no problems found` on success. A file/field message means fix that field and rerun. The sample-content command is an additional protected-field scan; it is not a complete guarantee that material is safe to publish. The build and full unit suite remain required. The builder also checks affected pages by keyboard and touch on phone, tablet and desktop in Light and Evening.

For a private batch, run the separate checker locally:

```sh
npm run check-batch -- content/batches/<your-batch-folder>
```

It writes `passed.csv`, `failed.csv`, `pending.csv` and `report.md` in the batch folder by default. Read the report rather than editing the result files. Exit 0 means every item passed the mechanical checks; exit 1 means an item failed or is pending; exit 2 means the batch itself is malformed. Fix source files and rerun after any edit, including an answer-key or review change. The checker does not decide whether a clinical fact is correct. Import and publication are separate, authorized steps described in [Content batches](BATCHES.md); this guide does not ask you to run an import or change database settings.

## Review the result on staging

Ask for the MR link, exact tested commit, check results and affected page addresses. Confirm the intended wording, ordering, labels and companion activities there. A green preview deployment alone is not proof the tests ran. If a page is blank or an activity is missing, report its address and what you expected; do not change ids/statuses at random. If a check finds a pre-existing problem on unchanged staging, the builder should show that evidence separately.

Approving the wording and merging/releasing are separate actions. The builder does not merge this content for you. Keep the private question workflow private throughout review.

## What this guide is based on

The current field definitions are in `src/content.config.ts`, `src/videos/schema.ts` and `src/islands/lessonmap.ts`. Private CSV rules are in `scripts/check-batch/check.ts` and `scripts/check-batch/csv.ts`. The commands are in `package.json`, `scripts/check-content.mjs` and `scripts/check_batch.ts`.

Existing regression tests include `tests/unit/check-content.test.ts`, `content-format-doc.test.ts`, `content-lesson-ids.test.ts`, `content-labels.test.ts`, `game-samples-schema.test.ts` and the batch checker suites. These are format and behavior checks, not clinical review. For the complete field reference, use [Content formats](CONTENT-FORMAT.md); for private batches, use [Content batches](BATCHES.md).
