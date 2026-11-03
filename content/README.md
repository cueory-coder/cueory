# Content

Content is data, not code. Edit these files to change what students see; no programming needed.

## How to add a lesson in 3 steps

1. **Name the files after the lesson.** Find the lesson's id in
   [docs/curriculum/medsurg-lesson-map.csv](../docs/curriculum/medsurg-lesson-map.csv) and write it in lowercase:
   lesson `U00-T01-L01` is `u00-t01-l01.json`. Put `lessons/u00-t01-l01.json` in this folder, plus any of
   `cards/`, `fill-in/` and `organizer/` with the same name (the table below says what each one makes). Start with
   `"status": "draft"`, so nothing shows yet (fill-in and organizer files can only be `"sample"` for now). A draft stays
   on your computer: this repository is public, so unreleased lessons never go into it (CLAUDE.md rule 7).
2. **Check them.** In the cueory folder, run `node scripts/check-content.mjs` (or ask Claude to). It reads every file
   here with the same rules the build uses and prints one line per problem, with the file and what to fix, for
   example `content/cards/u00-t01-l01.json: card 4 has no back text`. Fix each line and run it again until it says
   "no problems found". It also lists which lessons become pages, which show as labeled samples and which are drafts
   that won't appear.
3. **Publish.** When you have approved the text, change `"status"` to `"published"` in each file, run the check once
   more, and hand the files to Claude to send for review. Only published files go into the repository. The lesson appears on the staging site first, then on the
   live site when you merge the release.

Drop the files in and the site builds the pages on its own; no page or code needs editing.

| File | Makes |
| --- | --- |
| `lessons/u00-t01-l01.json` (needed) | the lesson page, `/learn/u00-t01-l01`, with its reader |
| `cards/u00-t01-l01.json` | the cards, learn mode and matching pages for it |
| `fill-in/u00-t01-l01.json` | its fill-in page |
| `organizer/u00-t01-l01.json` | its organizer page |
| `videos/u00-t01-l01.json` | its video, once the video's status allows it |

Each cards, fill-in and organizer file says which lesson it belongs to in its `lesson` field (`"lesson":
"u00-t01-l01"`). The lesson page shows a tile for each study mode that has a file, and the course library (`/learn`)
lists the lesson and links to it from its unit. The unit and topic names on the page come from the lesson map.

The `status` field decides whether a file appears:

- `published`: you approved it. It appears normally.
- `placeholder` or `sample`: it appears with its label ("these cards are placeholders", "this is a sample…") (D-92).
- `draft` or `in_review`: it never appears. A lesson that doesn't appear takes its cards and sets with it.

Only approved, public text goes in this folder (CLAUDE.md rule 7): lessons and cards (your decision of 2 Nov 2026).
Questions, answer keys and rationales never do; they go through a batch into the database. Fill-in and organizer
files can only be `sample` for now, so real ones aren't possible yet (see the Task 300 note).

The build stops with a plain message if a file name isn't a lesson id in the map, if a file names a lesson that has no
lesson file, or if one lesson has two files of the same kind. The older study-skills lesson (`study-skills-01`) keeps
its address, `/learn/study-skills`, and its label it and sample questions pages.

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
