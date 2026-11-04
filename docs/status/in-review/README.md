# Status notes for open pull requests

Every pull request adds **one new file** here instead of editing `docs/STATUS.md` or `docs/DECISIONS.md`, so dozens of
pull requests can be open at once without clashing (Christian, 2026-11-01).

- **File name:** the branch name with `/` replaced by `-`, ending in `.md`. Example: `task-77-motion-foundation.md`.
- **Content:** one line for STATUS, and only if the pull request makes a decision, one line for DECISIONS. The labels are
  case-insensitive. Use the uppercase `STATUS:` and `DECISION:` forms to match `AGENTS.md`:

```
STATUS: Task 77, motion and depth foundation (#153): shared classes for lift, flip, progress and entrances.
DECISION: D-pending (Task 77) Motion uses 150-400 ms soft easing and is always off with reduced motion. Reason: the brand bar.
```

- **Then:** the director's docs batch copies each `status:` or `STATUS:` line into `docs/STATUS.md`, gives each
  `decision:` or `DECISION:` the next free D number in `docs/DECISIONS.md`, and deletes the note file in the
  same pull request.
