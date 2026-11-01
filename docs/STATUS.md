# Status

Last updated: 2026-11-01

## Done
- Static site: Astro + React islands + TypeScript + Tailwind, static output, tested at phone and desktop sizes.
- Design tokens in `src/styles/tokens.css`, with automated contrast checks on every color pair.
- Pages: home (with launch-updates signup), `/learn/study-skills` (Lesson 1 placeholder, read from
  `/content/lessons`), `/privacy` (draft), `/terms` and `/disclaimer` (marked spots for Christian's text), `/support`
  (Ko-fi link), `/subscribed` (after signup), 404. "We're still building" notice on every page.
- Light / Dark / Follow-device theme switch in every page footer (brand spec section 9).
- Brand v1.0 applied (docs/BRAND.md, brand-source/v1.0/Cueory_Brand_Guide.md, D-55):
  - Christian's new PNG logo, with light and dark web copies built by `scripts/build-brand-v1.mjs` and checked by
    tests;
  - the guide's exact colors (Espresso `#3E2C23`, Charcoal `#1C1917`, Ivory lettering in dark mode);
  - new favicons;
  - a calmer hero: no embossed logo, and the motto moved to the footer.

  It replaces the earlier traced logo (now in `brand-source/legacy/`).
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
- Fourth release 31 Oct ([#26](https://github.com/lilchristxan/Cueory/pull/26)), merged by Christian; live on `main`:
  [home hero, ☰ side panel and account corner](https://github.com/lilchristxan/Cueory/pull/24) in the all-lowercase
  voice (D-46, D-47), with phone, tablet and desktop browser tests (D-48), [search in the ☰ panel](https://github.com/lilchristxan/Cueory/pull/27)
  (D-49), the ["ways to study" carousel](https://github.com/lilchristxan/Cueory/pull/28) (D-50), its
  [preview and hover zoom](https://github.com/lilchristxan/Cueory/pull/29) (D-51), the
  [silk scenes](https://github.com/lilchristxan/Cueory/pull/32) (D-53) and the
  [med-surg lesson map](https://github.com/lilchristxan/Cueory/pull/31) (docs only).
- In `staging`, waiting for the next release: [auto-merge hardening](https://github.com/lilchristxan/Cueory/pull/30)
  (D-52), merged by Christian. Before launch the bot now also holds changes to package.json `scripts`, `engines` and
  `packageManager`, and lockfile changes that add a package, an install script or a download from outside the npm
  registry; version bumps of existing packages still merge themselves.
- In `staging`, also merged by Christian: [social links](https://github.com/lilchristxan/Cueory/pull/33) (D-54),
  marks in the footer and the ☰ panel. Christian confirmed the addresses on 1 Nov (D-65): Instagram @cueory.app,
  TikTok, YouTube and X @cueory, Pinterest cueoryapp and the Facebook page.
- In `staging` (auto-merged): the [visuals kit plan](https://github.com/lilchristxan/Cueory/pull/35) (D-56 to D-58),
  docs only.
- In `staging`: [brand v1.0](https://github.com/lilchristxan/Cueory/pull/38) (D-55, the lead's) and the
  ["ways to study" merry-go-round and a calmer home page](https://github.com/lilchristxan/Cueory/pull/40) (D-60).
  [Release #37](https://github.com/lilchristxan/Cueory/pull/37) carries everything in `staging` to `main` when
  Christian merges it.
- In `staging` (auto-merged): the [home page polish](https://github.com/lilchristxan/Cueory/pull/42) (D-62): 16 px
  panels with a hairline and one soft shadow, a crisper glassy button, sections that fade in once, and a shorter
  launch-updates panel.

## Done (lead, 2026-10-31 evening)
- Daily games show plain names for now (D-66): pulse, crossword, sort and word path. Christian picks final names
  later.

## In review
- Game-name guard (D-67): a unit test fails if a page or game shows an internal id (`cueword`, `triage`, `suture`) as
  words, or types a name into a share line, so the next rename stays a one-line change.
- [Once-only promo panel](https://github.com/lilchristxan/Cueory/pull/34) (D-59): on marketing pages a small dark panel
  slides down from the top after 5 seconds or halfway down the page, with "join the launch list", "support us while we
  build" and the social marks; once shown, it stays away for 30 days. Now on brand v1.0's colors.
- Daily games, first part (D-61): `/play` with pulse, playable with labeled sample puzzles, and cueword, triage and
  suture listed as coming soon; a link in the ☰ panel and a section on the home page after "ways to study". It adds
  sample puzzles under `content/`, so it waits for Christian's merge. How real puzzles reach the browser one day at a
  time is proposed in D-61 for Christian.
- Daily games, second game (D-63, stacked on the first part): triage on `/play`. Sort ten terms into three named
  groups, with one that fits none ("none of these"); a wrong place is a slip, and three slips end the round. Buttons
  only (tap, click or keyboard, no dragging), every result said in words and shown by ✓, and a plain-words share line.
  Seven labeled everyday samples under `content/games/triage/`, so it also waits for Christian's merge.

## Queued (Christian's change requests on issue #4, in his order)
1. CI: WebKit and Firefox on Release pull requests, plus the device rule in CLAUDE.md (D-48; waits for Christian).
2. Auto-release (`staging` into `main` in pre-launch mode), after the change requests.
3. Christian's 31 Oct evening requests ([the lead's note on issue #4](https://github.com/lilchristxan/Cueory/issues/4#issuecomment-6551841155)),
   now first: brand v1.0 (the lead's branch), then the home page polish pass, then the rest of daily games (the home
   page section and triage are in review; cueword and suture are next).

## Visuals kit (Task 6, D-56)
Targets: first visuals by about 14 November, the full kit by about 12 December ([plan](VISUALS.md)).
- Done: the plan, and license checks on every source. Open RN *Nursing Fundamentals 2e* is the cited source (CC BY
  4.0). OpenStax waits for Christian (D-57).
- Next: the visual source-file check and draft-only rendering, then the first batch (fluid compartments, osmosis and
  fluid shifts, the sodium-potassium pump) with its review sheet. The 3D viewer adds three.js, so it waits for
  Christian's merge; its models wait for the atlas choice.

## Planning
- [Med-surg lesson map](curriculum/README.md) ([#31](https://github.com/lilchristxan/Cueory/pull/31)): the master
  list of 351 lessons in 19 units, in build order, each with a stable `lesson_id`; ROADMAP points to it. It is an
  outline of topics only, with no clinical facts: lessons still come through the content pipeline (source brief,
  reviewers, approval), and higher-risk topics wait for a qualified reviewer.

## Blocked
- **Task 2 (accounts and database)** waits for Christian to create the two Supabase projects, and its sign-in and
  database-policy parts need his approval. The "Flag or comment" button is built with it (D-34). Task 4 parts that
  don't need accounts go first (D-35).
- **Signup form** shows "signups open soon" until the Kit form exists (SETUP.md, Part I).

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
- [ ] Visuals kit, OpenStax (D-57): its books are CC BY-NC-SA, not CC BY, and its pages ask that they not be fed to
  AI tools without permission. Keep it out (recommended), or ask OpenStax for permission.
- [ ] Visuals kit, 3D atlas (D-57): BodyParts3D (CC BY 4.0: credit only; recommended) or Z-Anatomy (CC BY-SA 4.0: our
  models and the videos that show them must use the same license).
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
