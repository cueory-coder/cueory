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
- Repository public (D-75): GitHub's secret scanning with push protection and CodeQL run, and Semgrep and gitleaks
  keep running in CI as a second layer. Only Christian's account gives the agents instructions (D-79).
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
- In `staging` (auto-merged): the [once-only promo panel](https://github.com/lilchristxan/Cueory/pull/34) (D-59). On
  marketing pages a small dark panel slides down from the top after 5 seconds or halfway down the page, with "join the
  launch list", "support us while we build" and the social marks; once shown, it stays away for 30 days.
- In `staging` (auto-merged): [Organizer](https://github.com/lilchristxan/Cueory/pull/58) (a Codex helper's, Task 5b on
  #11): sort ideas into groups by tapping, by typing a group's number or by dragging. Nothing is marked until
  **check**; right items lock and wrong ones go back to try again. Not on a page yet: that comes with the study-mode
  pages (Task C1 on #11).
- In `staging` (auto-merged): [adaptive quiz rules](https://github.com/lilchristxan/Cueory/pull/61) (a Codex helper's,
  Task 10 on #11). The next question comes from the student's own results, by written rules: a concept they just
  missed comes first, then the one with the fewest tries; two right in a row move a concept up a level, and a miss
  moves it down. Each pick says why in words, and each concept's status is a word (not started, learning, getting
  there, got it), never a score or a chance of passing. It reaches a page once reviewed questions and `check_answer`
  exist (Task 2).
- In `staging`: [Safari focus fixes](https://github.com/lilchristxan/Cueory/pull/78) (from the WebKit runs for D-48):
  the ☰ panel's Tab trap now moves focus one item at a time in every browser (Safari's own Tab skips links and
  buttons), and the promo panel gives focus back after a link click even though Safari leaves focus on the page. Two
  WebKit-only test findings stay open: the triage keyboard tests use the browser's own Tab, and one promo timing test
  runs late in WebKit.

## Done (director, 2026-10-31 night)
- Christian set up Supabase (SETUP Part K): the account on his business Gmail with two-factor on, and both projects,
  `cueory-staging` and `cueory-prod`. Task 2 is unblocked.
- In `staging`: the [game-name guard](https://github.com/lilchristxan/Cueory/pull/54) (D-67), a unit test that fails
  if a page or game shows an internal id as words or types a name into a share line; and the
  [Task 2 plan](https://github.com/lilchristxan/Cueory/pull/66) (D-73), approved by the lead with three notes (D-77).

## Done (lead, 2026-10-31 evening)
- Daily games show plain names for now (D-66): pulse, crossword, sort and word path. Christian picks final names
  later.
- Auto-merge sweep (D-78, [#80](https://github.com/lilchristxan/Cueory/pull/80)), merged by Christian on
  2026-11-01: an ordinary comment can no longer cancel a waiting merge check, and an hourly sweep re-checks every
  open pull request. It starts working once it reaches `main`.

## Done (director, 2026-11-01, midnight Phoenix)
Merged into `staging` tonight (pulse and sort were already live; the rest reaches `main` with the next release):
- Daily games: [the crossword](https://github.com/lilchristxan/Cueory/pull/62) (D-70) and
  [word path](https://github.com/lilchristxan/Cueory/pull/65) (D-71) on `/play`, merged by Christian, so all four games
  are playable on labeled samples.
- Task 2: the [first database change](https://github.com/lilchristxan/Cueory/pull/76) (D-77), merged by Christian:
  the database starts locked, then `profiles` (a display name only, each student sees their own), with 25 database
  tests in CI. No keys are used yet.
- Visuals kit: the [first batch's words](https://github.com/lilchristxan/Cueory/pull/72) (D-72), approved and merged by
  Christian; he chose to keep draft source files in the repository until approved.
- Rules: [instructions only from Christian's account](https://github.com/lilchristxan/Cueory/pull/81) (D-79), merged
  by Christian.
- Earlier tonight, also in `staging`: the [diagram step player](https://github.com/lilchristxan/Cueory/pull/63), the
  [break timer](https://github.com/lilchristxan/Cueory/pull/67), the
  [game stats logic](https://github.com/lilchristxan/Cueory/pull/70) and the
  [crossword scroll fix](https://github.com/lilchristxan/Cueory/pull/59).
- Helpers' engines and boards, none on a page yet (the study-mode pages, Task C1, bring them in):
  [questions player](https://github.com/lilchristxan/Cueory/pull/53) (rationales after the check, never an answer key
  in the browser), [fill-in](https://github.com/lilchristxan/Cueory/pull/56) (with the
  [typing-composer fix](https://github.com/lilchristxan/Cueory/pull/87)),
  [review scheduler](https://github.com/lilchristxan/Cueory/pull/64) and
  [review session](https://github.com/lilchristxan/Cueory/pull/83), [label it](https://github.com/lilchristxan/Cueory/pull/71),
  [level test rules](https://github.com/lilchristxan/Cueory/pull/84), and the
  [Flag or comment form](https://github.com/lilchristxan/Cueory/pull/82) (with its
  [focus fix](https://github.com/lilchristxan/Cueory/pull/86); sending waits for `submit_flag`).
- The [promo panel fix](https://github.com/lilchristxan/Cueory/pull/46): it waits until the ☰ panel or a study-mode
  preview has finished closing.
- Christian's decisions (D-80): the 3D atlas is BodyParts3D; OpenStax is link-only; releases stay manual.

## Done (director, 2026-11-01, 1–2 am Phoenix)
Merged into `staging` overnight; the database and content ones by the director on Christian's behalf (D-89):
- Task 2, the database's next three steps (Task C6, each with the lead's security review): step 1 (#90, D-84),
  `concepts`, `sources` and `rights_records`; step 2 (#92, D-85), questions in `items`, `item_versions` and
  `item_choices`, with the key and rationales in `item_answers`, which no website role can read; step 3 (#94, D-86),
  `attempts` and `check_answer`, which records the attempt before it returns the key and rationales (200 checks an hour
  per person). Nothing reaches `cueory-staging` or `cueory-prod` until Christian applies migrations himself.
- Visuals kit, the first batch's drawings (#93, D-81): body fluid compartments, osmosis and fluid shifts, and the
  sodium-potassium pump, drawn only from their approved source files. Still drafts: nothing shows on a page until
  Christian approves them. Draft video clips of all three (1080 × 1920) went to Christian in the director's chat.
- Guest progress and onboarding saved on this device (#74, D-69), private game stats on `/play` (#79, D-76), the
  concept map (#68), and the Safari preview fix (#88).
- Helpers' logic, not on a page yet: account initials and menu (#91, Task 18), and the `/admin` review-table model
  (#96, Task 20).

## Done (director, 2026-11-01, 2–4 am Phoenix)
Merged into `staging`; the database ones by the director on Christian's behalf (D-89), each with the lead's review:
- Task 2, database step 4 (#104, D-87): `review_state` and `exam_plans`. Each student reads and writes only their own
  spaced-review progress and exam dates. Steps 1 to 4 are in `staging`; nothing reaches `cueory-staging` or
  `cueory-prod` until Christian applies migrations himself.
- Helpers' logic, not on a page yet:
  - the batch importer's parser (#100, Task 21): reads a passed batch with its item and key files, never guessing a
    missing field;
  - the "flag or comment" arguments for `submit_flag` (#107, Task 26);
  - the disease-overlay frame (#102, Task 24), which always shows "simplified for learning";
  - exam-date wording (#106, Task 27), calm and counted in calendar days;
  - concept status from attempts (#109, Task 29), on the existing adaptive rules;
  - what the offline cache may keep (#112, Task 32);
  - study events with nothing personal in them (#114, Task 33), with no analytics script yet.

## Done (director, 2026-11-01, 4–5 am Phoenix)
Merged into `staging` (#115 by the director on Christian's behalf, D-89, with the lead's review). Helpers' logic, not on
a page yet:
- the batch importer refuses an item whose hash is missing or doesn't match, and needs every choice's rationale (#115,
  Task 28); the checker is being brought in line with it (Task C8);
- the flag-name fix for item versions (#117, Task 26);
- guest progress turned into review rows for when an account is created (#113, Task 31);
- the review queue from database rows (#118, Task 34);
- the flag inbox model for `/admin` (#120, Task 35);
- the curriculum lesson map read in build order (#119, Task 36);
- display-name checks in the browser that match the database (#121, Task 37);
- plain words for the database's refusals (#122, Task 38);
- which visuals a lesson may show: approved ones with a drawing, never drafts (#123, Task 39).

## In review
- Open pull requests add their own lines here. Waiting now: study modes on pages (#77), export-my-data (#95, Task 19),
  lesson videos (#97, Task C3), the 3D viewer shell (#98, Task C4), the Supabase settings reader (#101, Task 22),
  delete-account checks (#105, Task 25), the daily puzzle checker (#108), database step 5, flags and `submit_flag`
  (#110), the review-clip exporter (#111, Task C7) and Release browser tests (#55).
- Task C8 (D-90): the batch checker matches the importer. It requires a rationale for every choice on every question,
  `passed.csv` carries the importer's own hash (tested end to end), and the importer runs the checker again on its files
  and imports only what the checker passes now. Samples only; no real questions.
  (#110), the review-clip exporter (#111, Task C7), Release browser tests (#55), and the new tasks 40 to 42 and C8
  when they open.
- Task 40: `reviewSheet(visual)` prepares source and credit tables with an unticked visual-review checklist; pure logic, in review.

## Queued (Christian's change requests on issue #4, in his order)
1. CI: WebKit and Firefox on Release pull requests, plus the device rule in CLAUDE.md (D-48; waits for Christian).
2. Releases stay manual (D-80): the director opens a Release pull request and Christian merges it.
3. Christian's 31 Oct evening requests ([the lead's note on issue #4](https://github.com/lilchristxan/Cueory/issues/4#issuecomment-6551841155)),
   now first: brand v1.0 (the lead's branch), then the home page polish pass, then the rest of daily games (the home
   page section, pulse and sort are in `staging`; the crossword and word path are in review).

## Visuals kit (Task 6, D-56)
Targets: first visuals by about 14 November, the full kit by about 12 December ([plan](VISUALS.md)).
- Done: the plan, and license checks on every source. Open RN *Nursing Fundamentals 2e* is the cited source (CC BY
  4.0). OpenStax is link-only (D-80): a lesson may link to it, but it is never quoted or copied.
- In `staging`: [video frames for teaching diagrams](https://github.com/lilchristxan/Cueory/pull/47) (a Codex
  helper's, finished by the lead): `node scripts/export-frames.ts --url … --selector … --out …` saves numbered PNG
  frames at 1080 × 1920 and 1920 × 1080 for shorts, with the diagram stretched to fill each frame. In review
  ([#57](https://github.com/lilchristxan/Cueory/pull/57)): only the selected diagram's own animations set a clip's
  length, so a spinner elsewhere on the page can't make it "endless".
- In `staging`: the [source-file check](https://github.com/lilchristxan/Cueory/pull/49) (`src/visuals/sources.ts`,
  D-68). The build refuses a visual whose labels or depictions have no source, that quotes a book not on the allowed
  list, or whose source has the wrong license or no page address. Only approved visuals can appear on a page, and
  each shows its book's credit.
- In `staging`: the first batch's words (D-72), approved by Christian: the source files for body fluid compartments,
  osmosis and fluid shifts, and the sodium-potassium pump, every label quoted from Open RN *Nursing Fundamentals 2e*
  15.2.
- Next: the three drawings (Task C5), made only from those files. The 3D viewer adds three.js, so it waits for
  Christian's merge; its models come from BodyParts3D (D-80).

## Planning
- [Med-surg lesson map](curriculum/README.md) ([#31](https://github.com/lilchristxan/Cueory/pull/31)): the master
  list of 351 lessons in 19 units, in build order, each with a stable `lesson_id`; ROADMAP points to it. It is an
  outline of topics only, with no clinical facts: lessons still come through the content pipeline (source brief,
  reviewers, approval), and higher-risk topics wait for a qualified reviewer.

## Blocked
- **Signup form** shows "signups open soon" until the Kit form exists (SETUP.md, Part I).

## Needs Christian's hands
- [ ] Real questions need a free account (D-86): `check_answer` reveals the key after one try, so signed-out visitors
  can't use it (a limit needs an identity, and a CAPTCHA would load a third-party script). Guests keep the sample modes.
  Reply "ok" to keep it this way, or ask for a CAPTCHA exception.
- [x] Daily report (#4) and task list (#11) locked so only collaborators can comment (D-79), done by Christian on
  2026-11-01.
- [x] Private vulnerability reporting turned on (D-79), done by Christian on 2026-11-01.
- [x] Repository public (D-75), done by Christian on 2026-10-31: visibility, secret scanning with push protection,
  and the go-public pull request merged.
- [x] CI minutes change (D-74) merged. Actions minutes are free now that the repository is public.
- [x] Supabase account and the two projects, `cueory-staging` and `cueory-prod` (docs/SETUP.md, Part K), done
  2026-10-31.
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
- [x] Auto-release: no (D-80), Christian on 2026-11-01. Releases into `main` stay manual: the director opens them and
  Christian merges them.
- [x] Visuals kit, OpenStax (D-80): link only, Christian on 2026-11-01. Never quoted, copied or fed to an AI tool.
- [x] Visuals kit, 3D atlas (D-80): BodyParts3D (CC BY 4.0, credit only), Christian on 2026-11-01.
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
