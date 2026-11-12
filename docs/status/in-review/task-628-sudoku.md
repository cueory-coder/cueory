STATUS: Task 628, Sudoku replaces sort on /play (#5): deterministic daily Sudoku with bounded generation, accessible controls, pause timing, result reporting and private stats.

DECISION: D-pending (Task 628) Sudoku uses generated sample puzzles with no clinical content; difficulty targets 40/32/26 givens and generation validates the target and uniqueness. Reason: keep the public game deterministic and safe while avoiding real clinical content.

FOLLOW-UP: The latest commit adds valid grid rows with roving focus and bounded arrow movement, modal focus management for settings/how-to-play, UTF-8-safe words, MRV generation with derived-seed fallback, local-day result/reporting, stats wiring, and restored parse-error context.

FOLLOW-UP: Fixed the five current review findings on the existing branch: mount effects no longer steal focus, visitor-facing Sudoku labels and sharing use gameName('sudoku'), solve results capture exact elapsed seconds, legacy triage stats are ignored without discarding current history, and the multi-seed uniqueness test has an explicit 30-second timeout. Verification remains limited to the external GitLab pipeline; no local npm or browser verification is claimed.
