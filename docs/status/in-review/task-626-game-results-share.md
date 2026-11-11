status: Task 626, one accessible finished-game dialog, exact plain share lines, on-demand 1080 × 1920 story images, distinct 1200 × 630 game previews and tracker-free platform links are in implementation review.
decision: D-pending (Task 626) Per-score link previews require a server route and are intentionally not built.
platform-link-evidence:
  - Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog/ — uses the destination URL in the `u` parameter.
  - X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent — supports text and URL parameters for the composed post.
  - Threads Web Intents: https://developers.facebook.com/docs/threads/threads-web-intents/ — supports text for the composed post.
  - Reddit API submit: https://www.reddit.com/dev/api/#POST_api_submit — accepts the destination `url` and post `title`.
  - WhatsApp FAQ: https://faq.whatsapp.com/5913398998672934 — documents the message-only `wa.me/?text=...` URL form.
testing: The shared-dialog browser coverage checks announcement, focus trap/return, copy fallback and tracker-free links; existing solved-game tests close the required modal before checking the underlying result. Local verification on the current head: `npm run build` passed (47 static pages plus Pagefind); `npm test -- --reporter=dot --maxWorkers=4` ran 202 files and passed 200, with 3 failures: the pre-existing app-icon timeout, the pre-existing built-route JavaScript-budget fixture gap for the four game pages, and the existing universal OG-image expectation that conflicts with this task's distinct per-game previews. Browser/print verification was not run here.
