# Status

Last updated: 2026-10-31

## Done
- Static site: Astro + React islands + TypeScript + Tailwind, static output, tested at phone and desktop sizes.
- Design tokens in `src/styles/tokens.css`, with automated contrast checks on every color pair.
- Pages: home (with launch-updates signup), `/learn/study-skills` (Lesson 1 placeholder, read from
  `/content/lessons`), `/privacy` (draft), `/terms` and `/disclaimer` (marked spots for Christian's text), `/support`
  (Ko-fi link), `/subscribed` (after signup), 404. "We're still building" notice on every page.
- Light / Dark / Follow-device theme switch in every page footer (brand spec section 9).
- Brand applied (docs/BRAND.md, brand-source/Cueory_Branding_Spec.md): Daytime and Evening palettes with automatic
  dark mode, Inter, exact lowercase motto and product description, traced vector logo built into wordmark, square and
  3:1 banner files (light and dark, SVG and PNG) with a checksum manifest. Logo approved by Christian and frozen as
  master v1.0.
- Security headers and a hash-based content security policy.
- Repository stays private: Semgrep (code scanning) and gitleaks (secret scanning) run free in CI in place of
  GitHub's paid CodeQL and secret scanning.
- CI on every pull request (type check, build, unit tests, browser + accessibility tests, gitleaks secret scan),
  CodeQL, Dependabot version updates (target `staging`) and Dependabot security alerts. Dependabot's automatic
  security-fix pull requests are off, because they always target `main` and would skip staging.
- Rules and docs: CLAUDE.md, AGENTS.md, SECURITY.md, README, ROADMAP (Tasks 2–7), DECISIONS, SETUP.
- Repository branches: `main` (live) and `staging` (test), both starting from one empty commit.

## In review
- [Task 1 site foundation](https://github.com/lilchristxan/Cueory/pull/1) into `staging`. CI green; Codex found nothing
  more after its two fixes. Waits for Christian's approval and merge, because it adds workflows and deployment
  settings.
- [Task 3 batch checker](https://github.com/lilchristxan/Cueory/pull/2), stacked on Task 1. CI green, Codex clean.
- [Task 4 Cards](https://github.com/lilchristxan/Cueory/pull/3), stacked on Task 1. CI green, Codex clean.
- **Roadmap additions**, stacked on Task 1: Christian's 2026-10-31 study features (flashcards, Learn mode, adaptive
  quizzes and level tests, image occlusion, the "Flag or comment" button) and the YouTube video rule (D-32 to D-36).

## Blocked
- **Task 2 (accounts and database)** waits for Christian to create the two Supabase projects, and its sign-in and
  database-policy parts need his approval. The "Flag or comment" button is built with it (D-34). Task 4 parts that
  don't need accounts go first (D-35).
- **Signup form** shows "Signups open soon" until the Kit form exists (SETUP.md, Part I).

## Needs Christian's hands
Follow [docs/SETUP.md](SETUP.md):
- [ ] A. Two-factor login on Google, GitHub, Cloudflare
- [x] B. Turn on Codex reviews
- [ ] C. Connect the repository to Cloudflare Pages
- [ ] D. Limit builds to `main` and `staging`
- [ ] E. Lock the staging site
- [ ] F. Approve Task 1 into `staging`, check the locked staging site
- [ ] G. Approve `staging` into `main`
- [ ] H. Connect cueory.app, turn on Web Analytics
- [ ] I. Create the Kit account and form; decide on the mailing address shown in emails
- [ ] J. Decide whether hello@cueory.app should forward to your Gmail (needs email DNS records)
- [ ] Provide disclaimer and terms text
- [ ] Confirm or change the Task 3 batch defaults (docs/BATCHES.md, D-26) before real batches use them: the CSV
  columns, which reviewers count (at least five files, names from the Task 2 roster), the pass rule (every reviewer matches
  the key and marks pass; unfinished reviews are pending, not failed), and the answer-balance warning (10 points off an even share, batches of 20+).
- [ ] Decide whether question batches will include select-all-that-apply questions (the batch checker handles
  single-answer questions only for now)
- [ ] Decide how lesson videos start: today's plan (D-32) is that a click loads YouTube's player and the student presses
  play there, so nothing ever plays by itself. The other choice is that one click loads and starts the video.
