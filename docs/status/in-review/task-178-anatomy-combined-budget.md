# Task 178 — truthful whole-body triangle notice

status: In review on a branch stacked on Task 178's anatomy lab (#290). The 150,000-triangle phone budget is defined per model GLB in `src/islands/bodyviewer-logic.ts` and `scripts/build-anatomy.mjs`. The Anatomy Lab previously checked the accumulated triangle total of the whole-body view against that per-file limit and incorrectly called a valid multi-file load an oversized single model.

change: Use a pure, unit-tested `anatomyTriangleNote` helper. Single-system and one-file views retain the original per-model check. Once multiple files are loaded in the whole-body view, show the accumulated loaded triangle count with an explicit per-file budget explanation and a phone performance caution. A real-model browser regression checks skin (one file) followed by peeling to muscle (two files).

safety: No clinical facts, model binaries, structure labels, approval gates, database, security or deployment settings were changed. This messaging correction does **not** enforce an aggregate phone performance limit or approve any draft anatomy model.

release: Await GitHub CI, Codex review and the lead's integration review. Keep the anatomy lab behind its existing preview and approval gates. Do not merge to `main` or publish draft anatomy assets.
