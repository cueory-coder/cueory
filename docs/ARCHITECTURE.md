# Cueory architecture

This is a map of the files that make the site work today. It is for finding code, not for proposing new features. A route means a page address, such as `/learn`. A build means the step that turns source files into the pages visitors receive.

## How a page reaches the student

1. Astro turns a file in `src/pages/` into a page during the build. Astro is the tool that prepares the site's HTML.
2. Most pages use `src/layouts/Layout.astro` for the page title, skip link, shared navigation, footer, and optional building notice. Shared page pieces live in `src/components/`.
3. A React island is the part of a page that responds to a tap, key press or other interaction. These live in `src/islands/` as `.tsx` files.
4. Reusable rules, checks and state changes belong in plain `.ts` files, often beside the island. Browser-wide behavior, such as theme choice and saved progress, lives in `src/scripts/`.
5. Colors, sizes, fonts and spacing are named tokens in `src/styles/tokens.css`, not values written in individual components.

Example: `src/islands/SudokuGame.tsx` draws the Sudoku interface. `src/islands/sudoku.ts` handles its puzzle rules. This keeps the rules separate so unit tests can check them without a browser.

## Where the pages live

| Page or feature | Source files | What they do |
| --- | --- | --- |
| Home and public information | `src/pages/index.astro`, `src/pages/about.astro`, `src/pages/support.astro`, `src/pages/privacy.astro`, `src/pages/terms.astro`, `src/pages/disclaimer.astro`, `src/pages/404.astro` | Show the main and informational pages with the shared layout. |
| Course overview | `src/pages/courses.astro`, `src/pages/learn/index.astro` | Show course information and available lessons. |
| Lesson and card pages | `src/pages/learn/[lesson]/index.astro`, `src/pages/learn/[lesson]/cards.astro`, `src/pages/learn/[lesson]/learn-mode.astro`, `src/pages/learn/[lesson]/matching.astro` | Build a page for each visible lesson and its card-based study options. The part in square brackets is the lesson's address. |
| Other lesson activities | `src/pages/learn/[lesson]/fill-in.astro`, `src/pages/learn/[lesson]/organizer.astro` | Build fill-in and organizer activities when that lesson has the required sample files. |
| Older sample pages | `src/pages/learn/study-skills/label-it.astro`, `src/pages/learn/study-skills/questions.astro`, `src/pages/learn/questions.astro`, `src/pages/learn/video-sample.astro` | Keep the older study-skills examples and other sample learning pages available under their existing routes. |
| Daily games | `src/pages/play.astro` | Hosts four playable sample games on the same page. |
| Additional games | `src/pages/play/stat.astro`, `src/pages/play/hello-cards.astro` | Provide separate pages for stat and hello cards, subject to their sample and release rules. |
| Progress and breaks | `src/pages/progress.astro`, `src/pages/breaks.astro` | Show study progress and breaks. |
| Account and admin pages | `src/pages/start.astro`, `src/pages/signin.astro`, `src/pages/signup.astro`, `src/pages/account.astro`, `src/pages/admin/flags.astro` | Host onboarding and account-facing screens. Their sign-in and permission rules belong to separately controlled code. |
| Preview-only pages | `src/pages/preview/` | Hold development previews, not regular public navigation. |
| Sitemap | `src/pages/sitemap.xml.ts`, `src/config/routes.ts` | List eligible public page addresses for search engines. The build adds eligible lesson routes. |

A study page uses the plain study layout, without decorative marketing textures behind lesson text. A page may show a labeled sample or a placeholder. A draft is not the same as published material.

## Lessons and study modes

- Public sample JSON files live in `content/`. A content collection is a group of JSON files checked against rules in `src/content.config.ts`. The field guide is `content/README.md`.
- The lesson map is `docs/curriculum/medsurg-lesson-map.csv`. `src/lessons/load.ts` reads it with the content collections. `src/lessons/catalog.ts` decides which lesson pages and study modes may be built.
- The lesson hub can show a sentence-by-sentence reader, a video, and tiles for available activities. Cards, learn mode and matching use the lesson's card deck. Fill-in and organizer use their own sample sets.
- Label-it and sample questions still have specific older study-skills routes. Real question answers stay in protected data, not in public lesson files.
- `src/config/modes.ts` lists the study options shown in the site's study-mode overview. `src/videos/schema.ts` validates video records.

## Games

The public games page `src/pages/play.astro` hosts four games: pillo (word guessing), Sudoku, crossword, and word path. Their public names and menu descriptions come from `src/config/games.ts`. Sudoku still has the internal code id `triage`; it is displayed as Sudoku.

The pages `src/pages/play/stat.astro` and `src/pages/play/hello-cards.astro` are separate from those four. Stat's draft sample is available only where drafts are allowed; the live page shows a coming-soon state until ready. Hello cards also follows its own visibility rules.

- Rendering: game interfaces such as `src/islands/PulseGame.tsx`, `src/islands/SudokuGame.tsx` and `src/islands/StatGame.tsx`.
- Rules: plain files such as `src/islands/pulse.ts`, `src/islands/sudoku.ts`, `src/islands/cueword.ts`, `src/islands/suture.ts` and `src/islands/stat.ts`.
- Validation: `src/islands/puzzlefeed.ts` checks a daily puzzle's expected shape and date before the game uses it.
- Private device statistics: `src/islands/GameStatsPanel.tsx`, `src/islands/gamestats.ts` and `src/scripts/storage.ts`. Stored results must not be treated as verified clinical scores.

Only labeled, non-clinical samples belong in the public code repository. Real future puzzle answers must not be shipped early in a page or download.

## Offline pages

A service worker is a browser helper that may save permitted pages and files for later use without a connection. It is not a database backup and does not save private accounts or question keys.

- `src/config/site.ts` holds the offline enabled/disabled setting.
- `src/pages/register-sw.js.ts` generates the small registration script. Its source is `src/scripts/offline.ts`.
- `src/pages/sw.js.ts` generates the worker. Its parts are `src/scripts/sw.ts`, `src/scripts/swlogic.ts` and `src/scripts/offlineplan.ts`. The last file decides which public page addresses and self-hosted assets can be cached.
- `src/scripts/swoff.ts` removes the worker and saved copies if the feature is switched off.
- `docs/OFFLINE.md` explains the allowed and excluded content in everyday language.

Caching depends on the visitor's browser and connection. A student should not expect a page that was never opened to be available offline.

## Where to change things and how to check them

| If you need to work on... | Look here |
| --- | --- |
| Page structure | `src/pages/` and `src/layouts/Layout.astro` |
| Shared header, footer, buttons, and labels | `src/components/` |
| Interactive screens | `src/islands/` (display in `.tsx` and rules in `.ts`) |
| Theme and local progress | `src/scripts/theme.ts`, `src/scripts/progress.ts`, `src/scripts/storage.ts` |
| Site, game and study settings | `src/config/site.ts`, `src/config/games.ts`, `src/config/modes.ts` |
| Public sample validation | `src/content.config.ts` and `content/` |
| Small automated tests | `tests/unit/` |
| Browser and keyboard tests | `tests/e2e/` |

Every path above is a file or directory in this repository. Keep this map current when files move. Do not put secrets, real questions, private keys, or unreleased lessons in documentation.
