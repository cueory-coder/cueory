STATUS: implementation review in progress

Base: legacy/staging at 6b5ae956984672953716f537ff10f371c40afe61.

Current branch adds the shared finished-game result dialog, game-page result wiring, static social previews, image-share handling, and design-token contract fixes. Remaining review scope is the full /play flow for every game, share fallback behavior, and accessibility checks against the design handoff.

D-pending: confirm the image/share preview direction and any product copy decisions with Christian.

Official platform documentation used for the share-link contracts:

- Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog
- X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent
- Threads sharing: https://developers.facebook.com/docs/threads/threads-profiles/threads-publishing
- Reddit submit API: https://www.reddit.com/dev/api/#POST_api_submit
- WhatsApp click to chat: https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat
