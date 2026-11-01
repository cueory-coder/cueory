# Med-surg lesson map

The master list of lessons Cueory will build, in the order they build on each other: ADPIE and the NCSBN clinical
judgment model first, then body systems, pharmacology threads, advanced med-surg (critical care and emergencies),
mental health, and exit-exam readiness.

- `medsurg-lesson-map.drawio` is the picture. Open it at app.diagrams.net (File, Open from, Device). Left to right:
  unit, topic, lesson.
- `medsurg-lesson-map.csv` is the same list as data: 19 units, 93 topics and 351 lessons, one row per lesson, with a
  stable `lesson_id` (for example `U03-T02-L01`). The `status` column starts at `not started`.

## Rules for using it

- This is an outline of topics only. It contains no clinical facts. Lesson content comes through the content pipeline
  (source brief, reviewers, approval) and never straight from this file.
- Keep `lesson_id` values stable. Add a new lesson at the end of its topic, or add a new topic, rather than renumbering.
- Higher-risk topics (first actions, dosing, emergencies, delegation) wait for a qualified reviewer even when the lesson
  is otherwise ready (docs/BATCHES.md and the content review policy).
- Exam weighting numbers in the picture come from the NCSBN RN test plan (2023). Check the current plan before quoting
  them anywhere public.
- Suggested build order: units 00 and 01 first (every later lesson leans on them), then the systems in the order shown.
