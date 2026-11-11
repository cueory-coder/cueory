status: Task 626, one accessible finished-game dialog, exact plain share lines, on-demand 1080 × 1920 story images, distinct 1200 × 630 game previews and tracker-free platform links are in implementation review.
decision: D-pending (Task 626) Per-score link previews require a server route and are intentionally not built.
references: Official share-link documentation copied from closed duplicate !4 as requested:
- Facebook Share Dialog: https://developers.facebook.com/docs/sharing/reference/share-dialog
- X Web Intent: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent
- Threads sharing: https://developers.facebook.com/docs/threads/threads-profiles/threads-publishing
- Reddit submit API: https://www.reddit.com/dev/api/#POST_api_submit
- WhatsApp click to chat: https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat
testing: Shared-dialog browser coverage checks announcement, focus trap/return, copy fallback and tracker-free links; existing solved-game tests close the required modal before checking the underlying result. `npm run verify` remains unrun because the execution environment is unavailable.
