# Status

Last updated: 2026-10-31

## Done
- Static site: Astro + React islands + TypeScript + Tailwind, static output, tested at phone and desktop sizes.
- Design tokens in `src/styles/tokens.css`, with automated contrast checks on every color pair.
- Pages: home (with launch-updates signup), `/learn/study-skills` (Lesson 1 placeholder, read from
  `/content/lessons`), `/privacy` (draft), `/terms` and `/disclaimer` (marked spots for Christian's text), `/support`
  (Ko-fi link), `/subscribed` (after signup), 404. "We're still building" notice on every page.
- Brand guide applied (docs/BRAND.md): Daytime and Evening palettes with automatic dark mode, Inter, the "cueory"
  wordmark, tagline, favicon and logo files in `public/brand/`.
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

## Blocked
- **Signup form** shows "Signups open soon" until the Kit form exists (SETUP.md, Part I).
- **Logo**: the site uses a stand-in wordmark generated from Bodoni Moda Medium. It needs Christian's original logo
  file (SVG preferred) to match the artwork exactly.

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
- [ ] Add the original logo files (SVG preferred) to the `cueory/brand-source/` folder in Finder
