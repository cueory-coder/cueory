# Setup steps for Christian (Task 1)

One action per step. "You should see" tells you what to check. Dashboards change their wording. If a button or menu
doesn't match, stop and tell Claude what you see instead. Don't guess.

**Golden rules**
- Sign up for every service with your **business Gmail**, never `hello@cueory.app` (rule 9).
- Never paste a password, key or code into the chat.
- Don't change, delete or add any **MX or TXT** (email) DNS records unless Claude asked and you said yes.

Do the parts in order. Parts A and B can be done right away.

---

## Part A — Turn on two-factor login (10 minutes)

1. Google: open https://myaccount.google.com/signinoptions/twosv while signed in to your business Gmail. Turn on
   2-Step Verification if it's off.
2. GitHub: open https://github.com/settings/security. If it doesn't say two-factor is enabled, click
   **Enable two-factor authentication** and follow the prompts.
3. Cloudflare: open https://dash.cloudflare.com/profile/authentication and turn on **Two-Factor Authentication**.
   Also check that the email on https://dash.cloudflare.com/profile is your business Gmail.

---

## Part B — Turn on Codex reviews (5 minutes)

OpenAI's docs say Codex cloud must be set up for the repository first, then code review is switched on.
If any of this asks you to pay, stop and tell Claude.

1. Open https://chatgpt.com/codex and sign in.
2. Connect GitHub when asked, and give it access to the **Cueory** repository only.
3. Open https://chatgpt.com/codex/settings/code-review.
4. Turn on code review for **lilchristxan/Cueory**, and turn on **Automatic reviews**.
   You should see Cueory listed with reviews on. On the Task 1 pull request, Codex adds a 👀 reaction, then a review.

---

## Part C — Connect the repository to Cloudflare Workers (10 minutes)

Cloudflare's "Create application" now sets up a **Worker** (DECISIONS.md, D-38). The repository's `wrangler.jsonc`
tells it to serve the built site as static files.

### Set up Zero Trust first (one time, for the staging lock)
1. On the **Workers & Pages** page, find the **Cloudflare Access** card on the right and click **Set up Zero Trust**.
2. Choose a team name (for example `cueory`) and the **Free** plan (up to 50 users, $0).
   If any screen shows a price above $0, stop and tell Claude.

### Create the Worker
3. Back on **Workers & Pages**, click **Create application** → **Import a repository** → **GitHub**.
4. Pick **lilchristxan/Cueory** and continue.
5. Fill in exactly:
   - **Project name:** `cueory`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - **Preview command:** `npx wrangler versions upload`
   - **Enable Preview builds:** on
   - **Protect with Cloudflare Access:** **on** (this is the staging lock)
6. Open **Advanced settings** and leave everything as it is.
7. Click **Deploy**. The first build of `main` may fail because `main` is still almost empty. That's expected.

---

## Part D — Check the branches (3 minutes)

1. Open the **cueory** Worker → **Settings** → **Builds**.
2. **Production branch:** `main`.
3. Leave non-production (preview) builds **on**. Every branch, including `staging`, gets its own locked preview address.
   You should see the GitHub repository listed with no red error. If you see "Error fetching GitHub User", click
   **Disconnect**, then connect GitHub again.

---

## Part E — Check the lock (5 minutes)

1. In the Worker, open the **Access** tab. It should show Access as **on** for preview addresses.
2. Click **Manage** (or open **Zero Trust → Access → Applications**) and check the policy's **Include** rule is
   **Emails** = your business Gmail. If not, change it and click **Save**.
3. Open the Worker's **Deployments** tab, find the `staging` preview and open its address. You should see a
   Cloudflare login screen. Sign in with the Gmail; you should then see the site.

---

## Part F — Approve Task 1 into staging (10 minutes)

