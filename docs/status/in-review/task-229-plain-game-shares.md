status: Task 229, W37: added cross-game share-format checks for every lobby game and result branches, including singular/plural counts and three generated date labels. Shares must remain lowercase printable words on one line, without emoji/square grids or puzzle guesses. Tests only, no gameplay changes.

Validation: git diff --check, npm run check (0 errors/warnings, 12 existing hints), npm run build and npm test passed (119 files, 3,560 tests). The new suite adds 13 tests. No browser tests changed.
