# Content formats

Content is data, not code. The build validates the JSON collections in `src/content.config.ts`. Keep public repository content labeled as a sample or placeholder where the schema requires it. Real questions, answer keys, rationales, unreleased lessons, and reviewer results do not belong in this repository.

## Quick rules

- Use JSON files in the collection directory named by the format.
- Keep ids lowercase with letters, digits, and dashes where the schema requires that pattern.
- Do not add fields that the schema does not accept.
- Run `node scripts/check-content.mjs`, then `npm run check` and `npm run build` after changing content. The build runs the collection schemas and the game-specific checks.
- Use everyday sample material only in the public sample collections. Nursing content and answer data follow the private review and database process described in `SECURITY.md` and `docs/BATCHES.md`.

## Lessons

Directory: `content/lessons/*.json`

A lesson needs `course`, positive integer `order`, `title` (1–120 characters), `summary` (up to 300 characters, which may be empty), workflow `status`, and at least one `sentences` item. Its id comes from the file name, not an `id` field in JSON. The allowed status values are `placeholder`, `sample`, `draft`, `in_review`, and `published`. Each sentence needs a unique lowercase `id` and `text` (1–400 characters, not only spaces).

```json
{
  "course": "sample-course",
  "order": 1,
  "title": "[sample lesson]",
  "summary": "[sample summary]",
  "status": "sample",
  "sentences": [
    { "id": "sample-s01", "text": "[sample sentence]" }
  ]
}
```

## Card decks

Directory: `content/cards/*.json`

A deck needs `lesson` (the lesson file name without `.json`), `title` (1–120 characters), `status`, and at least one `cards` item. Allowed statuses are `placeholder`, `sample`, `draft`, `in_review`, `published`. Each card needs unique lowercase `id`, `front` (1–300 characters), and `back` (1–600 characters). Optional `blank` is 1–120 characters after trimming and must appear exactly in `back`.

```json
{
  "lesson": "sample-course-lesson-01",
  "title": "[sample cards]",
  "status": "sample",
  "cards": [
    { "id": "sample-c01", "front": "[sample front]", "back": "[sample back]", "blank": "sample" }
  ]
}
```

## Study-mode sample sets

These collections use one file per lesson and require `"status": "sample"`.

### Organizer

Directory: `content/organizer/*.json`

