# Admin console plan (master account)

Task 202. This is a plan, not a build. Nothing in this pull request changes the site, the database or any setting.
Because it covers sign-in and database rules, Christian approves it before any part is built.

Christian asked for a "master account": a place where he can decide what is posted, hide things, edit things and see
the backend of the website. This document says what already exists, what we would add in three phases, how it is kept
safe, and exactly what he would click. Words like "RPC" are explained the first time they appear.

## 1. What already exists

Most of the safe foundation is already built and merged into `staging`. It does not yet run on the live site until the
migrations are applied (docs/SETUP.md lists which database files must be run, and says an admin file's presence in
GitHub does not prove it has run).

| Piece | Where | What it does today |
| --- | --- | --- |
| Admin list | `supabase/migrations/20261102153000_admin_flag_rpcs.sql` | Table `public.admins`. No website role, and not even the service role, can read or write it. Only the database owner adds a row, by hand in the Supabase SQL editor (D-101). No email is stored in the repository. |
| Admin check | same file, `is_admin()` | True only if the account is in `admins`, the sign-in used a second factor (JWT `aal2`), and Supabase still shows a verified second factor for that account. Called inside every admin function. |
| Flag inbox functions | same file | `admin_list_flags`, `admin_mark_flag_handled`, `admin_reopen_flag`. Each starts by calling `is_admin()` and refuses otherwise. |
| Flag inbox page | `src/pages/admin/flags.astro`, `src/islands/AdminFlags.tsx`, `adminflags.ts`, `adminflagsrpc.ts` | Plain table grouped by question, open/handled filter, "mark handled". Not linked from the site, not indexed, not cached offline. Shows "this page is for the site owner" to anyone else (D-134). |
| Flag storage | `supabase/migrations/20261101120000_flags_and_submit_flag.sql` | Table `flags`: page, item, item version, reason, comment (1 to 1000 characters), status. No website role can touch it. Students send reports only through `submit_flag` (confirmed accounts, 5 an hour, 20 a day, D-88). |
| Content with a published state | `20261101080000_concepts_sources_rights.sql`, `20261101090000_items_and_versions.sql` | `concepts.published` (hidden until published). `item_versions.status` is draft, published or retired; one published version per question. Students can read only published rows. Answer keys sit in `item_answers`, readable by no website role. Only `check_answer` sees them. |
| Publish function | `20261102090000_publish_item_version.sql` | Publishes a draft and retires the old version in one step. Callable only by the service role (the importer), not by any website role. |
| Rights records | `rights_records` table | Private; no website role can read it. |
| Content importer | `scripts/import_batch.ts`, `scripts/import-batch/` | Command-line importer for checked batches. Dry run by default, `--apply` to write, `--publish` to publish. Takes the database address and secret key only from environment variables (D-106). Re-runs the batch checker before importing (D-90). |
| Two-factor | `src/pages/account/two-factor.astro`, `src/islands/TwoFactor.tsx`, `20261104170500_enforce_opt_in_mfa.sql` | Authenticator-app setup (D-132). The database refuses a signed-in session that has a second factor but did not use it. The admin check itself needs `aal2`, so the admin account cannot work without it. |
| Headers and CSP | `public/_headers`, `astro.config.mjs` | Strict content security policy, no inline scripts, `frame-ancestors 'none'`, `form-action 'self'` plus the newsletter address. |
| Rate limits | `submit_flag`, `check_answer`, `record_study_events` | Per-person limits inside the database. Sign-in and sign-up limits are Supabase's defaults (D-111). Admin functions have none yet. |
| Tests | `supabase/tests/database/admin_flags_test.sql` and neighbours | Database tests (pgTAP) for the admin check and the flag functions. |

What does not exist yet:

- Any dashboard, content list or counts page.
- Any way to hide, unpublish or edit content from the website. Today that is done only by the importer on Christian's
  command line, or by hand in the Supabase SQL editor.
