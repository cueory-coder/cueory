# Launch readiness report

From the repository root, build the site, then run the report without an npm script:

```bash
npm run build
node scripts/launch-check.mjs
```

The command reads `dist/` and prints one line for each built HTML page. Regular `.html` files and nested `index.html` files use their route names. `404.html` keeps its filename. Pagefind fragments, Astro assets, non-HTML files and symbolic links are excluded.

Each line reports:

- The number of `data-placeholder="CHRISTIAN-TEXT"` markers.
- Whole-word counts for “coming soon”, “sample”, “placeholder” and “opens soon”, ignoring case.
- Whether the HTML contains a `robots` meta directive with `noindex`.

Word counts ignore HTML comments, scripts, styles and attributes. Common encoded spaces and line breaks between words are recognized. This is a simple built-HTML scan, not a browser-rendered visibility check. Hidden page text may be counted. JavaScript-created text and HTTP response headers are not inspected.

Review each finding in context. A labeled sample or a deliberately excluded preview page may be correct. A clean report does not approve clinical content, legal text, account behavior or a launch.

This command only prints a report. It never changes files or settings, and always exits with code `0`, including when `dist/` is missing or unreadable. Warnings mean the report is incomplete. It is not a CI release gate.
