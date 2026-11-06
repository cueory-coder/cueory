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

Christian's picture of the goal: the master account works like the inside of a vending machine. He can read
everything in spreadsheet-style tables, sort it, control which options exist, and decide what customers can see,
especially "features of the day" (for example the prompt of the day and other daily features). Phase 1 delivers the
reading half; the controls come in Phases 2 and 3, each needing his separate go-ahead. Nothing here is built yet.

- Sortable, filterable, spreadsheet-style tables (column headers that sort, a filter box, paging) for: questions and
  content, flags, features of the day, and users (short account id only, never email or name). A "download CSV" button
  exports exactly what he is allowed to see on screen, and nothing the screens hide (no answer keys, no emails, no
  names). Tables work by keyboard and touch.

- `/admin` dashboard, for him only:
  - Counts: accounts, new accounts this week, open flags, questions by state (draft, published, retired), concepts
    published or not, attempts in the last 7 days. Counts only, no student names.
  - Flags and comments inbox: the existing page, linked from the dashboard, plus a link from each flag to the content it
    is about.
  - Content list: every concept and question with its state (draft, published, retired, hidden once phase 2 exists),
    version number and open-flag count. Question text is shown; answer keys are not.
- New RPCs (names are proposals): `admin_dashboard_counts()`, `admin_list_features()`, `admin_list_users()` (short ids and
  dates only), `admin_list_content(kind, state, limit, cursor)`.
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

Features of the day (Phase 2 for scheduling, Phase 3 for new content): a `features` and `feature_schedule` table. For each
feature (prompt of the day, other daily features) there is a deterministic fallback, for example today's prompt derives
from the date, unless the admin has set an override for a date. The admin sets, clears or moves an override from the
table view. Every such control goes through the same admin functions, `is_admin()`, step-up, audit log and, for
anything that publishes new text, the approval-receipt gate as publishing does. Students see only today's choice.

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

New table `admin_audit`: id, time, the admin's account id, an action name (from an allowed list), the kind and id of
the thing acted on, a short fixed-vocabulary note, and a small JSON of what changed.

What may go in it (and what may not):
- Allowed targets: concepts, questions, question versions, and for flags only the opaque flag id and the new state
  (open or handled). Never a student's account id, name or email.
- Allowed notes and JSON: action codes, old and new state, version numbers, content digests. Never free text copied from
  a student's report, never an answer key, never question text.
- The log is pseudonymous, not anonymous. It holds no student account id and no report text, but a flag id sits beside
  the student's account id in the `flags` table (`supabase/migrations/20261101120000_flags_and_submit_flag.sql`), so
  while that report exists the owner (or anyone with database access) can link an audit row to that student. The link
  exists only while the report exists.

What happens when a student deletes their account: the existing delete-my-account function removes the student's rows
by cascade (profile, attempts, review state, exam plans, study events and their flag reports;
`supabase/migrations/20261102110000_delete_my_account.sql`). The audit table is not one of those rows. Its flag
ids then point at nothing, so the link to the student is gone from the live database. Whether database backups or older
copies of the log keep the link for a while is not verified (backups are still unverified, docs/BACKUPS.md); that is a
question for Christian, and for a lawyer if he wants one, before launch. This plan makes no legal claim. The pgTAP test for this stays, and a new
test checks that no audit row can hold a student id. The admin's own account id is stored without a cascade, so the log
is not wiped if his account were ever deleted; that case is covered by a plain note in the plan, not by code.

Who can read it: only the admin, only through `admin_list_audit` (admin check first). No website role has any grant on the
table, and nothing can edit or delete rows, so it is append-only for everyone but the database owner.

Export-my-data: because rows that name a student's own flag are linkable to them, the proposal is to include, in
export-my-data, only the audit rows (time, action code, new state) that reference that student's own flags, through a
student-callable function that returns just those fields and nothing about other people or about the owner's other
actions. The other option is to leave them out and say plainly on `/privacy` that the owner's handling of a report is
logged. Decided on 2026-11-05 (question 6): included in export-my-data.

