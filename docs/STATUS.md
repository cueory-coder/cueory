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
- Rules and docs: CLAUDE.md, AGENTS.md, SECURITY.md, README, ROADMAP (Tasks 2–7), DECISIONS, SETUP (with a
  rollback guide for when a release breaks the live site).
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
- Staging auto-merge ([#12](https://github.com/lilchristxan/Cueory/pull/12), D-39): clean, non-sensitive pull
  requests merge into `staging` on their own; sensitive ones get the `needs-christian` label. Live since the 31 Oct
  release.
- Video start wording ([#13](https://github.com/lilchristxan/Cueory/pull/13), D-40): one tap on a lesson video's cover
  loads YouTube's player and starts that video; nothing plays on page load.
- Release 31 Oct ([#20](https://github.com/lilchristxan/Cueory/pull/20)): Cards and flashcards for lesson 1, the batch
  checker, the roadmap additions and the staging auto-merge are on `main`.
- Second release 31 Oct ([#21](https://github.com/lilchristxan/Cueory/pull/21)), approved by Christian; live on `main`:
  - [Marketing redesign](https://github.com/lilchristxan/Cueory/pull/14) (D-41): quiet-luxury home hero and frosted
    panels on the support, legal and 404 pages; study screens unchanged.
  - [Pre-launch mode for the auto-merge](https://github.com/lilchristxan/Cueory/pull/15) (D-42): `automation.json`
    says `"prelaunch": true`, so until launch only workflows, the automation, the rules files, content, the database,
    deployment, new or major-version dependencies and anything labelled `needs-christian` wait for Christian.
  - [Dependabot ignore rules](https://github.com/lilchristxan/Cueory/pull/16): no more TypeScript 7 or `@types/node`
    above 24.
- Dependabot closed [#9](https://github.com/lilchristxan/Cueory/pull/9) (`@types/node` 26) and
  [#10](https://github.com/lilchristxan/Cueory/pull/10) (TypeScript 7) itself once the ignore rules reached `main`.
- Third release 31 Oct ([#23](https://github.com/lilchristxan/Cueory/pull/23)), merged by Christian; live on `main`:
  - [Learn mode](https://github.com/lilchristxan/Cueory/pull/17) (D-43), merged into `staging` by Christian because it
    changes a placeholder card in `content/`.
  - [Matching](https://github.com/lilchristxan/Cueory/pull/18) (D-44) and
    [select-all-that-apply in the batch checker](https://github.com/lilchristxan/Cueory/pull/19) (D-45), the first
    pull requests the pre-launch auto-merge took on its own.
  - [Rollback guide](https://github.com/lilchristxan/Cueory/pull/22) in `docs/SETUP.md`.
- In `staging`, waiting for the next release: [home hero, ☰ side panel and account corner](https://github.com/lilchristxan/Cueory/pull/24)
  in the all-lowercase voice (D-46, D-47), with phone, tablet and desktop browser tests (D-48).

## In review
- "ways to study" carousel (D-50): one chip per study mode, cards with original moving illustrations, arrows, keys,
  swipe and a gentle auto-advance with a pause button. The auto-merge takes it once it is clean.

## Queued (Christian's change requests on issue #4, in his order)
1. Search in the ☰ panel (Pagefind, a new package, so it waits for Christian's merge).
2. The carousel's hover zoom, grow-into-preview and the preview panel.
3. Silk scenes down the whole page, social links (Simple Icons), then the once-only promo panel.
4. CI: WebKit and Firefox on Release pull requests, plus the device rule in CLAUDE.md (D-48; waits for Christian).
5. Auto-release (`staging` into `main` in pre-launch mode), after the change requests.

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
- [x] `main` ruleset: protect-main stays active (pull request required, no force pushes, no deletion). "Restrict
  updates" stays off for now, Christian's call on 31 Oct, because it would block an auto-release
  ([answer on issue #4](https://github.com/lilchristxan/Cueory/issues/4#issuecomment-6548304193)).
- [ ] Auto-release (`staging` into `main` with no person in the loop): Christian's yes reached the repo through
  another Claude session on issue #4. The safety check of the session that builds it needs that yes from Christian
  himself, in the Claude chat that runs these updates, before it builds anything that changes the live site on its own.
- [ ] An "about" page for the ☰ panel: the text is Christian's (D-46 leaves the link out until it exists).
- [ ] Later decision: show a student's Google profile photo in the account corner instead of initials (it would load
  images from Google; ROADMAP Task 2).
- [ ] Confirm or change the Task 3 batch defaults (docs/BATCHES.md, D-26) before real batches use them: the CSV
  columns, which reviewers count (at least five files, names from the Task 2 roster), the pass rule (every reviewer matches
  the key and marks pass; unfinished reviews are pending, not failed), and the answer-balance warning (10 points off an even share, batches of 20+).
- [x] Select-all-that-apply questions: yes, scored all-or-nothing for now, with each option's rationale shown
  afterward ([answer on issue #4](https://github.com/lilchristxan/Cueory/issues/4#issuecomment-6545756502)). The batch
  checker handles them ([#19](https://github.com/lilchristxan/Cueory/pull/19), D-45).
- [x] Videos: one tap on the cover loads YouTube's player and starts that video (Christian confirmed "play
  immediately", [issue #4](https://github.com/lilchristxan/Cueory/issues/4#issuecomment-6546595207); D-40).