- An audit log of admin actions.
- A hidden/visible switch separate from "retired". A retired version cannot be published again (the publish function
  accepts only drafts).
- A database home for lessons and cards. Today lessons, cards and videos are files in `/content` that are built into
  the site (CLAUDE.md rule 7 says they should end up in the database). Hiding those needs a design choice, see 4.3.
- A confirmed lock on `/admin` on the live site. SECURITY.md rule 10 says `/admin` is locked with Cloudflare Access
  "from Task 2". I could not find that written down as done for the live hostname, so this plan treats it as not
  done and asks (decision 3).

## 2. Who counts as admin

- Only Christian's account. One row in `public.admins`, added by him in the Supabase SQL editor, as already designed
  (D-101). No second admin is ever added without his written OK. Claude, Codex and every automated job are never
  admins.
- Two-factor is required. The database checks it on every call, not just at sign-in (an authenticator-app code, a
  verified factor still on file). If he removes the factor, the console stops working at once, even if a browser tab is
  still open.
- The role is checked only on the server. An "RPC" is a function that lives inside the database and that the website
  calls by name. Every admin action will be an RPC that begins with `is_admin()` and refuses otherwise. The website
  never decides who is admin. Hiding the admin menu from other people is only a courtesy; the real lock is in the
  database.
- No admin action will use the service-role (secret) key from the browser or from the website's code. That key stays in
  GitHub, Cloudflare and Supabase settings only.
- The console lives at `/admin/...`, is not linked from the public site, is `noindex`, is never cached offline, and
  (if he agrees, decision 3) sits behind Cloudflare Access with his email on top of everything above.

## 3. The three phases

Each phase is its own small set of pull requests, each needing his approval (database policies and auth).

### Phase 1: sign in and look (read only)

Nothing can be changed in this phase, so it is the lowest risk.

- `/admin` dashboard, for him only:
  - Counts: accounts, new accounts this week, open flags, questions by state (draft, published, retired), concepts
    published or not, attempts in the last 7 days. Counts only, no student names.
  - Flags and comments inbox: the existing page, linked from the dashboard, plus a link from each flag to the content it
    is about.
  - Content list: every concept and question with its state (draft, published, retired, hidden once phase 2 exists),
    version number and open-flag count. Question text is shown; answer keys are not.
- New RPCs (names are proposals): `admin_dashboard_counts()`, `admin_list_content(kind, state, limit, cursor)`.
  Reuse `admin_list_flags`.

### Phase 2: hide, show, unpublish, resolve

- Hide or show a concept or question: a reversible switch. It is a new `hidden_at` column on concepts and items. The
  public read rules add `and hidden_at is null`. This is separate from "retired", which cannot be undone, and keeps the
  published version intact so showing it again is one click.
- Unpublish a question: retire its published version (existing meaning). Also available, with a plain warning that it
  cannot be re-shown without a new draft.
- Resolve flags: keep "mark handled" and add an optional private note ("fixed in v3", "not a problem") and "hide the
  question now" from the same screen.
- Every action asks "are you sure?" on the screen and writes an audit row (see 5).
- New RPCs: `admin_set_hidden(kind, id, hidden)`, `admin_retire_version(version_id)`, `admin_resolve_flag(flag_id,
  note)`, `admin_list_audit(limit, cursor)`.

### Phase 3: edit and post, with draft, preview, publish

- Create or edit means a new draft version of a question (published versions never change, existing rule from D-85).
  Fields: stem, choices, rationale, source. Answer keys and rationales can be seen and typed only inside this admin
  screen, fetched by an admin RPC, never cached, never in the page source of anyone else.
- Preview: an admin-only preview that shows the draft exactly as a student would see it, in the same components, on a
  `noindex` page. No student can reach a draft.
- Publish: `admin_publish_version(version_id)` publishes the draft and retires the old version in one step (reusing the
  existing publish logic and the existing completeness checks that refuse an incomplete draft).
- Clinical content rule (CLAUDE.md rule 5): Claude and the engineers never write clinical facts. The console is a place
  where Christian types or pastes his own reviewed text. The reviewer-checks question is decision 4.