Retention: keep rows for 2 years, then delete older ones by hand or a scheduled job. The 2 years was a proposal; Christian agreed on 2026-11-05 (question 7, decided: 2 years).

Each admin action writes its row inside the same function, so an action cannot happen without a row (the transaction
fails together).

Approval receipt. A publish (and any override) is tied to exactly what Christian approved: the row records the
immutable version id and a content digest (a hash, a short fingerprint) defined once, below, and taken inside the same function. If even one character changes after he approves, the digest no
longer matches and the publish is refused until he approves again. Only non-clinical formatting checks may be
overridden by a button. The answer-key and reserved checks and the clinical review gate can never be waived this way;
they pass or the version stays a draft. Question 4 decided this on 2026-11-05.

The receipt covers every way of publishing, not only the console. Today the command-line importer can publish too:
the batch checker needs five reviewer files but no particular one (not Christian's; `scripts/check-batch/check.ts`,
`docs/BATCHES.md`), the importer's `--apply --publish --yes` is a typed flag and not a proof that Christian approved
(`scripts/import_batch.ts`), and `publish_item_version` only checks that the version is a complete draft and that the
caller is the service role (`supabase/migrations/20261102090000_publish_item_version.sql`). So the same rule applies to
both paths: `publish_item_version` (and the future `admin_publish_version`) must refuse unless a matching receipt exists
for that exact version id and content digest. Closing the importer gap is its own `needs-christian` pull request
(database function plus importer change) and can ship before the console. Although question 4 is decided, publishing
real content through either path stays blocked until the database enforcement is built and verified by tests: the importer keeps writing drafts only for real content.

Design requirement: enforce the receipt at the database boundary, for every write that sets a version to published. A
check inside `publish_item_version` or `admin_publish_version` alone is not enough, because the migration gives the
service role direct update on the table (`supabase/migrations/20261101090000_items_and_versions.sql`, the `grant select,
insert, update, delete on table public.item_versions to service_role` line), so a direct status update, from the
importer or anything holding the service key, would skip a function-only check. (A review chat also reported this from
the staging database's settings; I confirmed the grant in the migration file, not in the live database.) So:
- The guard trigger on `item_versions` (`item_versions_guard`) refuses any change to `status = 'published'` unless an
  approval receipt row exists for that exact version id and the current content digest (defined next). This holds for every writer, the owner and service role included, and for the importer.
- The service role loses direct update of `status`, and the publish function becomes the only door. A restrictive
  row-level policy cannot do this, because the service role bypasses row-level security (Supabase docs, Row Level
  Security, "Bypassing Row Level Security"), and today it holds table-wide update. The one model chosen, and why:
  - Model: no new owner and no new powerful role. The tables stay owned by the existing database owner (`postgres`).
    The publish functions become `security definer` with `search_path = ''`, owned by that same owner. `revoke update
    on public.item_versions from service_role`, then `grant update` back only on the non-status columns the importer
    still needs.
  - Why not a dedicated `publisher_owner` role that owns the tables: moving table ownership could break later `alter
    table` migrations (the staging owner is not a superuser, so the migration role would need to stay a member of the
    new owner and the importer and website roles must never be able to assume it), and a non-owner definer cannot read
    `admins` or `auth.mfa_factors` or pass row-level security without extra grants. Keeping `postgres` as owner avoids all
    of that: it already reads those tables, is the owner, and is exempt from row-level security as long as the migrations
    never `force row level security` (they only enable it; the plan forbids adding force without revisiting this). That
    owner exemption is Postgres behavior as I know it; I could not open the Postgres page in this session, so the
    migration author must re-check it against the Postgres "Row Security Policies" documentation first.
  - Today `publish_item_version` is `security invoker` with `execute` granted to `service_role`
    (`supabase/migrations/20261102090000_publish_item_version.sql`), so it runs with the caller's rights. Changing it to
    `security definer` is what lets it keep working after the caller's `status` update is revoked.
  - Execute grants go to roles, not to functions. The inner `publish_item_version` gets `execute` for exactly the
    importer's role (today `service_role`) and the owner, revoked from `public`, `anon` and `authenticated`.
    `admin_publish_version` gets `execute` for `authenticated` only and begins with `is_admin()` like every other admin
    function: the owner can call `is_admin()` (its `execute` is revoked from every website role and the service role,
    migration lines 67 to 85, but not from the owner), and a `security definer` function owned by the owner still sees the
    real visitor's sign-in claims, so it judges the visitor, not the owner. The generic rule (every admin function starts
    with `is_admin()`) therefore has no exception.
  - The receipt and digest check runs inside the function, and the guard trigger repeats it as a second, independent
    gate, so a grants mistake alone still cannot publish.
  - A receipt expires (proposal: 24 hours after approval; Christian can change it), so an old approval cannot be
    reused later.
