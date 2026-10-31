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
- Task 1 merged into `staging` ([#1](https://github.com/lilchristxan/Cueory/pull/1)) and released to `main`
  ([#8](https://github.com/lilchristxan/Cueory/pull/8)). Hosting moved to Cloudflare Workers
  ([#7](https://github.com/lilchristxan/Cueory/pull/7), D-38).
- Roadmap additions ([#5](https://github.com/lilchristxan/Cueory/pull/5)): Christian's 2026-10-31 study features and
  the YouTube video rule (D-32 to D-36).
- Task 3 batch checker ([#2](https://github.com/lilchristxan/Cueory/pull/2)) and Task 4 Cards
  ([#3](https://github.com/lilchristxan/Cueory/pull/3), `/learn/study-skills/cards`) merged into `staging`.
- Task 4 flashcards ([#6](https://github.com/lilchristxan/Cueory/pull/6)): shuffle, star, Know it / Still learning, stars
  kept in the browser only (D-37). In `staging`.
- Staging auto-merge ([#12](https://github.com/lilchristxan/Cueory/pull/12), D-39) merged into `staging`: clean,
  non-sensitive pull requests merge into `staging` on their own; sensitive ones get the `needs-christian` label. It
  starts working once it reaches `main` with the next release.

## In review
- **Pre-launch mode for the staging auto-merge** (D-42), this pull request: `automation.json` says
  `"prelaunch": true`, so until launch the auto-merge holds only workflows, the automation itself, the rules files,
  content, the database and deployment settings, new dependencies and major version updates, and anything labelled
  `needs-christian`.
  It changes the automation's own rules, so Christian approves it.
- [Video start wording](https://github.com/lilchristxan/Cueory/pull/13) (D-40) and
  [marketing redesign](https://github.com/lilchristxan/Cueory/pull/14) (D-41).
- Dependabot [#9](https://github.com/lilchristxan/Cueory/pull/9) (`@types/node` 26) and
  [#10](https://github.com/lilchristxan/Cueory/pull/10) (TypeScript 7): don't merge. We run Node 24 (D-01), and
  Astro's type checker accepts TypeScript only up to 6 (D-02). The auto-merge holds major updates (D-42), and
  [#16](https://github.com/lilchristxan/Cueory/pull/16) adds an ignore rule to `.github/dependabot.yml`.

## Blocked
- **Task 2 (accounts and database)** waits for Christian to create the two Supabase projects, and its sign-in and
  database-policy parts need his approval. The "Flag or comment" button is built with it (D-34). Task 4 parts that
  don't need accounts go first (D-35).
- **Signup form** shows "Signups open soon" until the Kit form exists (SETUP.md, Part I).

## Needs Christian's hands
Follow [docs/SETUP.md](SETUP.md):
- [ ] A. Two-factor login on Google, GitHub, Cloudflare
- [x] B. Turn on Codex reviews
- [x] C. Connect the repository to Cloudflare Workers
- [ ] D. Check the branches
- [ ] E. Check the lock
- [x] F. Approve Task 1 into `staging`
- [x] G. Put Task 1 live (`staging` into `main`)
- [ ] H. Connect cueory.app, turn on Web Analytics
- [ ] I. Create the Kit account and form; decide on the mailing address shown in emails
- [ ] J. Decide whether hello@cueory.app should forward to your Gmail (needs email DNS records)
- [ ] Provide disclaimer and terms text
- [ ] Before the staging auto-merge (D-39) reaches `main`: in Settings → Rules, make the `main` ruleset "Restrict
  updates" with only the repository admin (you) on its bypass list, so no robot can ever change `main`
- [ ] Confirm or change the Task 3 batch defaults (docs/BATCHES.md, D-26) before real batches use them: the CSV
  columns, which reviewers count (at least five files, names from the Task 2 roster), the pass rule (every reviewer matches
  the key and marks pass; unfinished reviews are pending, not failed), and the answer-balance warning (10 points off an even share, batches of 20+).
- [x] Select-all-that-apply questions: yes, scored all-or-nothing for now, with each option's rationale shown
  afterward ([answer on issue #4](https://github.com/lilchristxan/Cueory/issues/4#issuecomment-6545756502)). The batch
  checker still handles single-answer questions only (D-30) until that change is built.
- [x] Videos: one tap on the cover loads YouTube's player and starts that video (Christian confirmed "play
  immediately"). D-32 and ROADMAP Task 4d get the new wording in their own pull request.