1. Open the Task 1 pull request (Claude sends you the link).
2. Scroll to the bottom. Wait until every check shows a green ✓. ("CodeQL" shows as skipped because the repository
   is private. That's expected; Semgrep does the code scan instead.)
3. Read Codex's review. If Codex found problems, tell Claude before merging.
4. Click **Merge pull request**, then **Confirm merge**.
5. In Cloudflare, open **Workers & Pages** → **cueory** → **Deployments**.
   Within a few minutes you should see a **Preview** deployment for branch `staging` with status **Success**.
6. Open a private (incognito) browser window and go to `https://staging.cueory.pages.dev`.
   You should see a **Cloudflare sign-in page**, not the site. That means the lock works.
7. Enter your business Gmail, then the code Cloudflare emails you.
   You should see the Cueory home page with the "We're still building" bar.
8. Click around: home, Lesson 1, Privacy, Terms, Disclaimer, Support.
9. Tell Claude "staging looks good" (or what looks wrong).

---

## Part G — Put Task 1 live (5 minutes)

1. Claude opens a pull request from `staging` into `main` and sends you the link.
2. Wait for green checks, then click **Merge pull request** → **Confirm merge**. Only you merge into `main`.
3. In Cloudflare **Deployments**, you should see a **Production** deployment for `main` with status **Success**.
4. Open `https://cueory.pages.dev`. You should see the site with no sign-in.

---

## Part H — Connect cueory.app (15 minutes, then up to a day of waiting)

**If you bought cueory.app through Cloudflare**, skip to step 8.

1. In the Cloudflare dashboard home, click **Add a domain** (it may say **Onboard a domain**).
2. Type `cueory.app` and continue. Choose the **Free** plan.
3. Cloudflare shows the DNS records it found. **Don't delete anything.** If you already have email on cueory.app,
   check that the **MX** and **TXT** records are in the list. If they're missing, stop and tell Claude.
4. Cloudflare shows two **nameservers** (like `xxx.ns.cloudflare.com`). Keep this page open.
5. In another tab, sign in where you bought cueory.app. Find the nameserver setting, replace the nameservers with the
   two from Cloudflare, and save.
6. Wait for Cloudflare's email saying cueory.app is **Active** (minutes to 24 hours).
7. Come back to the Cloudflare dashboard.
8. Go to **Workers & Pages** → **cueory** → **Custom domains**.
9. Click **Set up a custom domain**, type `cueory.app`, click **Continue**, then **Activate domain**.
   You should see `cueory.app` with status **Active** after a few minutes.
10. Open `https://cueory.app`. You should see the Cueory home page.

### Turn on visit counting
11. In the cueory Pages project, click **Metrics**.
12. Under **Web Analytics**, click **Enable**.

---

## Part I — Launch-update emails with Kit (15 minutes)

1. Open https://kit.com and sign up with your **business Gmail**. Choose the **Free** plan ($0, up to 10,000
   subscribers).
2. Kit asks for a mailing address. US law requires one at the bottom of every marketing email, so subscribers will see
   it. If you don't want your home address shown, stop here and tell Claude. A PO box or virtual mailbox fixes it
   but costs money, so it's your call.
3. Turn on two-factor login in Kit's account settings.
4. Create a form: **Grow** → **Landing Pages & Forms** → **Create new** → **Form** → **Inline**, any template.
   Name it `Cueory launch updates`.
5. In the form's **Settings**:
   - Turn on the **incentive / confirmation email** (double opt-in), so people confirm before they're added.
   - Set **after subscribing** to **redirect to an external page**: `https://cueory.app/subscribed`.
   - Save.
6. Click **Publish** → **HTML**. Copy the code.
7. Paste that code into the chat. It's safe: it's the same public code anyone can see on a website, with no
   passwords. Claude uses it to connect the form on cueory.app.
8. If Kit asks you to "authenticate your sending domain" (adding DNS records to cueory.app), **don't do it yet**.
   Those are email DNS records; tell Claude first.

---

## Part J — hello@cueory.app (only if you say yes)

The footer and privacy page list `hello@cueory.app`. For mail to that address to reach you, the domain needs email
DNS records. If you don't already have email on cueory.app, Cloudflare Email Routing (free) can forward
`hello@cueory.app` to your business Gmail, but that adds MX and TXT records. Claude won't do this, or give you steps
for it, until you say yes.

Tell Claude when you're done, or which step didn't match.

---

## If a release breaks the live site (2 minutes)

A release is a pull request from `staging` into `main`. If the live site looks wrong after one, put the previous
version back first and fix the problem afterwards. A rollback changes only what Cloudflare serves; the code in GitHub
stays as it is.

1. In Cloudflare, open **Workers & Pages** → **cueory** → **Deployments**.
2. Under **Version History**, find the newest version from before you merged the release (check the dates).
3. Click the three dots at the right of that version, then **Rollback**.
   You should see that version become the **Active Deployment**. Cloudflare switches the live site to it right away.
4. Open the live site in a private window. You should see it as it was before the release.
5. Comment on the "Daily report" issue: what looked wrong, on which page. Claude fixes it through `staging`, and the
   next release replaces the rolled-back version.

Cloudflare keeps the 100 most recent versions to roll back to. Source:
[Cloudflare: Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
