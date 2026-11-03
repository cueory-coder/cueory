# Task 524 — Curriculum data (draft 4)

- **Status:** IN_REVIEW — branch `task-524/curriculum-data` into `staging`.
- **Changes:**
  - Added `content/curriculum/blocks-v4.csv` and `content/curriculum/objectives-pilot-v4.csv` as provided by the lead on issue #225.
  - Added curriculum integrity validator at `scripts/check-curriculum.mjs` ensuring:
    - Block IDs match `^(M\d\d|MH\d|MM\d|X1)-L\d\d$` with no duplicate block IDs.
    - Objectives reference existing blocks and unique objective IDs.
    - `required_before` prerequisite references exist with no cyclical dependency.
  - Added unit test at `tests/unit/check-curriculum.test.ts`.
  - Preserved `docs/curriculum/medsurg-lesson-map.csv` and legacy parsers untouched.
