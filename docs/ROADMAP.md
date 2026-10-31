# Roadmap

Each task ships as several small pull requests into `staging`, each reviewed by Codex, checked on the locked staging
site, then promoted to `main` by Christian. Christian approves anything touching auth, database policies, payments,
workflows, deployment or secrets.

Tasks go in this order. When a task waits on Christian (an account, a decision or an approval), the next task that
doesn't wait goes first, and the waiting task is listed in STATUS.md (D-35).

## Task 1 — Static site foundation (see STATUS.md)
Repo, design tokens, `main` and `staging` deploy branches, placeholder pages, launch-updates signup (Kit), security
headers and CSP, CodeQL, Dependabot, secret scanning, CI, rules docs, Cloudflare setup steps.

## Task 2 — Accounts and database
- Two Supabase projects: `cueory-staging` and `cueory-prod`.
- Schema: `concepts`, `items`, `item_versions`, `sources`, `rights_records`, `reviews`, `attempts`, `review_state`,
  `exam_plans`, `profiles`. Row-level security policies on every table.
- `check_answer(item_id, choice)` RPC: returns right/wrong and the rationale, never sending the key first.
- Google sign-in (main), email magic links via Resend (backup, because the free plan sends 100 a day). Rate limited.
- **Account corner and ☰ panel (built in D-46, ready for accounts):** signed out, the top-right person icon opens
  "create free account" and "sign in". Signed in, it becomes a round avatar with the student's initials (no photo
  uploads) and opens their name, school (an optional onboarding answer), "see profile", "account settings" and
  "sign out". The hero's "create your free account" button and the panel's "my progress" link switch from the
  launch-updates signup to sign-up and the progress page. Showing the Google profile photo instead of initials is a
  later decision for Christian, because it would load images from Google.
- Locked `/admin`: tables for questions, lessons, cards and video scripts with inline editing. One column per
  reviewer (gpt1, gpt2, gpt3, gemini, claude_sonnet, codex, claude_final, christian) showing pass, fail or pending, plus
  version, risk level and public label. Editing an item creates a new version and resets its checks. Two-factor
  required.
- **"Flag or comment" button**, always on, on every lesson, card, question, puzzle and page (D-34):
  - It opens a short form: what's wrong (a wrong fact, a typo, something confusing, something broken, or other) and an
    optional comment. The page, the item and the item's version are attached automatically.
  - Every report lands in an inbox in the locked `/admin`, where Christian reads it and marks it handled.
  - Checked and rate limited on the server, like every form. `/privacy` is updated first, and delete-my-account and
    export-my-data cover anything a signed-in student sends.
  - It ships before any real lesson, card, question or puzzle goes public.
- Batch importer for CSV files in `/content/batches/`.
- Daily keep-alive ping for staging and nightly encrypted backup for prod (GitHub Actions), with a practice restore.

## Task 3 — Batch checker
`scripts/check_batch`: compare five reviewer CSVs with the key and run mechanical checks (answer balance, duplicates,
missing rationales, unknown fact IDs, broken source links). Writes `passed.csv`, `failed.csv` and `report.md`.

## Task 4 — Flashcards, Learn mode and the other study modes
- **Flashcards:** flip a card to see its answer, shuffle the deck, star cards (and study only the starred ones), and
  sort each card into **Know it** or **Still learning**, with a count of each. Once every card in a round is sorted,
  the next round is just the "Still learning" pile. Stars are kept in the browser until accounts arrive.
- **Learn mode:** one session that mixes cards, multiple choice, typed answers and fill-in, and keeps bringing back
  anything the student misses until it's mastered. It starts with the card decks: the answer is the card's back, which
  students can already see by flipping. Questions from the reviewed question bank join once `check_answer` exists
  (Task 2), so their answer keys never reach the browser (D-33). The card-deck version is built (D-43).
- Other study modes: Matching (built for card decks, D-44), Organizer (tap and keyboard alternatives to dragging),
  Questions with rationales, Review.
- Guest progress saved in the browser; creating an account imports it.
- Onboarding questions (including exam date).
- Review scheduler: about 1, 3, 7 and 14 days, adjusted to the exam date.
- Working delete-my-account and export-my-data.

## Task 4b — Adaptive quizzes and unit level tests
- **Adaptive quizzes:** the next question is picked by simple written rules from the student's own results on each
  concept (more questions on what they miss, harder ones once they're getting a concept right). Rule-based, so every
  choice can be explained; no AI guessing.
- **A level test for each unit**, which shows where the student stands on every concept in it.
- **A concept progress map:** every concept in a unit with its status in words and an icon, never color alone.
- **No exam-score predictions** and no "chance of passing" claims, anywhere.
- Uses only reviewed questions, checked by `check_answer`, and Task 2's `concepts` and `attempts` tables.

## Task 4c — Image occlusion
- Anki-style: the labels on a diagram are covered. The student reveals them one at a time (or all at once) and marks
  each one Know it or Still learning.
- Only images we have the rights to use, each with a visible credit line and a rights record (Task 2's
  `rights_records`). No license on record, no image.
- The covered areas are content data in `/content` (their positions are percentages of the image), not drawn in code.
- Every cover can be revealed by keyboard and by tapping, and screen-reader text never gives away a covered label.

## Task 4d — Lesson videos (Christian's decision, 2026-10-31)
- Every lesson video is hosted on Cueory's YouTube channel and embedded. Video files are never stored on our servers.
- Click-to-play: the page first shows a self-hosted thumbnail and a play button. YouTube's player loads only after the
  student clicks it.
- Embedded from `https://www.youtube-nocookie.com`. One tap on the cover loads the player and starts that video
  right away. Nothing plays on page load, and nothing loads from YouTube before the tap (D-40).
- Under each video: a link to its captions and transcript, and a short note that playing the video loads YouTube.
- The content security policy allows only that origin as a frame (`frame-src https://www.youtube-nocookie.com`).
- `/privacy` says YouTube may set cookies once a video is played. It changes in the same pull request as the player.
- Video IDs live in content data in `/content`, never in code.

## Task 5 — Breaks, events and install
- Optional Pomodoro-style break timer, off by default, gentle break suggestions, no streak pressure.
- PostHog study events (1 million free events a month). The privacy page is updated first.
- Installable PWA and offline lesson cache.

## Task 6 — 3D anatomy (December)
Export only the needed Z-Anatomy structures (CC BY-SA 4.0) to compressed glTF and show them with three.js in lessons,
with visible credit and a phone performance budget. Don't embed the Unity build.

## Task 7 — Daily medical puzzles (major feature)
One fresh set of medical-themed puzzles a day for everyone. Starting games: a five-letter medical word guess and a mini
crossword. Later: a grouping puzzle, a word search, and "name the structure" on the 3D body. Words and clues come only
from approved lesson content and go through the same review pipeline. Shareable emoji result grid, optional streak with
no penalty for missing a day, works offline once loaded, and the "Flag or comment" button on every puzzle. Original
game names, rules and visual design. Never the names Wordle, Connections or NYT, and never a copy of their look.

## Later
App store versions.
