# Content

Content is data, not code. Edit these files to change what students see; no programming needed.

- `lessons/` — one JSON file per lesson. Each sentence is one short, standalone idea.
  The build checks every file and stops with a clear message if something is missing.
- `cards/` — one JSON file per lesson's card deck. `lesson` is the lesson's file name without `.json`; each card has a
  `front` and a `back`. Checked the same way.
- `batches/` — CSV batches of questions, cards and scripts for review and import (Task 2 and Task 3).

Never put answer keys or reviewer results in this repository while it is (or might become) public. From Task 2 they
live only in the database (see docs/DECISIONS.md, D-07).
