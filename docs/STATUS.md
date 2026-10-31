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

## In review
- [Task 1 pull request into `staging`](https://github.com/lilchristxan/Cueory/pull/1). Needs Codex review and
  Christian's approval, because it adds workflows and deployment settings.
- **Task 3 batch checker** (`npm run check-batch`, format in docs/BATCHES.md). Pull request stacked on Task 1;
  needs Codex review. It runs only on your computer and never touches the live site.

## Blocked
- **Signup form** shows "Signups open soon" until the Kit form exists (SETUP.md, Part I).

## Needs Christian's hands
Follow [docs/SETUP.md](SETUP.md):
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
