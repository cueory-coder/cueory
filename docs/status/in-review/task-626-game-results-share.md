status: Task 626, one accessible finished-game dialog, exact plain share lines, on-demand 1080 × 1920 story images, distinct 1200 × 630 game previews and tracker-free platform links are in implementation review.
decision: D-pending (Task 626) Per-score link previews require a server route and are intentionally not built.
platform-link-evidence:
  - Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog — uses the destination URL in the `u` parameter.
  - X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent — supports text and URL parameters for the composed post.
  - Threads sharing: https://developers.facebook.com/docs/threads/threads-profiles/threads-publishing — official Threads sharing documentation.
  - Reddit submit API: https://www.reddit.com/dev/api/#POST_api_submit — accepts the destination `url` and post `title`.
  - WhatsApp click to chat: https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat — official click-to-chat documentation.
testing: The shared-dialog browser coverage checks announcement, focus trap/return, copy fallback and tracker-free links; existing solved-game tests close the required modal before checking the underlying result. Local verification on the current head: `npm run build` passed (47 static pages plus Pagefind); the focused share/results/build-output run passed 211 of 212 tests, with the one remaining failure being the existing JavaScript-budget fixture gap for the four game routes. Browser/print verification was not run here.
