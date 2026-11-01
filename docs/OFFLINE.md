# Offline copies of pages (ROADMAP Task 5)

A visitor's browser may keep copies of the lesson pages, the home page and the site's own files, so a page they have
opened opens again with no connection. This is what is built, what it never keeps, and how to switch it off.

## How it works

- `/sw.js` is the service worker. It is written when the site is built, from `src/scripts/offlineplan.ts` (what may be
  kept), `swlogic.ts` (the decisions) and `sw.ts` (the worker's events), by `src/pages/sw.js.ts`.
- `/register-sw.js` is the page side, an external file built from `src/scripts/offline.ts` by
  `src/pages/register-sw.js.ts`. Every page loads it with `defer`. After the page has loaded it registers `/sw.js`, and
  on a first visit it fetches the page and the files it loaded once so they are saved too.
- Each deploy has its own cache (`cueory-offline-<commit>-<hash>`); caches from older builds are deleted when the new
  worker starts. Other caches on the site are never touched.

## What is kept, and what never is

- Kept: lesson pages (`/learn/…` with no dot in the address, so no data files), the home page, and files under
  `/_astro/`, `/brand/` and `/fonts/` with a static extension (script, style, font, image).
- Never kept: `/play` (today's puzzles are inside the page), `/admin`, `/progress`, `/start`, `/privacy`, any address
  with a query string, any other site, anything that is not a GET, any redirect (a locked preview's sign-in page), any
  answer that is not a complete success, and anything the server marks `no-store` or `private`.
- Pages ask the network first. A page with a saved copy waits 4 seconds, then shows the copy; a server error (5xx) also
  shows the copy. Only the hashed build files under `/_astro/` come from the saved copy first.

## Switching it off

Open `src/config/site.ts`, set `offline.enabled` to `false`, and deploy. Then:

1. Pages stop registering the worker. Each page a visitor opens first deletes this site's saved copies, then removes any
   registration it finds (in that order, because removing a registration does not delete the copies).
2. `/sw.js` becomes a worker that deletes every saved copy this site made and removes itself the next time a visitor's
   browser checks for an update (browsers check on every visit, at least once a day).

Nothing else changes. To switch it back on, set it to `true` and deploy.

## Not done yet

The `/play` shell is not separate from its puzzles, so `/play` cannot be saved. When it is, `strategyFor` in
`swlogic.ts` can stop skipping it. The account and progress pages are never kept.
