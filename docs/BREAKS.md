# Sharing break ideas — proposal only

**Status:** planning. Nothing here is live, and this document does not authorize a database change or public submissions.

## What students would see

The `/breaks` page first shows Cueory's reviewed, prewritten ideas. A signed-in student may suggest one short break idea through a clearly marked form. The confirmation says **"sent for review"**, never "published". Students without an account can still read the approved ideas. The page does not ask for a school, patient details, location, or other personal information.

Each approved contribution appears as plain text with a **"flag or comment"** control. No profiles, reply threads, popularity scores, external links, automatic posting, or clinical advice in version one. On phones, tablets and desktops, submission and reporting must work by keyboard and tap, with visible focus and accessible status messages. No pop-up interrupts a study session to request a submission.

## Private storage and permissions

A later migration can add `public.break_ideas` with:

| Field | Purpose |
| --- | --- |
| `id` (UUID, primary key) | Stable identity for review, reporting and deletion |
| `user_id` (UUID, required, references `auth.users` with `ON DELETE CASCADE`) | The submitting account, **never returned in public results** |
| `text` (required, at most 60 Unicode code points after trimming) | The proposed idea |
| `status` (`pending`, `approved`, `rejected`, `withdrawn`) | Moderation state, initially `pending` |
| `created_at` and `reviewed_at` (timestamps) | Rate limiting, review and retention |

Enable row-level security before any API access. A signed-in student may read **only their own** submissions and their review status. Give neither anonymous nor signed-in website roles direct insert, update, or broad select rights. Students must not be able to approve ideas or change ownership. Use tightly scoped functions for submission, withdrawal and public listing. The public `list_approved_break_ideas()` function returns only `id` and `text`, never an author ID or moderation data. Do not send pending or rejected text to site HTML, cached pages, search or a public API.

This would add a new category of user-generated data to Cueory's current data-minimization policy. **Christian must approve that change**, and `/privacy` must describe it accurately **before** submissions are enabled. Otherwise keep the page read-only.

## Sending and validating a suggestion

A future `public.share_break_idea(idea_text text)` RPC is `SECURITY DEFINER`, has `SET search_path = ''`, uses schema-qualified objects, and explicitly rejects a missing `auth.uid()`. Revoke default execution from `PUBLIC` and `anon`, then grant it to `authenticated` only. It sets `user_id` from `auth.uid()`, not from a browser argument, and always inserts `pending`.

The server must enforce the intended rules from `src/islands/breakideas.ts` and `checkSharedIdea`: nonempty trimmed text, **1–60 Unicode code points**, no control or direction-changing characters, no invisible-only content, and no web links, hostnames or email addresses. Keep accepted emoji safe. The client check improves feedback but never substitutes for the server check.

**Important parity risk:** `checkSharedIdea` uses JavaScript Unicode normalization, emoji-joiner checks and browser URL/IDNA parsing. A simple PostgreSQL regular expression cannot automatically reproduce all of those rules. Before release, run a shared set of valid and invalid examples against both implementations, including Unicode, full-width dots, disguised domains, invisible characters and joined emoji. If exact parity is not practical, narrow **both** validators to the same documented safe input set and reject anything outside it. Never accept a value in SQL solely because the client accepted it.

**Proposed limit:** three submissions per account in a rolling hour, including pending, rejected and withdrawn submissions. The RPC checks the count and inserts in one transaction, using a per-account transaction advisory lock so simultaneous requests cannot evade the limit. It returns a plain success or rate-limit message, with no internal data. Do not grant users direct deletion that would reset the count.

## Moderation and reporting

Only Christian can approve, reject, hide or withdraw a public idea in the locked `/admin` area. A later admin inbox should use the existing admin-role pattern after Task 65 is available, require an authenticated admin with **MFA assurance level 2**, and check both requirements inside every `SECURITY DEFINER` RPC. The page displays contributions as **text, not HTML**. Pending items stay private. Reject identifying details, patient stories, addresses, promotional content, unsafe suggestions and medical claims. Rejection never silently publishes anything; an approved idea can be hidden immediately if a report raises concern.

Every approved idea needs its own **"flag or comment"** action. The existing question-item fields are not break-idea identifiers: do **not** place an idea ID in `item_id`. A later migration should give reports a distinct, validated `break_idea_id` (or a dedicated reporting function) and route reports to Christian's admin inbox. Use the existing authenticated, rate-limited reporting pattern. Reports and reporter identity stay private. The admin must be able to hide the idea and mark the report handled.

## Downloading and deleting data

Extend the account's **export-my-data** result with the student's own `break_ideas` rows: idea ID, submitted text, status and date. Do not export another student's idea or private admin notes. Extend `delete_my_account()` and its tests so deleting an account removes **all** of its suggestions, including approved ones, and its own reports. The foreign key's `ON DELETE CASCADE` is a second safeguard, not a replacement for verifying the deletion path. Reports by other users may remain only in the private inbox without the deleted text or identity.

Proposed retention: remove rejected and withdrawn submissions after 30 days, unless a specific unresolved abuse report requires temporary retention. An approved idea remains until it is withdrawn, hidden or its author deletes their account. Explain any final retention rules in `/privacy` before launch.

## Tests and release gate for later implementation

Test cross-language validation parity, unauthenticated refusal, per-user RLS, simultaneous submission attempts at the hourly limit, no public pending content, admin-only approval with MFA, reporting, export isolation and complete account deletion. Check accessible form errors and successful submissions at phone, tablet and desktop sizes. Keep the feature disabled until these tests, Codex review, locked staging review and Christian's required approval pass.

## Questions for Christian

1. Should contributions be **anonymous by default** (recommended), or may students opt in to showing their display name?
2. Is **three submissions per rolling hour** an acceptable limit?
3. May Cueory store students' suggested break ideas as a new data category, with an updated privacy notice?
4. Should a student be able to withdraw an approved idea at any time (recommended)?
5. Is the **30-day** rejected/withdrawn retention proposal acceptable, and who covers moderation when Christian is unavailable?
