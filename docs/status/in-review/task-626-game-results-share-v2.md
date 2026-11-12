STATUS: Task 626 (rebuilt on current staging, replaces !2 and !100): one accessible finished-game dialog for pillo, crossword, sudoku, word path, stat and hello cards, the exact plain share line (`<game> · <date> · <result> · cueory.app`), on-demand 1080×1920 story images and tracker-free platform links are in review. Crawlable /play/pillo, /play/crossword, /play/word-path and /play/sudoku landing pages use the existing /share/games-scene.png preview image.
DECISION: D-pending (Task 626) Per-score link previews need a server route and are intentionally not built. Per-game 1200×630 preview images are left out of this PR to keep it small; all game pages share the existing games-scene image.
PLATFORM-LINK-EVIDENCE:
  - Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog/
  - X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent
  - Threads Web Intents: https://developers.facebook.com/docs/threads/threads-web-intents/
  - Threads publishing reference (original !4 citation): https://developers.facebook.com/docs/threads/threads-profiles/threads-publishing/
  - Reddit API submit: https://www.reddit.com/dev/api/#POST_api_submit
  - WhatsApp FAQ: https://faq.whatsapp.com/5913398998672934
  - WhatsApp click-to-chat reference (original !4 citation): https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat
NEEDS-CHRISTIAN: Facebook sharing (the Facebook share page takes only a link, so the result line is not pre-filled there) and the hard-grid target-size question raised by Codex on !100.
TESTING: See the verification note on the merge request.
