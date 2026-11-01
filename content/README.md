# Content

Content is data, not code. Edit these files to change what students see; no programming needed.

- `lessons/` — one JSON file per lesson. Each sentence is one short, standalone idea.
  The build checks every file and stops with a clear message if something is missing.
- `cards/` — one JSON file per lesson's card deck. `lesson` is the lesson's file name without `.json`; each card has a
  `front` and a `back`. Checked the same way.
- `games/pulse/` — sample puzzles for the pulse word game on `/play`, one JSON file each: an everyday `word` (five to
  seven lowercase letters) and its one-line `cue`. They are labeled samples on the page. Real puzzles are nursing
  content whose answers are answer keys, so they never go here (D-61).
- `games/triage/` — sample puzzles for the triage sorting game, one JSON file each: three `groups`, each with a
  lowercase `name` and exactly three `terms`, and one `oddOne` that belongs to none of them. Every term appears once.
  Everyday words only, labeled as samples on the page (D-63).
- `games/cueword/` — sample puzzles for the small crossword, one JSON file each: a `grid` of 3 to 7 rows of equal
  length (capital letters, `.` for a gap) and its `clues`, `across` and `down`, each numbered the usual way. The build
  checks every file with the game's own rules (every word has exactly one clue). Everyday words only, labeled as
  samples on the page (D-70).
- `batches/` — one folder per review batch (format and checker: [docs/BATCHES.md](../docs/BATCHES.md)). Git ignores
  everything here, so batches stay on your computer.

Never put answer keys or reviewer results in this repository while it is (or might become) public. From Task 2 they
live only in the database (see docs/DECISIONS.md, D-07).
