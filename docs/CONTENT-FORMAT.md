# Content formats

Content is data, not code. The build validates the JSON collections in `src/content.config.ts`. Keep public repository content labeled as a sample or placeholder where the schema requires it. Real questions, answer keys, rationales, unreleased lessons, and reviewer results do not belong in this repository.

## Quick rules

- Use JSON files in the collection directory named by the format.
- Keep ids lowercase with letters, digits, and dashes where the schema requires that pattern.
- Do not add fields that the schema does not accept.
- Run `npm run check` and `npm run build` after changing content. The build runs the collection schemas and the game-specific checks.
- Use everyday sample material only in the public sample collections. Nursing content and answer data follow the private review and database process described in `SECURITY.md` and `docs/BATCHES.md`.

## Lessons

Directory: `content/lessons/*.json`

A lesson has `course`, positive integer `order`, `title`, `summary`, a workflow `status`, and at least one sentence. The allowed status values are `placeholder`, `draft`, `in_review`, and `published`. Each sentence has a lowercase `id` and non-empty `text`.

```json
{
  "course": "sample-course",
  "order": 1,
  "title": "Sample lesson",
  "summary": "A short sample summary.",
  "status": "placeholder",
  "sentences": [
    { "id": "sample-s01", "text": "One standalone sample sentence." }
  ]
}
```

## Card decks

Directory: `content/cards/*.json`

A deck has a `lesson` id, `title`, workflow `status`, and at least one card. Every card has a lowercase `id`, `front`, and `back`. The optional `blank` must occur exactly as written within the card back's text.

```json
{
  "lesson": "sample-course-lesson-01",
  "title": "Sample lesson cards",
  "status": "placeholder",
  "cards": [
    { "id": "sample-c01", "front": "Sample front.", "back": "Sample back." }
  ]
}
```

## Study-mode sample sets

These collections use one file per lesson and require `"status": "sample"`.

### Organizer

Directory: `content/organizer/*.json`

The object has `lesson`, `status`, `title`, two to four unique `groups`, and four to twelve unique `items`. Each item names an existing group through `group`. The group id `tray` is reserved.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "title": "sample: sort the things",
  "groups": [{ "id": "one", "name": "one" }, { "id": "two", "name": "two" }],
  "items": [{ "id": "item-a", "text": "item a", "group": "one" }]
}
```

The real file must contain enough items to satisfy the minimum and every item must point to a listed group.

### Fill-in

Directory: `content/fill-in/*.json`

The object has `lesson`, `status`, and one to thirty unique `items`. Each item has an id and one sentence with exactly one missing word wrapped in double brackets.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "items": [
    { "id": "sample-item", "sentence": "A sample sentence with [[one]] missing word." }
  ]
}
```

### Label it

Directory: `content/label-it/*.json`

The object has `lesson`, `status`, an on-site `image`, and `labels`. The image needs a site-relative file path, alt text, positive width and height, and a non-empty credit. Each label has an id, text, and percentage box coordinates. The label parser performs additional geometry checks.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "image": {
    "src": "/sample/diagram.svg",
    "alt": "an everyday sample diagram",
    "width": 800,
    "height": 600,
    "credit": "drawing: Cueory sample"
  },
  "labels": [
    { "id": "part-a", "text": "part a", "x": 10, "y": 10, "w": 20, "h": 10 }
  ]
}
```

### Questions

Directory: `content/questions/*.json`

The object has `lesson`, `status`, and one to thirty `items`. The collection and every item must be marked `sample`. Each item has a type of `single` or `sata`, two to five choices with unique ids from `a` through `e`, a non-empty `key`, and a rationale record. The sample checker verifies that the answer data matches the public sample choices.

```json
{
  "lesson": "sample-course-lesson-01",
  "status": "sample",
  "items": [{
    "id": "sample-question",
    "status": "sample",
    "type": "single",
    "stem": "Which sample choice is correct?",
    "choices": [{ "id": "a", "text": "choice a" }, { "id": "b", "text": "choice b" }],
    "key": ["a"],
    "rationales": { "a": "Sample explanation.", "b": "Sample explanation." }
  }]
}
```

## Sample games

All game collections below require `"status": "sample"`. Keep their words and clues everyday and non-clinical.

- `content/games/pulse/*.json`: `word` is five to seven lowercase letters and `cue` is a short non-empty string.
- `content/games/triage/*.json`: three named groups, each with exactly three unique terms, plus one `oddOne` that is not in any group.
- `content/games/cueword/*.json`: a three-to-seven-row grid of equal-length uppercase rows using letters and dots, plus numbered `across` and `down` clues. The game parser also checks that the clues match the grid.
- `content/games/suture/*.json`: a `theme`, an uppercase grid, and at least three words. Each word has an uppercase `answer` and a row/column `path`; adjacent path cells cannot move diagonally or share a cell. A cue is optional.

Example pulse file:

```json
{ "status": "sample", "word": "grace", "cue": "a sample one-line cue." }
```

## Visuals

Directory: `content/visuals/*.json`

A visual has an id, title, kind (`diagram`, `model`, or `overlay`), one or more lesson ids in the `U00-T00-L00` form, a `status` of `draft` or `approved`, labels, depictions, and cited sources. Labels and depictions point to source ids. Every source includes a quote, book, section, HTTPS URL, license, and retrieval date. The visual-source checker applies additional rules. Only an approved visual can appear on a page.

Do not copy a clinical example into this guide. Use an existing reviewed source record and follow `docs/VISUALS.md` when preparing a real visual.

## Videos

Directory: `content/videos/**/*.json`

A video has `lesson`, `title`, `status`, and the fields required by `src/videos/schema.ts`: a YouTube `videoId` or clearly labeled placeholder, plus optional captions and transcript URLs. Videos appear on lesson pages only when their status is `published`.

```json
{
  "lesson": "sample-course-lesson-01",
  "title": "Sample lesson video",
  "status": "draft",
  "videoId": "xxxxxxxxxxx",
  "captionsUrl": "",
  "transcriptUrl": ""
}
```

## Break ideas

File: `content/breaks/ideas.json`

This file is imported directly by `src/pages/breaks.astro`, rather than through the Astro collection map. It contains `sample: true` and an `ideas` array. Every idea has a unique lowercase id and non-empty text.

## Review batches

`content/batches/` is reserved for local review batches and is ignored by git. Its CSV format, answer-key boundary, reviewer files, and checker commands are documented in `docs/BATCHES.md`. Do not place batch files in a pull request or put answer keys and reviewer results in the public repository.