- Receipt rows are written only by the admin approval function (admin check first), never by the importer or by a
  website role, and this is enforced by grants, not by row-level security (the service role bypasses that):
  `revoke insert, update, delete` on the receipts table from `service_role`, `anon` and `authenticated`; only the
  approval function's role may insert; receipts are immutable (no update or delete grant for anyone but the database
  owner, plus a trigger that refuses changes), so a receipt can only expire, not be edited.
- One canonical digest, versioned (a version label is stored with every receipt, so the recipe can change later without
  confusing old receipts). It is a hash over, in this fixed order: the question's type (single or select-all, from
  `items.type`), its concept (`items.concept_id`, proposed, see the checklist), the ordered choices (id and text), for every choice its correctness flag (`item_answers.is_correct`) and
  its rationale, the stem, and the source (identity plus title, publisher, url and license). Nothing else, and nothing left out: the type matters because it can still
  change while every version is a draft (`items_guard`), and the correctness flags are the answer key itself. The
  database computes it; no caller supplies it.
- Tests: a direct `update ... set status = 'published'` as service role fails without a receipt; fails with a receipt
  for an older digest after any edit; works with a matching receipt; the importer's publish path fails the same way. Negative tests, each run through the publish function AND through a
  direct service-role status update: after approval, changing the question type blocks publishing; flipping any one
  correctness flag blocks it; editing a choice, a rationale, the stem or the source blocks it; reordering choices blocks
  it; a receipt with an old digest-recipe version blocks it.
  Database (pgTAP) tests for the grant model:
  negatives, a direct service-role `update ... set status = 'published'` is denied (even with a valid receipt on file);
  an expired receipt is denied; a receipt for a different version id or a mismatched digest is denied; a missing
  receipt is denied; the trigger alone also refuses when the grant is temporarily restored inside the test.
  Also: the publish function succeeds when called by the importer's role (this proves the owner-exempt row-level-security
  model works, with no `bypassrls`); `anon` and `authenticated` cannot call the inner `publish_item_version` directly;
  a direct `service_role` insert, update or delete on the receipts table is denied; the signed-in owner's approval
  function (two-factor session) creates a receipt for exactly that version id and digest, and a non-admin or
  one-factor call is refused.
  Through `admin_publish_version`, called as real signed-in roles: a real `aal2` admin with a verified factor succeeds; an
  unauthenticated call, an `aal1` session of the same admin, a signed-in non-admin, and an admin whose factor was removed
  are each refused; and `authenticated` cannot select from `admins` or `auth.mfa_factors` directly.
  Positives, the publish function succeeds for a draft with a matching, unexpired receipt; a service-role update of a
  non-status column still works.
This is a requirement for the importer-gate pull request and for Phase 3. No grants, migrations or settings are
changed by this plan, and real content stays unpublished until this enforcement is built and verified.

### 4.2b Step-up for destructive admin actions

Destructive actions (unpublish, retire, hide, publish) must not rely on the age of the sign-in token alone. I checked
`supabase/migrations/20261102160000_fresh_sign_in_and_name_rules.sql`: delete-my-account compares the token's `iat`
(issued-at) to the clock, and that file itself says a refreshed token gets a new `iat`, so it does not prove the person
signed in just now. The same weakness exists in delete-my-account today and is tracked separately (not fixed here).

