status: Task 628, shared finished-game results and sharing: one accessible result dialog, browser-drawn story image, static score-free Open Graph images, and game wiring for pillo, crossword, word path, and hello cards.

Base: legacy/staging at 6b5ae956984672953716f537ff10f371c40afe61.

Verification: the implementation uses the Web Share API with an image File when supported, and plain platform share links otherwise. Official format references checked:
- Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog
- X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent
- Threads sharing: https://developers.facebook.com/docs/threads/threads-profiles/threads-publishing
- Reddit submit API: https://www.reddit.com/dev/api/#POST_api_submit
- WhatsApp click to chat: https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat

Per-score Open Graph previews are intentionally not implemented because they require a server route.

D-pending: confirm the image/share preview direction and any product copy decisions with Christian.