- Lessons, cards and videos: see 4.3 for the open design question.
- Audit log (5) covers every edit, publish and unpublish.
- New RPCs: `admin_get_draft`, `admin_save_draft`, `admin_preview_version`, `admin_publish_version`, plus the importer
  keeps working unchanged.

## 4. Database and RPC design sketch

Rules for every new admin function (same as the existing ones, and what Codex will check): `security definer`,
`set search_path = ''`, first line calls `is_admin()` and raises error 42501 if false, all inputs validated (length,
type, allowed values) inside the function, `revoke execute ... from public, anon, authenticated, service_role` then
`grant execute ... to authenticated` only, and a pgTAP test for "refused when signed out, refused as a student, refused
as admin without two-factor, works as admin". Tables get RLS enabled and a restrictive deny-all policy for website
roles, as `admins` and `flags` already have.

### 4.1 Per table

| Table | Phase 1 (read) | Phase 2 | Phase 3 |
| --- | --- | --- | --- |
| `admins` | unchanged: no website access | unchanged | unchanged |
| `flags` | `admin_list_flags` (exists) | `admin_resolve_flag` with a note column; note is admin-only | unchanged |
| `concepts` | list with state and counts | `hidden_at` column; public policy adds `hidden_at is null`; `admin_set_hidden` | create or edit title (draft concept stays unpublished) |
| `items`, `item_versions` | list with state, version, open-flag count | `hidden_at` on items; `admin_retire_version` | `admin_save_draft`, `admin_publish_version` (draft only, completeness trigger still applies) |
| `item_choices` | public text only, as today | none | written only through `admin_save_draft` |
| `item_answers` (the key) | never returned | never returned | returned only by `admin_get_draft` and `admin_preview_version` to an `aal2` admin, with `Cache-Control: no-store`; still never to students |
| `sources`, `rights_records` | list (rights stay admin-only) | none | optional later |
| `admin_audit` (new) | none | append-only log written by each action in the same transaction | same |

### 4.2 The audit log

