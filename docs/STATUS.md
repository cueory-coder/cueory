# Status

Last updated: 2026-10-31

## Done
- Static site: Astro + React islands + TypeScript + Tailwind, static output, tested at phone and desktop sizes.
- Design tokens in `src/styles/tokens.css`, with automated contrast checks on every color pair.
- Pages: home (with launch-updates signup), `/learn/study-skills` (Lesson 1 placeholder, read from
  `/content/lessons`), `/privacy` (draft), `/terms` and `/disclaimer` (marked spots for Christian's text), `/support`
  (Ko-fi link), `/subscribed` (after signup), 404. "We're still building" notice on every page.
- Security headers and a hash-based content security policy.
- CI on every pull request (type check, build, unit tests, browser + accessibility tests, gitleaks secret scan),
  CodeQL, Dependabot (targets `staging`).
- Rules and docs: CLAUDE.md, AGENTS.md, SECURITY.md, README, ROADMAP (Tasks 2–7), DECISIONS, SETUP.
- Repository branches: `main` (live) and `staging` (test), both starting from one empty commit.

## In review
- Task 1 pull request into `staging` (link in the chat). Needs Codex review and Christian's approval, because it adds
  workflows and deployment settings.

## Blocked
- **CodeQL, GitHub secret scanning and branch protection** don't run on a private personal repository without a paid
  GitHub plan. Waiting on Christian: make the repository public (recommended, free) or decide otherwise (D-07).
- **Signup form** shows "Signups open soon" until the Kit form exists (SETUP.md, Part I).

## Needs Christian's hands
Follow [docs/SETUP.md](SETUP.md):
- [ ] Decide: public or private repository
- [ ] A. Two-factor login on Google, GitHub, Cloudflare
- [ ] B. Turn on Codex reviews
- [ ] C. Connect the repository to Cloudflare Pages
- [ ] D. Limit builds to `main` and `staging`
- [ ] E. Lock the staging site
- [ ] F. Approve Task 1 into `staging`, check the locked staging site
- [ ] G. Approve `staging` into `main`
- [ ] H. Connect cueory.app, turn on Web Analytics
- [ ] I. Create the Kit account and form; decide on the mailing address shown in emails
- [ ] J. Decide whether hello@cueory.app should forward to your Gmail (needs email DNS records)
- [ ] Provide disclaimer and terms text
