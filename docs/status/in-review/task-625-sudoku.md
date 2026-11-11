status: Task 625, sudoku replaces sort on /play: seeded unique easy/medium/hard puzzles, keyboard and pointer play, hints, persisted settings, isolated print output, accessibility coverage, and a shared-result hook; legacy sort content files remain untouched.

D-pending: the required 44px minimum makes nine cells plus grid lines wider than a 390px viewport. The implementation keeps 44px cells and contains horizontal scrolling within the board; Christian should choose between that exception and smaller-than-44px grid cells. The keypad keeps 44px controls in its own contained row for the same reason.

D-pending: existing private stats with the internal `triage` id belong to the retired sort game, not Sudoku. This branch keeps those records labeled “sort” and does not write Sudoku into that legacy slot; Christian should decide whether a later stats-schema migration adds a separate Sudoku id.
