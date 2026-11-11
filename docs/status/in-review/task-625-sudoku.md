STATUS: implementation review in progress

Base: legacy/staging at 6b5ae956984672953716f537ff10f371c40afe61.

Current branch adds the pure seeded Sudoku generator, solver, uniqueness checks, and unit coverage. Remaining review scope is wiring the game into /play, replacing the current sort entry, and checking the UI against the design handoff before this draft is ready for review.

D-pending: verify the daily level selector, keyboard/pointer behavior, result state, and shared-result integration with Christian.