The object has `lesson`, `status`, `title`, two to four unique `groups`, and four to twelve unique `items`. Each item names an existing group through `group`. The group id `tray` is reserved. Group names are 1–200 characters and item text is 1–1,000 characters. Organizer ids use lowercase letters, digits and single dashes between parts.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "title": "sample: sort the things",
  "groups": [{ "id": "one", "name": "one" }, { "id": "two", "name": "two" }],
  "items": [
    { "id": "item-a", "text": "[sample item]", "group": "one" },
    { "id": "item-b", "text": "[sample item]", "group": "two" },
    { "id": "item-c", "text": "[sample item]", "group": "one" },
    { "id": "item-d", "text": "[sample item]", "group": "two" }
  ]
}
```

The real file must contain enough items to satisfy the minimum and every item must point to a listed group.

### Fill-in

Directory: `content/fill-in/*.json`

The object has `lesson`, `status`, and one to thirty unique `items`. Each item has unique lowercase `id` and `sentence` (1–400 characters) with exactly one missing word in double brackets. Optional `distractors` lists extra choices, each 1–200 characters.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "items": [
    { "id": "sample-item", "sentence": "[sample] [[word]] [sample].", "distractors": ["[sample option]"] }
  ]
}
```

### Label it

Directory: `content/label-it/*.json`

The object has `lesson`, `status`, an on-site `image`, and `labels`. The image needs a site-relative file path, alt text, positive width and height, and a non-empty credit. Each label has an id, text, and percentage box coordinates. Image `src` must be a same-site file ending in `.svg`, `.png`, `.webp` or `.jpg`. `alt` and `credit` are 1–300 characters. Each label needs a unique `id`, non-empty `text`, and numeric `x`, `y`, `w`, `h` percentages between 0 and 100. A box must have positive width and height and remain inside the image.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "image": {
    "src": "/sample/diagram.svg",
    "alt": "[sample image]",
    "width": 800,
    "height": 600,
    "credit": "[sample credit]"
  },
  "labels": [
    { "id": "part-a", "text": "[sample label]", "x": 10, "y": 10, "w": 20, "h": 10 }
  ]
}
```

### Questions

Directory: `content/questions/*.json`

The object has `lesson`, `status`, and one to thirty `items`. The collection and every item must be marked `sample`. Each item has a type of `single` or `sata`, two to five choices with unique ids from `a` through `e`, a non-empty `key`, and a rationale record. Every item also needs unique lowercase `id`, `stem` (1–400 characters), and `status` of `sample`. Every choice needs `id` and `text` (1–300 characters). `key` lists matching letters and `rationales` needs a non-empty explanation (up to 400 characters) for every choice. The sample checker verifies keys and type. Real question data stays private.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "items": [{
    "id": "sample-question",
    "status": "sample",
    "type": "single",
    "stem": "[sample stem]",
    "choices": [{ "id": "a", "text": "[sample choice]" }, { "id": "b", "text": "[sample choice]" }],
    "key": ["a"],
    "rationales": { "a": "[sample rationale]", "b": "[sample rationale]" }
  }]
}
```

## Sample games

All game collections below require `"status": "sample"`. Keep their words and clues everyday and non-clinical.

- `content/games/pulse/*.json`: `status`, `word` of 5–7 lowercase letters, and `cue` of 1–120 characters.
- `content/games/triage/*.json`: `status`, exactly three `groups` each with lowercase `name` (up to 32 characters) and three `terms` (up to 24 characters), and an `oddOne` term. All ten terms must differ.
- `content/games/cueword/*.json`: `status`, `grid` (3–7 rows of 3–7 uppercase letters or dots), and `clues` with `across` and `down` lists. Every clue has positive whole-number `number` and `text` (1–120 characters). The game parser checks the grid matches.
- `content/games/suture/*.json`: `status`, `theme` (1–60 characters), uppercase `grid` (3–11 rows of 3–11 letters), and `words` (3–20). Each word needs uppercase `answer` (3–11 letters) and a `path` of zero-based row/column pairs. Optional `cue` is 1–120 characters. The game checker validates paths.

Example pulse file:

```json
{ "status": "sample", "word": "sample", "cue": "[sample clue]" }
```

## Hello cards

Directory: `content/games/hello-cards/*.json`

Required `status` (`sample` or `approved`) and `starters` (at least 3). Optional `note` is up to 300 characters. Every starter requires unique lowercase `id` containing a dash, `category` (`patients`, `coworkers`, `classmates`, `yourself`), `depth` (`small`, `deep`) and `text` (5–140 characters). Every category needs both depths, so a complete file has at least eight starters. Use `[sample text]` until approved.

## Visuals

Directory: `content/visuals/*.json`

A visual has an id, title, kind (`diagram`, `model`, or `overlay`), one or more lesson ids in the `U00-T00-L00` form, a `status` of `draft` or `approved`, labels, depictions, and cited sources. Labels and depictions point to source ids. Every source includes a quote, book, section, HTTPS URL, license, and retrieval date. Every label has `id`, `text` (1–120 characters), `source`, plus optional `group` (1–120 characters) and `layer` (`skin`, `muscle`, `nerves`, `vessels`, `organs`, `skeleton`). Depictions have `id`, `what` (1–300 characters), `source`. Each source needs `id`, `quote` (1–1,000 characters), `book`, `section` (1–200 characters), HTTPS `url`, `license`, and `retrieved` (`YYYY-MM-DD`). Optional `model` has required `file`, `release` and optional `via`. Extra model and source checks apply. Only approved visuals appear.

Do not copy a clinical example into this guide. Use an existing reviewed source record and follow `docs/VISUALS.md` when preparing a real visual.

## Videos

Directory: `content/videos/**/*.json`

A video requires `lesson`, `title` (1–120 characters), `status` (`placeholder`, `draft`, `in_review`, `published`), `videoId` (exactly 11 letters, digits, `_` or `-`), `captionsUrl`, and `transcriptUrl`. Both URL fields must be present even when empty (`""`). Non-empty URLs must be HTTPS or same-site `/` paths. Optional `thumbnail` must point to a self-hosted `.png`, `.jpg`, `.jpeg`, `.webp`, `.avif` or `.svg`. Only published videos appear.

```json
{
  "lesson": "sample-course-lesson-01",
  "title": "[sample video]",
  "status": "placeholder",
  "videoId": "xxxxxxxxxxx",
  "captionsUrl": "",
  "transcriptUrl": "",
  "thumbnail": "/sample/thumbnail.png"
}
```

## Break ideas

File: `content/breaks/ideas.json`

This file is imported directly by `src/pages/breaks.astro`, rather than through the Astro collection map. It contains `sample: true` and an `ideas` array. Every idea has a unique lowercase id and non-empty text.

## Review batches

`content/batches/` is reserved for local review batches and is ignored by git. Its CSV format, answer-key boundary, reviewer files, and checker commands are documented in `docs/BATCHES.md`. Do not place batch files in a pull request or put answer keys and reviewer results in the public repository.

## Schema field index

All JSON keys in the collection schemas are listed here. `[]` means an item in a list and `?` marks an optional key. `tests/unit/content-format-doc.test.ts` compares this index with the schemas. Break ideas are not an Astro collection.

<!-- FIELD-INDEX: START -->
| Collection | Fields |
| --- | --- |
| `lessons` | `course`, `order`, `title`, `summary`, `status`, `sentences`, `sentences[].id`, `sentences[].text` |
| `cards` | `lesson`, `title`, `status`, `cards`, `cards[].id`, `cards[].front`, `cards[].back`, `cards[].blank?` |
| `pulse` | `status`, `word`, `cue` |
| `triage` | `status`, `groups`, `groups[].name`, `groups[].terms`, `oddOne` |
| `cueword` | `status`, `grid`, `clues`, `clues.across`, `clues.across[].number`, `clues.across[].text`, `clues.down`, `clues.down[].number`, `clues.down[].text` |
| `suture` | `status`, `theme`, `grid`, `words`, `words[].cue?`, `words[].answer`, `words[].path` |
| `hello-cards` | `status`, `note?`, `starters`, `starters[].id`, `starters[].category`, `starters[].depth`, `starters[].text` |
| `organizer` | `lesson`, `status`, `title`, `groups`, `groups[].id`, `groups[].name`, `items`, `items[].id`, `items[].text`, `items[].group` |
| `fill-in` | `lesson`, `status`, `items`, `items[].id`, `items[].sentence`, `items[].distractors?` |
| `label-it` | `lesson`, `status`, `image`, `image.src`, `image.alt`, `image.width`, `image.height`, `image.credit`, `labels`, `labels[].id`, `labels[].text`, `labels[].x`, `labels[].y`, `labels[].w`, `labels[].h` |
| `questions` | `lesson`, `status`, `items`, `items[].id`, `items[].status`, `items[].type`, `items[].stem`, `items[].choices`, `items[].choices[].id`, `items[].choices[].text`, `items[].key`, `items[].rationales` |
| `visuals` | `id`, `title`, `kind`, `lessonIds`, `status`, `labels`, `labels[].id`, `labels[].text`, `labels[].source`, `labels[].group?`, `labels[].layer?`, `depictions`, `depictions[].id`, `depictions[].what`, `depictions[].source`, `sources`, `sources[].id`, `sources[].quote`, `sources[].book`, `sources[].section`, `sources[].url`, `sources[].license`, `sources[].retrieved`, `model?`, `model.file`, `model.release`, `model.via?` |
| `videos` | `lesson`, `title`, `status`, `videoId`, `captionsUrl`, `transcriptUrl`, `thumbnail?` |
<!-- FIELD-INDEX: END -->
