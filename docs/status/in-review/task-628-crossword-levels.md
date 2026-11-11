STATUS: in-review
Branch: task-628/crossword-levels
Base: legacy/staging
Scope: Worker 3 crossword levels and clue bar on /play only.

Implemented:
- easy 5x5, mid 7x7 and hard 15x15 labeled sample grids;
- level switch with size labels, responsive cells, word selection highlighting, clue bar, printer/help controls, and print-only across/down sample clue lists;
- removed side clue list and check/reveal controls;
- preserved Task 174 arrows, Space direction toggle, Alt+Arrow word navigation, and normal Tab exit;
- retained the existing solved/result hook for later results-card integration.

Verification:
- npm run verify: not run; connected GitLab tools provided repository file and commit APIs but no checkout/runtime.
- focused sample test added for labels, placeholders and 3+ letter entries.

D-pending: Worker 2 results-card integration remains pending; this branch keeps the existing plain solved state until that work is merged.


Follow-up fixes for GitLab Duo findings:
- corrected across numbering for the 7x7 and 15x15 samples;
- added a dedicated 5x5 sample-only grid;
- level selection now retains the selected exact-size puzzle through state/hash changes and never falls back to another size;
- restored readable formatting and kept the help description mounted so aria-describedby always resolves;
- added focused exact-size level-selection coverage.

Verification update:
- npm run verify: not run; this connected environment still has no repository checkout/runtime.
