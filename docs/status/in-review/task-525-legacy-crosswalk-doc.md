# Task 525 — Legacy ID crosswalk doc

- **Status:** IN_REVIEW — branch `task-525/legacy-crosswalk-doc` into `staging`.
- **Changes:**
  - Added `docs/curriculum/CROSSWALK.md` mapping all 351 legacy `Uxx-Txx-Lxx` lesson IDs from `docs/curriculum/medsurg-lesson-map.csv` to Draft 4 block IDs (`content/curriculum/blocks-v4.csv`).
  - Rows include an action column (`retain` / `split` / `merge` / `move` / `retire`) and mark unresolved mappings with `?` for lead decision.
  - Documentation-only change with no runtime, database, or build modifications.
