status: Task 626, one accessible finished-game dialog, exact plain share lines, on-demand 1080 × 1920 story images, distinct 1200 × 630 game previews and tracker-free platform links are in implementation review.
decision: D-pending (Task 626) Per-score link previews require a server route and are intentionally not built. Official platform-link references are recorded below against first-party documentation.
testing: Shared-dialog browser coverage now checks announcement, focus trap/return, copy fallback and tracker-free links; existing solved-game tests close the required modal before checking the underlying result. `npm run verify` remains unrun because the execution environment is unavailable.


platform-link-evidence:
- Facebook: https://developers.facebook.com/docs/sharing/reference/share-dialog/ — the Share Dialog accepts the destination URL as the `u` parameter; this matches `facebook.com/sharer/sharer.php?u=…`.
- X: https://developer.x.com/en/docs/x-for-websites/tweet-button/guides/web-intent — the official web-intent route accepts post text and URL parameters; this matches `x.com/intent/post?text=…&url=…`.
- Threads: https://developers.facebook.com/docs/threads/threads-web-intents/ — Meta's Threads web-intent route accepts prefilled post text; the implementation passes the combined text and destination URL as `text`.
- Reddit: https://www.reddit.com/dev/api/#POST_api_submit — Reddit's official submit documentation defines `url` and `title` for link submissions; this matches `reddit.com/submit?url=…&title=…`.
- WhatsApp: https://faq.whatsapp.com/5913398998672934 — WhatsApp's official click-to-chat guidance defines the URL-encoded `text` parameter, including a message-only `wa.me/?text=…` link.

These links are tracker-free and contain only the approved share text and destination URL.