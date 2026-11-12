# Daily puzzle runway

This shows **how many different sample puzzles are left** before the current sample list starts repeating. It does **not** count reviewed daily puzzles in the private database.

## Check the latest numbers

On a computer with the Cueory repository and the required Node version, run this from the project folder:

```sh
node --experimental-strip-types src/content/runway.ts
```

Each line gives a game, how many fresh sample days remain **including today**, the first and last days in its initial window, and the number of problems detected. Run it again when new sample files are added.

## Current sample inventory (November 11, 2026)

| Game on site | Public sample files | First fresh day | Last fresh day | Fresh days left on Nov 11 |
| --- | ---: | --- | --- | ---: |
| pillo (folder `pulse`) | 10 | Nov 1 | Nov 10 | 0 |
| crossword easy (folder `cueword`, level `easy`) | 1 | Nov 1 | Nov 1 | 0 |
| crossword mid (folder `cueword`, level `mid`) | 1 | Nov 1 | Nov 1 | 0 |
| crossword hard (folder `cueword`, level `hard`) | 1 | Nov 1 | Nov 1 | 0 |
| sudoku | Not file-based | No end date | No end date | No file limit |
| word path (folder `suture`) | 5 | Nov 1 | Nov 5 | 0 |

The site offers three separate crossword difficulty choices: easy (5 × 5), mid (7 × 7) and hard (15 × 15). It filters samples by level **before** choosing today's puzzle. Each level currently has one sample and therefore repeats from November 2 onward. The six older crossword samples have no difficulty label and are not selected by the current level chooser. The runway tracks the three active pools independently, using each pool's sorted positions rather than the shared filenames' global numbers. Missing per-level numbered dates cannot be inferred from globally numbered files, but invalid files and repeated playable grids in a pool are still reported.

The old `triage` folder has **7** sorting-game samples, with a first window of **November 1–7, 2026**. Those files are **not** used by the current Sudoku game. `stat` and `hello-cards` are other games and are not part of this four-game daily puzzle runway.

## How this works

- The sample rotation starts on **November 1, 2026**, using the visitor's local calendar date.
- The site sorts a game's sample filenames and uses one per day (within a selected crossword level, where applicable). Once it reaches the end, it goes back to the first file. A repeated sample is **not a fresh daily puzzle**.
- Sudoku is different. It generates a board from the day and selected difficulty, rather than reading a folder of daily samples. There is no public sample-file cutoff for Sudoku.
- A **gap** means a numbered sample day is missing. A **duplicate** means two filenames claim one day. A **repeat** means two sample days contain the same playable puzzle. An **out-of-order** file would change which puzzle the game shows on a date.
- When any of these problems or an invalid file appears, **days left stops at the first affected day**. This conservative number does not promise a fresh puzzle after broken sample order; fix the file before trusting later days.
- All public sample files must clearly say `"status": "sample"`. This report never prints puzzle answers or clues.

To check the safeguards, run `npm test -- tests/unit/puzzle-runway.test.ts`. It checks the actual folders and deliberate broken test fixtures. If a sample is running out, the report shows **0 days left**. That is information for planning, not a failing test. Gaps, duplicates and repeats **inside the fresh sample window** fail the test.

**For real daily content:** public `content/games/` files are samples only. Never add real questions, answers, unpublished clues, or answer keys to this repository. They belong in the private reviewed content system.