For the admin console the requirement is a server-verifiable re-authentication event with a timestamp the server checks
on its own:
- Preferred: a short-lived step-up proof recorded in the database when the admin re-enters an authenticator code (a row
  with the admin id, the session id, a created time and a few minutes of lifetime, written only by an admin function
  that first confirms a fresh two-factor code). Each destructive function requires an unexpired proof for the caller's
  current session and consumes or time-limits it.
- Possible alternative, unverified: the `amr` claim in Supabase's token lists sign-in methods with timestamps. Its
  behavior on refresh is not documented as far as the migration notes say, so it is not used unless Supabase's docs and
  a staging test confirm the semantics.
- The admin row, `aal2` and verified-factor checks stay on as additional requirements, not replacements.
- Tests: an existing session whose token was just refreshed is rejected (new `iat`, no proof); an expired proof is
  rejected; a simulated stolen refresh token (a new session for the same admin with no proof of its own) is rejected;
  a proof from another session is rejected; a valid, unexpired proof for the current session succeeds.

### 4.2a Implementation checklist for the migration author

This plan is design intent. The migration pull request must prove every line below with pgTAP in a real Supabase
database; nothing here is a verified design. No grants or migrations change in the plan pull request.

- Roles and owners: tables and functions stay owned by `postgres`; no NEW `bypassrls` role, no `force row level
  security`. Plainly: `postgres` (and `service_role`) already have `bypassrls` on staging (reported from `pg_roles`, to be
  re-verified), so a `security definer` function owned by `postgres` runs with broad row-level-security bypass. The trust
  boundary is therefore not an absence of bypass. It is the narrow `execute` grants, the `is_admin()` and `aal2` check,
  the function's own logic, and the immutable receipt trigger. Visitors cannot become `postgres`, but any definer function
  they can call runs with its privileges, so each one must be small and checked.
- `item_versions`: `revoke update` from `service_role`, then `grant update` on non-status columns only.
- Functions: `publish_item_version` becomes `security definer`, `search_path = ''`; `execute` revoked from `public`,
  `anon`, `authenticated`, granted to the importer's role (and owner). `admin_publish_version` and the receipt-approval
  function are `security definer`, `search_path = ''`, start with `is_admin()`, `execute` for `authenticated` only.
- Row-level security: owner exemption relied on; re-check the Postgres docs; test publishing as the importer role.
- Receipts table: row-level security on, restrictive deny-all for website roles; `revoke insert, update, delete` from
  `service_role`, `anon`, `authenticated`; only the approval function writes; immutable (trigger refuses update and
  delete); expiry enforced.
- Digest: one canonical versioned digest computed in the database over question type, ordered choices, every
  correctness flag, rationales, stem and source.
- Guard trigger: `item_versions_guard` refuses `status = 'published'` without a matching, unexpired receipt, for every
  writer.
- Audit: `admin_audit` append-only, no grants to website roles, one row written per action in the same transaction.
- Schemas: no website role gets read on `admins` or `auth.mfa_factors`; `app_private` is not widened. If a separate
  publisher role is ever chosen instead of this model, it needs `usage` on any schema it uses and `execute` on exactly
  the helpers it calls, and the ownership-transfer risk above must be smoke-tested on a throwaway database first.
- Step-up: destructive admin functions require the server-recorded step-up proof of 4.2b (not `iat` alone), with its
  tests; delete-my-account has the same `iat` weakness and is tracked separately.
- Receipt revocation: receipts stay append-only and immutable, but a wrong approval must not stay usable for the whole 24
  hours. A separate `receipt_revocations` record (receipt id, time, admin id, short reason from a fixed list) is written
  only by a founder-authorized admin function (`is_admin()`, step-up, audit row). Both the publish functions and the
  status guard check it and fail closed: a revoked receipt, or any failure to look the revocation up, means refuse, with
  a "receipt revoked" reason. Revocation grants follow the receipts rules (no website or service-role write). pgTAP: approve,
  then revoke, then try to publish through the importer path, through `admin_publish_version`, and through a direct
  status transition (grant temporarily restored); each is refused with the revocation reason; an unrevoked receipt still
  works; a simulated lookup failure refuses.
