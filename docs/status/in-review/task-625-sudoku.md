STATUS: implementation review in progress

Base: legacy/staging at 6b5ae956984672953716f537ff10f371c40afe61.

Current branch adds the pure seeded Sudoku generator, solver, uniqueness checks, and unit coverage. The game is now wired into /play in place of the sort entry, while preserving the existing internal stats key. Remaining review scope is runtime build/test execution and visual/browser accessibility checks against the design handoff.

D-pending: verify the daily level selector, keyboard/pointer behavior, result state, and shared-result integration with Christian. The local host lacks Node/npm, so the full project verifier has not run here.
