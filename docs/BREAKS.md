# Study breaks — current tools and future sharing

**Status:** The optional timer and labeled sample ideas work on `/breaks`. Sharing an idea with other students is only a proposal. It is **not enabled**, and nothing below authorizes a database change.

## What works now

Students can turn on a quiet timer and browse sample break ideas without signing in. The sample wording is still awaiting content approval. No real user-submitted ideas appear on this page.

## Timer settings

The `/breaks` page uses these defaults. The code also accepts valid custom settings, but this page has no settings editor.

| Code setting | Default | Allowed range | Meaning |
| --- | --- | --- | --- |
| `focusMinutes` | 25 minutes | 10–60 minutes | Length of a study period |
| `breakMinutes` | 5 minutes | 3–15 minutes | Length of a break |

## Timer phases

| Phase in code | What happens |
| --- | --- |
| `off` | The timer starts here and stays off until the student turns it on |
| `focusing` | The study countdown runs toward a saved end time |
| `break due` | The countdown stops and waits for a choice: start break, skip, or 5 more minutes |
| `on break` | The break countdown runs; when it ends, a fresh study period begins |
| `paused` | The remaining time stays frozen until the student resumes |

Turning the timer off clears the active countdown. Pausing and resuming keep the exact time left. Choosing **5 more minutes** delays the break suggestion by five minutes. The timer never starts a break without the student's choice.

## Timer storage and accessibility

The timer saves its state and **saved end time** in the browser tab's `sessionStorage`. It measures time against that end time rather than counting ticks, so sleeping phones and hidden tabs do not stretch the countdown. A reload or another page in the same tab can restore a recent timer. A saved record older than **two hours**, invalid, or from the future is ignored, and the timer starts off.

If browser storage is blocked, the timer still runs in memory for this visit. The page says **"progress won't be saved"**. Nothing about the timer is sent to an account or server.

The timer has no sound or animated ring, including with reduced motion. The time stays visible in words. Screen readers get polite updates when the phase changes or at selected minute marks, not every second. Buttons are keyboard- and tap-friendly with visible focus.

## Choosing a break idea

Use **any break**, **short break**, or **long break** to filter the sample list and the **show me one** picker. A reviewed idea may have an optional `short` or `long` length tag. Untagged ideas fit **either** choice. Today all 20 labeled samples are untagged, so the short and long lists currently contain the same ideas.

After picking one, **another idea** offers a different idea when more than one is eligible. If only one is eligible, that idea can repeat. The new idea is politely announced, and keyboard focus stays on the button. **Shuffle the ideas** changes their order. These choices stay in memory and are not saved or sent.

## Proposed sharing experience (not live)

### How a future sharing form could work

A future version would show reviewed, prewritten ideas and let a signed-in student suggest one short break idea through a clearly marked form. The confirmation says **"sent for review"**, never "published". Students without an account can still read the approved ideas. The page does not ask for a school, patient details, location, or other personal information.

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
