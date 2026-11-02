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
   You should see the Cueory home page with the "we're still building" bar.
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

## Part K — Supabase for accounts (15 minutes, $0)

Supabase holds student accounts and the database (ROADMAP Task 2). Free plan: two active projects, which is exactly
ours. A free project pauses after a week without use; the roadmap's daily keep-alive covers that.

1. Open https://supabase.com and click **Start your project** (or **Sign up**). Sign up with **email and password**,
   using your **business Gmail**, never an address on cueory.app. Use a strong password from your password manager.
2. Confirm the email Supabase sends you.
3. Turn on two-factor login at https://supabase.com/dashboard/account/security with an authenticator app. **Add a
   second, backup authenticator on a different device**: Supabase gives no recovery codes and can't restore an account
   whose two-factor is lost.
4. When it asks for an organization, name it `Cueory` and choose the **Free** plan ($0/month). If it ever asks for a
   card, stop and tell Claude.
5. Click **New project**:
   - **Name:** `cueory-staging`.
   - **Database Password:** click **Generate a password**, copy it, and save it in your password manager as
     "cueory-staging database".
   - **Region:** a **West US** region (closest to Arizona).
   - Leave the other options as they are and click **Create new project**. It takes a minute or two.
6. Repeat step 5 for `cueory-prod`, with a new generated password and the same region.
7. Don't paste any password or key into a chat. When the account code is ready, Claude gives you the steps to put the
   project addresses and keys into GitHub and Cloudflare settings, and to turn on Google sign-in.

You should see both projects, `cueory-staging` and `cueory-prod`, on your Supabase dashboard.

---

## Part L — Sign-in settings for cueory-staging (20 minutes, $0)

These settings make Supabase match the sign-in code (Task 165). Do them on `cueory-staging` only. `cueory-prod` waits
for Part N. Page names below come from Supabase's docs. Where a step says **check on screen**, the docs don't confirm
the exact wording: if what you see doesn't match, stop and tell Claude what it says.

### Find the staging address
1. In Cloudflare, open **Workers & Pages** → **cueory** → **Deployments** and find the `staging` preview (as in
   Part E, step 3).
2. Copy its address: everything before the first `/` after the domain (it starts with `https://`). If the preview has
   more than one address, copy the one with `staging` in it. If none has, stop and tell Claude what you see
   (**check on screen**).
3. Send that address to Claude in the chat. It isn't a secret: the Cloudflare lock still protects it. Below,
   `STAGING` means this address, for example `STAGING/reset-password`.

### Addresses Supabase may send people back to
4. Open https://supabase.com/dashboard and click the **cueory-staging** project.
5. In the left menu, click **Authentication**, then **URL Configuration**.
6. In **Site URL**, replace what's there with the `STAGING` address and save.
7. Under **Redirect URLs**, add `STAGING/auth/callback**`. The two stars matter: the sign-in link carries the page to
   open next (`?next=`), and `**` lets that through.
8. Add a second redirect URL: `STAGING/reset-password` (no stars).
   You should see exactly these two redirect URLs, both starting with your staging address. Remove any `localhost`
   address you find there.

### Email sign-up and passwords
9. In the left menu, click **Sign In / Providers**, then **Email** (**check on screen**).
10. Make sure **Confirm Email** is **on**, and save. Supabase's docs say it's on by default for hosted projects; check
    it anyway. Why: an account that never proved its email could be made by a script in bulk and used to pull answers
    through the answer checker. With it on, nobody can sign in until they click the link in their inbox.
11. Set **Minimum password length** to `10`. The sign-up form asks for at least 10 characters, and Supabase should
    refuse the same thing (Supabase recommends at least 8).
12. Leave the **required characters** setting at no requirement (**check on screen** for its wording). The form
    doesn't ask for digits or symbols, so a student would get a confusing "could not be created" message.
13. Leave **require current password when changing password** **off** (**check on screen**). A student resetting a
    forgotten password doesn't know the old one. Supabase's docs don't say whether this setting skips reset links, so
    off is the safe choice.
14. Leave **require reauthentication when changing password** **off**
    too (**check on screen**). The site has no "confirm it's you" step for it.
