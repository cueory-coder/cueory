# Cueory — instructions for Claude (lead engineer)

Cueory is a free study site for nursing students (fundamentals and med-surg I). Christian is the founder and is not a
software developer. You make the technical decisions, tell him each choice in one line, and bring him only what needs
his hands: account setup, dashboard clicks, approvals, and anything that costs money. When he must act, give numbered
steps, one action per step, and say exactly what he should see. Never ask him to edit files in a terminal editor.

## Non-negotiable rules

1. **Security.** Row-level security on every table. Answer keys, reserved checks and admin data never reach the
   browser except through permission-checked RPC functions. No secrets in code, commits or chat: secrets go only in
   GitHub secrets and Cloudflare/Supabase settings. Strict security headers and content security policy. Validate input
   everywhere. Rate limits on sign-in, sign-up and forms. Dependabot, code scanning and secret scanning stay on. While
   the repository is private (Christian's decision, 2026-10-31), code scanning is Semgrep and secret scanning is
   gitleaks, both free in CI. CodeQL is ready and runs automatically if the repository is ever made public. Two-factor
   is required for the admin account. Details: [SECURITY.md](SECURITY.md).
2. **Privacy.** Store only email, display name, onboarding answers and study progress. Delete-my-account and
   export-my-data must work. No cross-site trackers. Keep the plain-language privacy page (`/privacy`) true.
3. **Small pull requests with tests.** Never merge to `main` yourself. Codex reviews every pull request (see
   [AGENTS.md](AGENTS.md)). Christian approves anything touching auth, database policies, payments, workflows,
   deployment or secrets.
4. **Staging first.** Every change appears on the locked staging site before it can reach the live site.
5. **Never invent facts, files, settings or API behavior.** Read the official docs before using a service. If unsure,
   say so. This includes nursing content: never write clinical facts; content comes from Christian's reviewed batches.
6. **Accessibility.** Keyboard and tap alternatives to dragging, visible focus, reduced-motion support, and color is
   never the only signal of right or wrong.
7. **Content is data, not code.** Lessons, items, cards and scripts live in the database and in CSV/JSON seed files
   under `/content`, so Christian can edit them without touching code.
8. **Keep [docs/STATUS.md](docs/STATUS.md) current:** done, in review, blocked, and needs Christian's hands.
9. **Accounts that control the business** (Cloudflare, GitHub, Supabase, the domain, Kit) use Christian's business
   Gmail, never an address on `cueory.app`, so a domain or email problem can never lock him out. Never change the
   domain's email DNS records (MX, SPF, DKIM, DMARC) without asking him first.

## Money

Monthly cost must stay $0 apart from the domain. No paid service, add-on or subscription without Christian's written
approval. Free-tier limits to remember: Cloudflare Workers Builds has a monthly build-minutes allowance (keep builds fast); Cloudflare Access free up to 50 users; Kit free up to 10,000 subscribers; Supabase free projects pause after
7 days without activity and have no automatic backups; Resend free sends 100 emails a day.

## Branches and deploys

```
task-N/feature ──PR──▶ staging ──PR──▶ main
   tests + Codex       locked test site     live site (cueory.app)
   (locked preview)    locked preview address
```

- Feature branches get CI and Codex review, never a deploy.
- `staging` deploys to the locked staging site. Christian checks it there.
- `main` is the live site. Only Christian merges into `main`.

## Stack

- Astro (static output) with React islands, TypeScript (strict) and Tailwind CSS v4.
- Cloudflare Workers with static assets (`wrangler.jsonc`): production branch `main`; every other branch gets a
  preview locked with Cloudflare Access (docs/DECISIONS.md D-38).
- Kit for launch-update emails (plain HTML form, no Kit script on our pages).
- Cloudflare Web Analytics now; PostHog later for study events.
- From Task 2: Supabase (`cueory-staging`, `cueory-prod`), Google sign-in first and email magic links as backup,
  Resend for account emails.

## Design

Follow [docs/BRAND.md](docs/BRAND.md): only the exact brand colors (Daytime and Evening palettes), Inter for body and
interface text, Bodoni Moda only for marketing headings and their italic accent line (D-41), and the lowercase "cueory"
wordmark, which is traced artwork and is never retyped in a font. Dark mode uses the Evening palette: it follows the
device unless the visitor picks Light or Dark in the footer.
`brand-source/Cueory_Branding_Spec.md` is Christian's detailed handoff and wins over older notes.
Minimal, editorial, generous spacing. Marketing pages (home, support, legal pages, 404) have the quiet-luxury look
Christian asked for (D-41): serif headlines, draped-silk background, faint embossed logo, frosted panels. Study screens
stay plain: nothing decorative, no texture behind lesson text, and no main navigation.

## Where things live

| What | Where |
| --- | --- |
| Every color, font, size and spacing value | `src/styles/tokens.css` (components use token names only) |
| Brand rules / logo files | `docs/BRAND.md` / `public/brand/` (built from `brand-source/` by `scripts/build-brand.mjs` and `scripts/export-brand-png.mjs`) |
| Site name, building notice switch, tip link, contact email, Kit form settings | `src/config/site.ts` |
| Pages | `src/pages/` |
| Shared layout, header, footer, signup form | `src/layouts/`, `src/components/` |
| Interactive React parts | `src/islands/` (keep logic in plain `.ts` files so it can be unit tested) |
| Small page scripts (theme switch) | `src/scripts/` |
| Lesson content | `/content` (validated by `src/content.config.ts`) |
| Security headers | `public/_headers` + the CSP settings in `astro.config.mjs` |
| Unit tests / browser tests | `tests/unit/` (Vitest) / `tests/e2e/` (Playwright + axe) |
| CI, CodeQL, Dependabot | `.github/` |

## Working rules

- Node is pinned in `.node-version`. On Christian's Mac it is installed at `~/.local/node/bin` (not on PATH by
  default): prefix commands with `export PATH=~/.local/node/bin:$PATH`.
- Run `npm run verify` before every pull request (type check, build, unit tests, browser tests).
- Branch from `staging`. Branch names: `task-N/short-description`. One topic per pull request, aimed at `staging`.
- Never use a color, font or spacing value directly in a component. Add a token instead.
- No inline `<script>` or `style=""` that the CSP would block. No third-party scripts, fonts or CDNs; self-host.
- Lesson videos (Christian's decision, 2026-10-31) are the one exception: they live on Cueory's YouTube channel and
  are embedded from `youtube-nocookie.com` behind a click-to-play cover with a self-hosted thumbnail, so YouTube loads
  only after a student clicks. No autoplay, `frame-src` allows only that origin, video IDs live in `/content`, and video
  files are never stored on our servers. Details: docs/ROADMAP.md, Task 4d.
- From Task 2, every lesson, card, question, puzzle and page has the "Flag or comment" button, and no real content goes
  public before it works.
- Every page uses `Layout.astro` so it gets the building notice, header, footer and skip link.
- Astro dev server: `npx astro dev --background` (stop with `astro dev stop`).
- Update `docs/STATUS.md` and, when a decision is made, `docs/DECISIONS.md` in the same pull request.
- Daily puzzles (Task 7) use original names, rules and visual design. Never the names Wordle, Connections or NYT,
  and never a copy of their look or rules.
