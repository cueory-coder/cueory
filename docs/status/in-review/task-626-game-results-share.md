STATUS: Task 626, one accessible finished-game dialog, exact plain share lines, on-demand 1080×1920 story images, distinct 1200×630 game previews and tracker-free links are in review.
DECISION: D-pending (Task 626) Per-score link previews require a server route and are intentionally not built.
PLATFORM-LINK-EVIDENCE:
  - Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog/
  - X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent
  - Threads Web Intents: https://developers.facebook.com/docs/threads/threads-web-intents/
  - Threads publishing reference (original !4 citation): https://developers.facebook.com/docs/threads/threads-profiles/threads-publishing/
  - Reddit API submit: https://www.reddit.com/dev/api/#POST_api_submit
  - WhatsApp FAQ: https://faq.whatsapp.com/5913398998672934
  - WhatsApp click-to-chat reference (original !4 citation): https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat
TESTING: The latest tested checkpoint passed npm run build, the full unit suite (202 files, 5,327 tests, 3 skipped), the focused share/results/build-output suite (6 files, 277 tests), and 58/60 share-sheet browser cases across phone, Evening, tablet and desktop. The two browser failures are axe color-contrast violations in the shared site theme picker, outside Task 626's owned changes. Rerun on the latest moving head before readying the MR.