- Receipt-read guard: `item_versions_guard` is `security invoker` today
  (`supabase/migrations/20261101090000_items_and_versions.sql`), so its planned receipt read would run as the caller. It
  becomes `security definer`, owned by `postgres`, `search_path = ''`, and receipts are readable only through it. pgTAP
  must show the refusal is the receipt or digest refusal and not a generic "permission denied" on the receipts table:
  (a) through the inner publish function, (b) through a direct service-role status update with the status grant
  temporarily restored, (c) a valid receipt succeeds, (d) a stale digest is refused as its own case.
- Sources and concepts visibility is gated too (chosen approach): today `--publish` sets `sources.published` and
  `concepts.published` in separate requests before it calls `publish_item_version`
  (`scripts/import-batch/db.ts`, `plan.ts`), and `service_role` can write them directly, so a refused receipt would not
  roll them back. Chosen: revoke `update` of `published` on `concepts` and `sources` from `service_role`, and let only
  the approved publish function set them, inside the same transaction as the version (so they stay unpublished until it
  succeeds). Negative integration test: `--publish` with a missing, invalid or expired receipt leaves every affected
  question version, concept and source unpublic.
- Insert is covered too (verified: `service_role` has `insert` and `update` on `concepts` and `sources` in
  `20261101080000_concepts_sources_rights.sql`, and the importer builds new rows with `published: options.publish` and inserts
  them before it publishes). Revoking `update` of `published` alone would leave `insert ... published = true` open. So a
  fail-closed guard trigger on both tables covers INSERT and UPDATE: a new row is always stored as `published = false`
  whatever the caller sends, and `published` can become true only inside the authorized atomic publish function (which
  checks the receipt, expiry and revocation). pgTAP: `--apply --publish` with new and with existing concepts and sources,
  and with a missing, expired or revoked receipt, leaves every concept, source and question version unpublished; a direct
  service-role insert of a published row is stored unpublished.
- Deletes: `service_role` also holds `delete` on `items`, `item_versions` and `item_choices`, and the guard fires only on
  insert and update, so a published version with no attempts could be hard-deleted with no step-up or audit. Revoke
  `delete` on those three tables from `service_role`; retiring or hiding happens only through the audited admin functions.
  pgTAP: a direct service-role delete of a newly published version is refused; the approved retire and hide functions
  work and write their audit row.
- Concept reassignment: `items_guard` today refuses only type changes, and `service_role` has direct update on `items`,
  so an approved item could be moved to another concept (the importer refuses moves in `plan.ts`, but that is not a
  database rule). Add a guard that refuses changing `items.concept_id` once any version is published or retired, and
  include `concept_id` in the digest (proposed; Christian confirms that the concept mapping is part of what he
  approves). pgTAP: reassigning a concept is refused after publication; before publication it is allowed but
  invalidates an existing receipt (the digest changes), through both the publish function and a direct update.
- Source details: `sources` rows (title, publisher, url, license) are writable by `service_role` and a change does not
  change `source_id`, so attribution or license could change after approval. The approval covers the source's identity
  and its attribution and license details, so the digest includes the source's title, publisher, url and license, not only
  its id. Chosen: published sources are immutable for every writer (a guard), and any correction goes through an
  owner-authorized, audited function that invalidates the receipts of every affected version (their digest changes, so
  they must be approved again). pgTAP: after approval, changing a source's url, publisher or license (each separately)
  is refused directly, and through the audited function it invalidates the receipt and blocks publishing until
  re-approval.