New table `admin_audit`: id, time, admin user id, action name (an allowed list), target kind and id, a short note, and a
small JSON of what changed (never an answer key, never a student's name or email). No website role can read or write it
directly; there is no update or delete function at all, so it is append-only for everyone but the database owner.
`admin_list_audit` lets him read it. Each admin action writes its row inside the same function, so an action cannot
happen without a row (the transaction fails together).

Approval receipt. A publish (and any override) is tied to exactly what Christian approved: the row records the
immutable version id and a content digest (a hash, a short fingerprint) of the exact stem, choices, rationale and
source being published, taken inside the same function. If even one character changes after he approves, the digest no
longer matches and the publish is refused until he approves again. Only non-clinical formatting checks may be
overridden by a button. The answer-key and reserved checks and the clinical review gate can never be waived this way;
they pass or the version stays a draft. This is an open decision (question 4) and must be settled before Phase 3.

### 4.3 Open design question: lessons and cards

Lessons, cards, videos and puzzles are files in `/content` built into a static site, so a database switch cannot hide
them from the already-built pages. Two options:

- A. A small table `content_state` (kind, slug, state) that a public read RPC returns and the pages check in the
  browser. The page then hides itself. Quick, but the hidden text is still in the built files until the next build. Fine
  for "stop showing this", not for "this was wrong and private".
- B. Move lessons and cards into the database as questions already are (the direction of CLAUDE.md rule 7), then
  everything uses the same hide, edit and publish rules. More work, the right end state.

Recommendation: ship Phases 1 and 2 for questions and concepts first (already in the database), and decide A or B for
lessons and cards when Phase 2 is approved.

### 4.4 Never in the browser

- Answer keys, correct choices and rationales before an attempt, reviewer results, rights records, other people's
  emails and the audit log are returned only by admin RPCs to a verified admin session.
- Student identity: the flag inbox shows a short account id, not an email or name. The console adds no new personal data.
  (Decision 5 asks whether he wants emails shown.)
- The public repository holds no real content, keys or personal data (D-75). Draft text lives only in the database.

## 5. Threat model

| Threat | How it is handled |
| --- | --- |
| Public repo: someone reads our code to find the admin | The admin is a database row, not a secret in code. Knowing the design gives no access. No email, key or content in the repo. |
| Fork pull request tries to add an admin or loosen a rule | Only `lilchristxan` gives instructions (D-79); forks never run or merge (auto-merge skips them); every database change is labeled `needs-christian` and never merges to `main` without him; Codex reviews each admin function against the checklist above. |
| Stolen password | The database requires an authenticator code (`aal2`) and a still-verified factor on every admin call. |
| Stolen session (cookie or token) | A stolen `aal2` session still works until it expires. Mitigations: short admin sessions (ask: set Supabase's session time-box and inactivity timeout, if the free plan allows; I will read the docs and confirm before proposing), destructive actions need a fresh sign-in within 10 minutes as delete-account already does (D-133), the audit log shows what happened, and Cloudflare Access (decision 3) is a second lock in front of the pages. |
| CSRF (a bad site makes his browser send an action) | Calls go to Supabase with his token in a request header, not a cookie that browsers attach automatically, so another site cannot send them. `form-action 'self'` and no state-changing GET. Each destructive action also requires a confirm step that sends the target id. |
| XSS (a student's comment runs code in his admin page) | Flag comments and all content are shown as plain text by React (no `dangerouslySetInnerHTML`), the CSP blocks inline scripts and new origins, and a test will fail the build if admin screens render user text as HTML. This matters more once he edits rich text; phase 3 keeps text plain. |
| Brute force or spam | Supabase's sign-in limits (D-111). Admin RPCs get a per-admin limit (for example 600 calls an hour) and edits/publishes a lower one, mainly to stop runaway loops, and every refusal is cheap because `is_admin()` runs first. |
| Malicious or mistaken admin action (a click error) | Reversible hide, "are you sure", no bulk delete in any phase, nothing ever hard-deletes content, audit log, and the database backup plan (docs/BACKUPS.md, still pending verification). |
| An admin function accidentally open to students | pgTAP tests for every function in four roles; a database test that lists every function in `public` that is executable by `authenticated` and compares it to an approved list. |
| Service-role key leak | The console never uses it. The importer already reads it only from environment variables. |

## 6. Privacy page impact

`/privacy` stays true. It already describes flag reports. Needed edits, in the same pull request as each phase:

- Phase 1: a sentence that the site owner can read reports and sees aggregate counts.
- Phase 2: that the owner can hide or remove content and mark reports handled with a private note.
- Phase 3 and audit log: that admin actions are logged with the owner's account id and time, with no student data.
- Delete-my-account and export-my-data: no change in Phase 1 to 3 because nothing new about students is stored. The
  audit log holds only the admin's own id.

## 7. Cost

$0. Everything is Postgres functions on the existing free Supabase project and static pages on the existing Cloudflare
Workers site. No new service, subscription, email or storage. Cloudflare Access (if used) is free up to 50 users. Extra
tables are small. Nothing is added to the monthly bill, so no spending approval is needed. Free Supabase projects still
pause after 7 days without activity and have no automatic backups, which is unchanged.

## 8. Test plan

- Database (pgTAP), for every new function and table: refused signed out; refused as a normal student; refused as
  admin on `aal1`; refused when the factor is removed; works as admin on `aal2`; bad input refused; students still
  cannot read hidden, draft or retired rows or any key; each action writes exactly one audit row; the audit table has
  no website grant; the "approved list of executable functions" test.
- Unit tests (Vitest): the screen logic in plain `.ts` files, including "comment text is never rendered as HTML".
- Browser tests (Playwright + axe) at phone, tablet and desktop sizes, Light and Evening: non-admin sees only "this
  page is for the site owner"; an admin without two-factor is sent to the code page; keyboard and tap work, visible
  focus, no sideways scroll, confirm dialogs are reachable by keyboard, state shown in words and not color alone.
- Header check: admin pages carry the strict CSP, `noindex`, and are excluded from the sitemap and offline cache.
- Staging first: every phase is exercised on the locked staging site and `cueory-staging` before it is promoted.

## 9. What Christian clicks (one action per step)

Claude gives the exact text to paste each time. Nothing below happens until he approves the plan.

### Now (approving this plan)

1. Open the pull request for Task 202 on GitHub.
2. Read section 10 (decisions) and reply in the pull request or in chat with yes or no for each.
3. Tell Claude "go ahead with Phase 1". You should see Claude open a new pull request labeled `needs-christian`.

### Phase 1

1. Open `/account/two-factor` on the staging site while signed in. You should see a QR code to scan with an
   authenticator app. (Skip if two-factor is already on.)
2. Enter the 6-digit code. You should see "two-factor is on".
3. Open the Supabase dashboard, project `cueory-staging`, then SQL editor. You should see an empty query box.
4. Paste the admin line Claude gives you (the one in docs/SETUP.md, with your sign-in email) and click Run. You should
   see one row with your account id. No row means the email did not match.
5. Open the Phase 1 pull request and click "Approve" and "Merge" into `staging` only after Claude says the checks are
   green. (Claude never merges into `main`.)
6. In Supabase `cueory-staging`, SQL editor, paste the Phase 1 migration Claude gives you and click Run. You should
   see "Success. No rows returned".
7. Open `/admin` on the staging site. You should see the counts, the flags inbox link and the content list.
8. Open `/admin` in a private window, signed out. You should see only "this page is for the site owner."
9. When you are happy, merge the `staging` to `main` pull request. Then repeat steps 4 and 6 in `cueory-prod`.

### Phase 2

1. Open the Phase 2 pull request and approve it after Claude says checks are green.
2. In Supabase `cueory-staging`, SQL editor, paste the Phase 2 migration and click Run. You should see "Success".
3. On the staging `/admin` content list, click "Hide" on a test question. You should see an "are you sure" box.
4. Confirm. The row should now say "Hidden" in words.
5. Open that question as a student in a private window. It should not appear.
6. Click "Show". It should appear again.
7. Open the audit log page. You should see two rows, one for hide and one for show.
8. Promote to `main` and repeat the migration step in `cueory-prod` (same two clicks as Phase 1).

### Phase 3

1. Approve the Phase 3 pull request after checks are green.
2. In `cueory-staging`, SQL editor, paste the Phase 3 migration and click Run.
3. In `/admin`, click "New draft" on a test question and paste your own reviewed text. You should see "Saved as draft".
4. Click "Preview". You should see the question as a student would, with a banner "draft, only you can see this".
5. Click "Publish" and confirm. You should see the state change to "Published" in words.
6. Open the question as a student. Your new text should appear.
7. Check the audit log shows save, publish and the earlier hide and show.
8. Promote to `main` and repeat the migration step in `cueory-prod`.

## 10. Decisions for Christian (yes or no)

1. **Plan:** approve building Phase 1 (read-only dashboard) first, with Phases 2 and 3 each needing a separate go-ahead?
2. **Hide means reversible.** Add a "hidden" switch (separate from "retired") so hiding is undoable?
3. **Extra lock:** put Cloudflare Access (free, your email only) in front of `/admin` on the live site too, on top of the
   password, authenticator code and database checks?
4. **Publishing rule (Phase 3, open: decide before Phase 3 starts).** May a question you edit in the console be
   published only after the existing reviewer checks show as passed, and may only non-clinical formatting checks (for
   example spacing or a missing credit line) ever be overridden by a button, each override written to the audit log
   with your approval receipt (see 4.2)? The answer-key and reserved checks and the clinical review gate would never be
   waivable by a button. (My recommendation: yes.)
5. **Privacy:** keep student emails and names out of the console (short account ids only)?