15. Click **Save**.
16. On the same **Sign In / Providers** area, find **Allow anonymous sign-ins** and make sure it's **off**
    (**check on screen** which tab it's on). Cueory never uses anonymous accounts, and the setting in the code
    (`supabase/config.toml`) only covers Claude's local test copy, not your hosted project.
17. Leave **Allow new users to sign up** **on**.
18. Don't turn on **leaked password protection**: Supabase's docs say it needs the paid Pro plan.

### Email templates
19. In the left menu, click **Email Templates**.
20. Open **Confirm sign up**. Its link should use `{{ .ConfirmationURL }}`. Don't change it.
21. Open **Reset password**. Its link should also use `{{ .ConfirmationURL }}`. Don't change it.
    The sign-in code expects Supabase's own link, which sends the student back with a one-time code that only works in
    the same browser. If either template doesn't contain `{{ .ConfirmationURL }}`, stop and tell Claude.

### Rate limits
22. In the left menu, click **Rate Limits**.
23. Compare what you see with Supabase's defaults. Don't raise any of them:
    - **Sign-ups and sign-ins** (sign-up, reset and resend requests): 30 per 5 minutes per internet address.
    - **Token requests** (this is where email-and-password sign-in counts, plus staying signed in): 150 per 5 minutes
      per internet address.
    - **Verification requests** (opening email links): 30 per 5 minutes per internet address.
    - **Emails sent**: 2 per hour for the whole project, with Supabase's built-in email.
    Leave them at these numbers. Lowering them could lock out a whole class on the same campus Wi-Fi, which shares one
    internet address. If any number is higher than listed here, tell Claude.
24. Note on email: Supabase's built-in email only sends to people on your Supabase team, two an hour. That's enough
    for you to test staging with your business Gmail. Real students need Resend connected first; Claude gives you
    those steps before launch.

### Two-factor
25. Your own Supabase login already has two-factor from Part K, step 3. Check
    https://supabase.com/dashboard/account/security still shows it on, with your backup authenticator.
26. In the project's left menu, click **Multi-Factor** (**check on screen**). Make sure the authenticator-app option
    (TOTP) is on. Supabase's docs say it's free and on by default. Leave the phone (text message) option **off**:
    Cueory doesn't use text messages.
    Two-factor inside Cueory's own admin area needs code that isn't built yet; Claude will tell you when to set it up.

Tell Claude "Part L done", or which step didn't match.

Sources: [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[Supabase: General configuration](https://supabase.com/docs/guides/auth/general-configuration),
[Supabase: Password-based auth](https://supabase.com/docs/guides/auth/passwords),
[Supabase: Password security](https://supabase.com/docs/guides/auth/password-security),
[Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[Supabase: PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[Supabase: Rate limits](https://supabase.com/docs/guides/auth/rate-limits),
[Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Supabase: MFA](https://supabase.com/docs/guides/auth/auth-mfa),
[Supabase: TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[Supabase: Dashboard two-factor](https://supabase.com/docs/guides/platform/multi-factor-authentication).

---

## Part M — Google sign-in for cueory-staging (25 minutes, $0)

Google sign-in needs a "client" in Google Cloud: a pair of codes that lets Supabase ask Google who someone is. Use your
**business Gmail** for all of it (rule 9). None of these steps needs a billing account. If a screen asks for a card or
shows a price, stop and tell Claude.

Claude's choice: one Google Cloud project for Cueory, with a separate client for staging and for the live site, so a
problem with one never touches the other.

### Get Supabase's callback address
1. In Supabase, open **cueory-staging** → **Authentication** → **Sign In / Providers** → **Google**.
2. Find the callback address on that page (**check on screen** for its label). It ends in `/auth/v1/callback`. Copy
   it and keep this tab open.

### Register Cueory with Google (one time)
3. In a new tab, signed in with your business Gmail, open https://console.developers.google.com/auth/overview.
4. If it asks for a project, create one named `Cueory`.
5. Click **Get started**.
6. **App name:** `Cueory`.
7. **User support email:** pick your business Gmail.
8. **Audience:** choose **External** (anyone with a Google account can sign in).
9. **Contact information:** your business Gmail.
10. Finish the remaining screens and agree to Google's policy if asked (**check on screen**).
11. Open **Data Access** in the left menu. Make sure `openid`, `.../auth/userinfo.email` and
    `.../auth/userinfo.profile` are listed. Supabase's docs say the last two are there already and `openid` must be
    added by hand. Add nothing else: other permissions bring Google's review and warnings.
12. Don't upload a logo yet. Google's docs say a new logo starts a review that can take days. Until that review,
    Google shows the sign-in page's address instead of the name, which is fine for staging.

### Create the staging client
13. Open **Clients** in the left menu and click **Create client**.
14. **Application type:** **Web application**.
15. **Name:** `cueory-staging` (**check on screen**).
16. Under **Authorized JavaScript origins**, add the `STAGING` address from Part L, step 3, with nothing after the
    domain.
17. Under **Authorized redirect URIs**, paste the Supabase callback address from step 2.
18. Click **Create**.
19. Google shows the **Client ID** and **Client secret**. Google's docs say the secret is shown in full **only this
    once**. Copy both into your password manager as "Google client cueory-staging". Never paste them into a chat.
    If Google shows an error about a domain instead, stop and tell Claude what it says.

### Turn it on in Supabase
20. Back in the Supabase tab from step 1, turn on Google (**check on screen** for the switch's name).
21. Paste the **Client ID** and the **Client secret** into their boxes, from your password manager.
22. Click **Save**.
23. Leave the Google Cloud **Audience** page's publishing status at **Testing** for now. Google's docs say apps that
    ask only for name, email and profile still work for any Google account, without the 7-day expiry.
    Google's docs say a changed redirect address can take from 5 minutes to a few hours to work. Claude tests the
    sign-in button on staging once the account code is live there.

Tell Claude "Part M done", or which step didn't match.

Sources: [Supabase: Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google),
[Google: Get started with the Google Auth Platform](https://support.google.com/cloud/answer/15544987),
[Google: Manage OAuth Clients](https://support.google.com/cloud/answer/15549257),
[Google: Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049),
[Google: Manage App Audience](https://support.google.com/cloud/answer/15549945).

---

## Part N — The same settings for cueory-prod (25 minutes, $0, only when Claude asks)

Only after staging works and Claude asks. Never put the staging address into `cueory-prod`, or the live address into
`cueory-staging`.

1. Do Part L, steps 4 to 26, on the **cueory-prod** project, with `https://cueory.app` instead of the staging address:
   - **Site URL:** `https://cueory.app`
   - **Redirect URLs:** `https://cueory.app/auth/callback**` and `https://cueory.app/reset-password`
   Supabase recommends exact addresses for a live site. The callback needs `**` anyway, because each sign-in carries
   the page to open next; the code only ever opens pages on cueory.app.
2. Do Part M, steps 1, 2 and 13 to 22, for **cueory-prod**: the client's name is `cueory-prod`, its JavaScript origin
   is `https://cueory.app`, and its redirect URI is the callback address from the **cueory-prod** Google page. Save the
   codes as "Google client cueory-prod".
3. In Google Cloud, open **Branding**. Under the app's domain, add `https://cueory.app` as the home page,
   `https://cueory.app/privacy` as the privacy policy and `https://cueory.app/terms` as the terms. Add `cueory.app`
   under **Authorized domains**. Google's docs say live apps need all three links. Save.
4. Open **Audience** and click **Publish app**. If Google asks for verification or payment, stop and tell Claude.
5. Supabase's built-in email can't reach students (Part L, step 24). Don't open sign-up on the live site until
   Claude has connected Resend.

Tell Claude "Part N done", or which step didn't match.

---

## If a release breaks the live site (2 minutes)

A release is a pull request from `staging` into `main`. If the live site looks wrong after one, put the previous
version back first and fix the problem afterwards. A rollback changes only what Cloudflare serves; the code in GitHub
stays as it is.

1. In Cloudflare, open **Workers & Pages** → **cueory** → **Deployments**.
2. Under **Version History**, find the version that was live before the release: the newest version built from
   `main` that is older than the release. A preview of `staging` or any other branch never counts, even if it is newer:
   it may hold the very change that broke the site. If you can't tell which version came from `main`, stop and comment
   on the "Daily report" issue with what the list shows. Claude will help you pick it. Don't guess from the dates.
3. Click the three dots at the right of that version, then **Rollback**.
   You should see that version become the **Active Deployment**. Cloudflare switches the live site to it right away.
4. Open the live site in a private window. You should see it as it was before the release.
5. Comment on the "Daily report" issue: what looked wrong, on which page. Claude fixes it through `staging`, and the
   next release replaces the rolled-back version.

Cloudflare keeps the 100 most recent versions to roll back to. Source:
[Cloudflare: Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
