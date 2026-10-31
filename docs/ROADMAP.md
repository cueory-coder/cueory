# Roadmap

Each task ships as several small pull requests into `staging`, each reviewed by Codex, checked on the locked staging
site, then promoted to `main` by Christian. Christian approves anything touching auth, database policies, payments,
workflows, deployment or secrets.

## Task 1 — Static site foundation (see STATUS.md)
Repo, design tokens, `main` and `staging` deploy branches, placeholder pages, launch-updates signup (Kit), security
headers and CSP, CodeQL, Dependabot, secret scanning, CI, rules docs, Cloudflare setup steps.

## Task 2 — Accounts and database
- Two Supabase projects: `cueory-staging` and `cueory-prod`.
- Schema: `concepts`, `items`, `item_versions`, `sources`, `rights_records`, `reviews`, `attempts`, `review_state`,
  `exam_plans`, `profiles`. Row-level security policies on every table.
- `check_answer(item_id, choice)` RPC: returns right/wrong and the rationale, never sending the key first.
- Google sign-in (main), email magic links via Resend (backup, because the free plan sends 100 a day). Rate limited.
- Locked `/admin`: tables for questions, lessons, cards and video scripts with inline editing. One column per
  reviewer (gpt1, gpt2, gpt3, gemini, claude_sonnet, codex, claude_final, christian) showing pass, fail or pending, plus
  version, risk level and public label. Editing an item creates a new version and resets its checks. Two-factor
  required.
- Batch importer for CSV files in `/content/batches/`.
- Daily keep-alive ping for staging and nightly encrypted backup for prod (GitHub Actions), with a practice restore.

## Task 3 — Batch checker
`scripts/check_batch`: compare five reviewer CSVs with the key and run mechanical checks (answer balance, duplicates,
missing rationales, unknown fact IDs, broken source links). Writes `passed.csv`, `failed.csv` and `report.md`.

## Task 4 — Study modes and accounts in use
- Study modes: Learn, Cards, Fill-in, Matching, Organizer (tap and keyboard alternatives to dragging), Questions with
  rationales, Review.
- Guest progress saved in the browser; creating an account imports it.
- Onboarding questions (including exam date).
- Review scheduler: about 1, 3, 7 and 14 days, adjusted to the exam date.
- Working delete-my-account and export-my-data.

## Task 5 — Breaks, events and install
- Optional Pomodoro-style break timer, off by default, gentle break suggestions, no streak pressure.
- PostHog study events (1 million free events a month). The privacy page is updated first.
- Installable PWA and offline lesson cache.

## Task 6 — 3D anatomy (December)
Export only the needed Z-Anatomy structures (CC BY-SA 4.0) to compressed glTF and show them with three.js in lessons,
with visible credit and a phone performance budget. Don't embed the Unity build.

## Task 7 — Daily medical puzzles (major feature)
One fresh set a day for everyone. Starting games: a five-letter medical word guess and a mini crossword. Later: a
grouping puzzle, a word search, and "name the structure" on the 3D body. Words and clues come only from approved
lesson content and go through the same review pipeline. Shareable emoji result grid, optional streak with no penalty
for missing a day, works offline once loaded. Original game names, rules and visual design. Never the names Wordle,
Connections or NYT, and never a copy of their look.

## Later
App store versions.
