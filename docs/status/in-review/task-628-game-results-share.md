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

Follow-up for GitLab Duo findings:
- Native Share now attempts the prepared story image immediately when ready, otherwise sends text and URL synchronously from the tap; copy is the fallback after an unavailable or failed native share.
- Story generation is prepared when the result dialog opens, so slow canvas work does not consume the share gesture.
- Hello Cards and Pillo names now come from `src/config/games.ts`.
- Story logo selection follows the saved Light/Dark theme or device preference.
- The future Sudoku landing route is `noindex,nofollow` until the Worker 1 route/config integration exists; the static OG mapping remains a marked future hook.
- Added behavior tests for text-only native sharing, failure fallback, and logo palette selection.

Verification remains pending: this workspace has no repository checkout, so `npm run verify` has not been run locally; no verification claim is made here.