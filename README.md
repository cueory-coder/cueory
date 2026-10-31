# Cueory

Free, calm study help for nursing students in fundamentals and med-surg I. Lessons are built from short, standalone
"atomic sentences". Live at **https://cueory.app**.

## What's here (plain-language tour)

| If you want to… | Open this |
| --- | --- |
| See what's done, what's waiting, and what needs you | [docs/STATUS.md](docs/STATUS.md) |
| See what's coming next | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Follow the Cloudflare and Kit setup steps | [docs/SETUP.md](docs/SETUP.md) |
| Change colors, fonts, sizes or spacing | [src/styles/tokens.css](src/styles/tokens.css) |
| See the brand rules (colors, fonts, logo) | [docs/BRAND.md](docs/BRAND.md) |
| Remove the "We're still building" notice, or change the tip link, contact email or signup form | [src/config/site.ts](src/config/site.ts) |
| Edit lesson text | [content/lessons/](content/lessons/) |
| Read the project rules | [CLAUDE.md](CLAUDE.md), [SECURITY.md](SECURITY.md) |
| Read why things were built this way | [docs/DECISIONS.md](docs/DECISIONS.md) |

You can edit any of these files right on GitHub: open the file, click the pencil icon, make your change, and choose
**Create a new branch and start a pull request**, with `staging` as the target.

## How a change reaches the live site

1. Every change is made on its own branch. Those branches are tested and reviewed but never published anywhere.
2. Automated checks run: the site builds, tests pass, accessibility checks pass, no secrets are leaked.
3. Codex reviews the change. You approve anything touching sign-in, the database, payments, deployment or secrets.
4. The change is merged into **`staging`**: automatically once the checks and Codex are clean, or by you when it
   touches a sensitive area (those get a `needs-christian` label). Until the site is live for students
   (`automation.json`, D-42), fewer areas wait for you: the automation, the rules files, content, the database and
   deployment settings. Cloudflare publishes `staging` to a locked preview address that only you can open.
5. You check it there. If it's good, you merge `staging` into **`main`**, and Cloudflare publishes it to
   **cueory.app**.

## Where things are hosted (all free plans)

- **Cloudflare Workers**: the website (plain static files). `main` is the live site; every other branch gets a
  preview address (D-38).
- **Cloudflare Access**: locks the staging site and every preview to your email.
- **Kit**: launch-update emails and signups (free up to 10,000 subscribers).
- **GitHub**: the code, automated tests and security scans.
- From Task 2: **Supabase** (accounts and study progress) and **Resend** (sign-in emails).

Monthly cost: $0 apart from the domain. Nothing paid is added without your written approval.

## For engineers

```
npm ci
npm run dev       # local dev server
npm run verify    # type check, build, unit tests, browser + accessibility tests
```

Requires Node 24 (see `.node-version`). Read [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) before contributing.
