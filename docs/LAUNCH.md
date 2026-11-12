# Launch checklist: games only

This is the plain checklist for the first public launch of Cueory: **the daily games only**, planned for
November 17 to 20 (the LAUNCH SPRINT note on issue #26). Accounts, real questions and lessons are not part of it.
They follow [GO-LIVE.md](GO-LIVE.md) later.

How to read it:
- **You** means Christian. **Claude** means the lead Claude session.
- "Proof" says the command or page that shows a gate is met. "Unknown" means nobody has confirmed it in the repository
  yet. Unknown counts as not done.
- Menu names come from [GO-LIVE.md](GO-LIVE.md), which cites Cloudflare's official pages. If a screen doesn't match,
  stop and tell Claude what you see. Don't guess.

---

## 1. Before launch: all of these must be true

### Your calls (only you can do these)

| # | Gate | What "done" means | Proof |
| --- | --- | --- | --- |
| 1 | **Games only** | Accounts stay off on the live site. | Cloudflare **Production** build variables have no `PUBLIC_SUPABASE_URL` and no `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (GO-LIVE 1.8, step 5). Live `/signin` does not show the sign-in form. |
| 2 | **Terms and disclaimer** | You've sent the final text, it's on staging, and you've approved it. | `CUEORY_LEGAL_RELEASE_AUDIT=1 node scripts/check-legal-release.mjs` prints no "legal release blocked" line. Today `/terms` and `/disclaimer` are still "paste your text here" boxes. |
| 3 | **Privacy page is true** | `/privacy` on staging describes exactly what the live site does, and no longer says "Draft for review". | You read `/privacy` on staging and reply "privacy approved". The same legal-gate command blocks while it says "Draft for review". If anything is switched on at launch that the page doesn't mention (for example visit counting or the email signup), tell Claude first. |
| 4 | **The pillo name** | You decide: keep "pillo" for launch, or pick a new name now. | Your one-line answer. Background: D-98 records that you chose pillo knowing a medication-reminder app (pillo.care) also uses "Pillo", and that there's no trademark filing or spend without your approval. D-66 shows three earlier game names were dropped after a trademark screen. Only the shown name would change; the code id stays `pulse`. |
| 5 | **iPhone check on staging** | You've played every launch game on your own iPhone on the staging site. | Open the staging preview in Safari, sign in through Cloudflare, go to `/play`, finish one puzzle of each live game, and tell Claude what looked wrong. The sudoku and pillo bugs in issue #86 (items 1 to 5) should be fixed first. Claude's test machine can't run Safari's engine, so your phone is the real check. |

### Claude's gates (Claude proves each one before asking you to launch)

| # | Gate | What "done" means | Proof |
| --- | --- | --- | --- |
| 6 | **14-day puzzle runway** | The live site shows a game on `/play` only when it has at least 14 days of real puzzles. Samples don't count. Other games say "coming soon". | Task L4 on issue #26 (built on !73) with its unit tests. **Unknown:** not merged when this was written. |
| 7 | **Drafts pruned** | No draft anatomy models, sample hello cards or stat sample on the live site. | **Unknown, and a known risk.** W16's note on #26 found that the draft and pruning checks (`src/islands/anatomylab.ts`, `src/visuals/prunedrafts.ts`) only treat a branch named `main` as live, while Cloudflare's production branch is reported as `legacy/main`. Fix or release through `main` first. Then the anatomy production audit (`scripts/anatomy-production-audit.mjs`) should report 0 draft model files shipped. |
| 8 | **Legal-copy gate runs on the real release** | The live build stops if legal text is a placeholder. | `scripts/check-legal-release.mjs` runs before every build (`prebuild`). It only blocks a Cloudflare build when the branch is `main` (same branch problem as gate 7). |
| 9 | **Noindex and sitemap** | Preview, admin and unfinished pages tell search engines to stay away; `/sitemap.xml` lists only public pages. | Browser test `tests/e2e/indexing.spec.ts`. The sitemap comes from `src/pages/sitemap.xml.ts`. For each built page, `node scripts/launch-check.mjs` (after `npm run build`) shows whether it is noindex and counts leftover "coming soon", "sample" and placeholder words ([LAUNCH-CHECK.md](LAUNCH-CHECK.md)). |
| 10 | **Security headers and content policy** | Every page has the strict headers and content policy. | Headers in `public/_headers`, policy in `astro.config.mjs`. Browser test `tests/e2e/csp-sweep.spec.ts`. |
| 11 | **Email signup (Kit)** | Either the Kit form works, or the box honestly says "opening soon". | `newsletter.formAction` in `src/config/site.ts`. Empty means "opening soon" (SETUP Part I makes the form). The full email signup is on hold until !2 merges (#26). |
| 12 | **Visit counting** | Off, or on only after you decide (GO-LIVE 4.4) and the privacy page says so. | Cloudflare **Web Analytics** shows `cueory.app` only if you added it. **Unknown** whether you want it at launch. |
| 13 | **404 page** | A missing address shows Cueory's 404 page. | Browser tests `tests/e2e/404.spec.ts` and `tests/e2e/404-page.spec.ts`. |
| 14 | **Lock only on previews** | Staging asks for Cloudflare sign-in; the live site never does. | GO-LIVE 1.2: Worker **Access** tab shows **Previews only**. |
| 15 | **Flag button works** | CLAUDE.md: no real content goes public before "Flag or comment" works. | **Unknown** for a build with accounts off: the flag form sends through Supabase (`src/islands/flagconnect.ts`). Claude must show it works, or you decide how this rule applies to games-only. |
| 16 | **One frozen release** | One staging commit is picked, and every check ran on it. | `npm run verify` on that commit. CLAUDE.md also requires Safari (WebKit) and Firefox browser tests on a release into `main`. **Unknown** how these run now that GitHub is gone: they need a GitLab pipeline or your Mac. |

Design differences 6 to 12 in issue #86 (game page look, pillo colors, word path, hello cards, stat, pillo layout) need
your call but don't block launch.

---

## 2. Launch day

Before you start, Claude sends you the release commit and the link to the release merge request into `main`.
Only you merge into `main`.

1. In Cloudflare, open **Workers & Pages** and click the **cueory** Worker.
2. Go to **Settings** → **Build** → **Branch control**.
   You should see the production branch is `main`. If it says `legacy/main`, stop and tell Claude (gate 7).
3. On the same **Build** page, open **Build variables and secrets** and choose **Production**.
   You should see no `PUBLIC_SUPABASE_URL` and no `PUBLIC_SUPABASE_PUBLISHABLE_KEY`. If either is there, stop.
4. Click the **Access** tab.
   You should see Access on, set to **Previews only**.
5. Open the release merge request link from Claude.
   You should see every check passed. If not, stop.
6. Click **Merge**.
7. In the Worker, open **Deployments**, then **View build history**.
   You should see a production build for `main` finish and become the **Active Deployment**. If the build fails, the
   live site keeps its old version. Send Claude the error text.
8. Open https://cueory.app in a private window.
   You should see the home page with the padlock.
9. Go to `/play`.
   You should see only the games with a 14-day runway. The others say "coming soon".
10. Play one puzzle of each live game to the end.
11. Open `/terms`, `/disclaimer` and `/privacy`.
    You should see your final text and no "paste your … here" box.
12. Go to `/signin`.
    You should see that accounts aren't open yet, not a sign-in form.
13. Type a made-up address, such as `https://cueory.app/nothing-here`.
    You should see Cueory's 404 page.
14. On your iPhone, open https://cueory.app/play and finish one puzzle.
15. Open the staging preview address in a new private window.
    You should see the Cloudflare sign-in page.
16. Tell Claude "launched", or which step looked wrong.

**If something is wrong for students:** in the Worker, open **Deployments**, click the three dots on the previous
version, and choose **Rollback**. It takes effect at once (GO-LIVE section 3). Then tell Claude.

---

## 3. The first week

Every day (Claude, about 5 minutes):
- Check each live game still has at least 14 days of puzzles ahead. If one runs low, tell you in time to send the next
  reviewed batch. A game that drops below 14 days goes back to "coming soon" on the next build (gate 6).
- Read any flags or messages and tell you about anything about a puzzle's facts. Claude never fixes clinical facts
  itself.
- Look at the live site on phone and desktop sizes for anything broken.

Once during the week (you):
1. Play the day's games on your iPhone at least twice.
2. Answer the open questions you want to settle: visit counting (GO-LIVE 4.4) and the #86 design calls.
3. Keep an eye on the free limits in CLAUDE.md: Cloudflare build minutes, and Supabase pausing projects after 7 quiet
   days. Supabase emails a warning first; **Resume project** wakes it (GO-LIVE 4.2).

Rules that don't change after launch:
- Every change goes to staging first, and you still merge every release into `main`.
- If anything new collects or shares data, the privacy page is updated before it goes live.
- Accounts, lessons and real questions wait for [GO-LIVE.md](GO-LIVE.md).
