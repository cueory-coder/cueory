# Security

## Reporting a problem

If you find a security or privacy problem in Cueory, please email **hello@cueory.app**, or use GitHub's
**Security → Report a vulnerability** form on this repository if it's shown. Please don't open a public issue. We aim
to reply within 7 days.

## Rules every change must follow

1. **Row-level security on every table.** No table is created without RLS enabled and explicit policies.
2. **Protected data stays on the server.** Answer keys, correct choices, reserved checks, reviewer results and admin
   data never reach the browser except through permission-checked RPC functions (`security definer`, fixed
   `search_path`, explicit `auth.uid()` and role checks). They are never committed to a public repository.
3. **No secrets in code, commits or chat.** Secrets live only in GitHub Actions secrets, Cloudflare settings and
   Supabase settings. The browser only ever gets public keys (for example Supabase's *publishable* key). CI scans every
   commit with gitleaks, and GitHub secret scanning with push protection is on wherever GitHub offers it.
4. **Strict headers.** Every page has a content security policy (hash-based, no `unsafe-inline`/`unsafe-eval`, forms
   may post only to our own site and our newsletter provider), `frame-ancestors 'none'`, HSTS, `nosniff`, a strict
   referrer policy and a locked-down permissions policy. See `public/_headers` and `astro.config.mjs`.
5. **Validate input everywhere**, on the server as well as in the browser.
6. **Rate limits** on sign-in, sign-up and every form. The newsletter form relies on Kit's own abuse protection and
   double opt-in; our own forms (from Task 2) get server-side limits.
7. **Automated checks stay on:** Dependabot, CodeQL, secret scanning, and CI on every pull request.
8. **Two-factor authentication** is required on the admin account and on every account that controls the business
   (GitHub, Cloudflare, Kit, Google, and from Task 2 Supabase and Resend).
9. **Business accounts use Christian's business Gmail**, never an address on `cueory.app`, so a domain or email
   problem can't lock him out. Email DNS records (MX, SPF, DKIM, DMARC) are never changed without asking him.
10. **Locked staging.** The staging site (and every preview) is behind Cloudflare Access, limited to Christian's email.
    From Task 2, `/admin` is locked the same way, and every admin action is checked again in the database.
11. **Review.** Codex reviews every pull request. Christian approves anything touching auth, database policies,
    payments, workflows, deployment or secrets. Nobody merges their own pull request into `main`.

## Backups

From Task 2, the production database is dumped nightly by a GitHub Actions job and encrypted before it is stored.
The restore steps will live in `docs/OPERATIONS.md`.
