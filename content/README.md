# Content

Content is data, not code. Edit these files to change what students see; no programming needed.

- `lessons/` — one JSON file per lesson. Each sentence is one short, standalone idea.
  The build checks every file and stops with a clear message if something is missing.
- `cards/` — one JSON file per lesson's card deck. `lesson` is the lesson's file name without `.json`; each card has a
  `front` and a `back`. Checked the same way.
- `organizer/` — one JSON file per lesson's organizer set: 2 to 4 `groups` and 4 to 12 `items`, each item naming
  the group it belongs to. Checked by the build and again by the page. For now each set is an everyday `sample`, and
  the page says so; no clinical facts.
- `fill-in/` — one JSON file per lesson's fill-in set: `items`, each with an `id` and a `sentence` that wraps its one
  missing word in double brackets, like `Bees make [[honey]] from flowers.` Checked by the build. For now each set is an
  everyday `sample`, and the page says so.
- `label-it/` — one JSON file per lesson's "label it" set: an `image` (its file on this site, alt text, size and a
  required `credit`) and `labels`, each a box in percentages of the image with the text it covers. Checked by the
  build. For now the only image is an everyday sample drawn for Cueory; real diagrams need a rights record first.
- `questions/` — sample questions only, one JSON file per lesson: `items` with a stem, two to five choices, the `key`
  and a rationale per choice, every item marked `sample`. Real questions never go here: their keys stay in the
  database (D-33).
- `games/pulse/` — sample puzzles for the pulse word game on `/play`, one JSON file each: an everyday `word` (five to
  seven lowercase letters) and its one-line `cue`. They are labeled samples on the page. Real puzzles are nursing
  content whose answers are answer keys, so they never go here (D-61).
- `games/triage/` — sample puzzles for the triage sorting game, one JSON file each: three `groups`, each with a
  lowercase `name` and exactly three `terms`, and one `oddOne` that belongs to none of them. Every term appears once.
  Everyday words only, labeled as samples on the page (D-63).
- `visuals/` — one JSON file per teaching picture in the visuals kit ([docs/VISUALS.md](../docs/VISUALS.md)): its
  labels, what the drawing shows, and for each one the exact words of the cited open book with the page address. The
  build checks every file. Only a file marked `"status": "approved"` can appear on a page.
- `games/cueword/` — sample puzzles for the small crossword, one JSON file each: a `grid` of 3 to 7 rows of equal
  length (capital letters, `.` for a gap) and its `clues`, `across` and `down`, each numbered the usual way. The build
  checks every file with the game's own rules (every word has exactly one clue). Everyday words only, labeled as
  samples on the page (D-70).
- `games/suture/` — sample puzzles for word path, one JSON file each: a `grid` of capital letters (3 to 7 rows of equal
  length) and its `words`, each with a lowercase `cue`, its `answer` and the `path` of `[row, column]` cells it runs
  through, up, down, left or right, never diagonally, with no cell shared. The build checks every file with the game's
  own rules. Everyday words only, labeled as samples on the page (D-71).
- `batches/` — one folder per review batch (format and checker: [docs/BATCHES.md](../docs/BATCHES.md)). Git ignores
  everything here, so batches stay on your computer.

Never put answer keys or reviewer results in this repository while it is (or might become) public. From Task 2 they
live only in the database (see docs/DECISIONS.md, D-07).