- Concept moves: after publication, a direct `items.concept_id` change is blocked for every writer (a guard, not just
  the importer's rule). Any move goes through an owner-authorized, audited function that requires a fresh receipt
  (new digest). pgTAP negative: a direct service-role update of `concept_id` on a published item is refused.
- Unapproved callers: pgTAP shows `public`, `anon` and `authenticated` callers that are not the approved admin cannot use
  the owner's elevated privileges through any definer function in this plan (every one refuses first).
- Tests: every item in the pgTAP lists above, plus the "approved list of executable functions" test, plus a
  throwaway-database run of all migrations from scratch and from the current staging state.
- Supabase guidance: test each grant against Supabase's guidance on `auth`-schema permissions and `security definer`
  functions before relying on it.

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
| Stolen session (cookie or token) | A stolen `aal2` session still works until it expires. Mitigations: short admin sessions (ask: set Supabase's session time-box and inactivity timeout, if the free plan allows; I will read the docs and confirm before proposing), destructive actions need a server-verified step-up (see 4.2b; the 10-minute `iat` check used by delete-account is not enough, because a refreshed token gets a new `iat`), the audit log shows what happened, and Cloudflare Access (decision 3) is a second lock in front of the pages. |
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
- Phase 2 and 3, audit log: add wording that matches what the code does, for example: "When the site owner handles or
  acts on a report you sent, we log the time and the action next to that report's reference number. The log does not
  contain what you wrote or your account details, but while your report exists the two can be linked. When you delete
  your account your reports are deleted and the log no longer links to you. Entries are kept for [period]." Final
  wording follows the export and retention decisions, and is not legal advice.
- Delete-my-account and export-my-data: delete-my-account needs no change (the audit rows hold no student id and become
  unlinked when the report is deleted; a test enforces both). Export-my-data may need a small addition, see 4.2.

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

### Before any admin page is public: Cloudflare Access (only if you say yes to decision 3)

Reported by a review chat, not verified by me: Cloudflare Access is not set up for `cueory.app` today, and the database
check (admin row, two-factor) is a separate control that does not depend on it. These are your steps, and I change no
setting myself. Claude will first read Cloudflare's current Access docs and give you the exact button names.

1. Sign in to Cloudflare with the business Gmail account. You should see the account home.
2. Open Zero Trust (Cloudflare's access-control area). You should see its dashboard or a short first-time setup.
3. Choose the free plan if asked. You should see no payment request (stop and tell Claude if there is one).
4. Add a self-hosted application for the admin address of the live site. You should see it listed.
5. Add a rule that allows only your own business Gmail address. You should see exactly one allowed email.
6. Open the admin address in a private window. You should be asked for an emailed code and refused for any other email.
7. Tell Claude it works. Only then does any admin page go on the live site.

No admin work touches the live database until it is set up under the existing prelaunch plan. Reported by a review chat,
not verified: `cueory-staging` has the 17 migrations applied and `cueory-prod` has none yet. Everything in Phases 1 to 3
is built and tried on staging only; the "repeat on `cueory-prod`" steps above wait for that prelaunch setup.

## 10. Decisions for Christian

Christian answered on 2026-11-05. Nothing has been started; building Phase 1 begins only when he says so.

1. **DECIDED, yes (2026-11-05).** Build Phase 1 (read-only dashboard) first. Phases 2 and 3 each need a separate go-ahead.
2. **DECIDED, yes (2026-11-05).** A reversible "hidden" switch, separate from "retired".
3. **DECIDED, yes (2026-11-05).** Cloudflare Access in front of `/admin` on the live site, on top of the sign-in,
   authenticator code and database checks. His steps (section 9) come before any admin page is public.
4. **Publishing rule.**
   - **DECIDED, yes (2026-11-05):** every publish, from the console or from the importer or service role, must carry an
     approval receipt for the exact version and content digest, enforced at the database boundary (the design
     requirement in section 4.2). The hold on real content stays until that enforcement is built and verified.
   - **Deferred (2026-11-05):** no skip-checks button for now. Treat it as no override of any check in Phases 1 and 2;
     revisit at Phase 3.
5. **DECIDED, yes (2026-11-05).** Students are shown by short account id only in Phase 1 (no emails or names). Later, a
   separate small pull request adds an optional student handle ("@name") field; it needs his approval first.
6. **DECIDED, yes (2026-11-05):** a student's own audit rows (the ones that reference their own flags) are included in
   export-my-data, as described in 4.2. Still to do before launch, not decided: check backups and old log copies for
   leftover links (not verified today).
7. **DECIDED, yes (2026-11-05).** Keep the audit log for 2 years, then delete older rows.
