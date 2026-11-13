status: T35 adds the omitted indexable /courses route to the sitemap and guards robots/sitemap agreement with built-page metadata.

The normal build has 48 HTML pages, of which 13 are indexable. All already have one nonempty, unique title and description under the existing page-meta guard. The sitemap omitted /courses because the route allowlist did not include it. Add that one route, without changing page copy or rendering.

Extend the existing metadata suite instead of introducing a second HTML parser. Check robots.txt's public-indexing directives and its single canonical sitemap declaration; require the sitemap to list every built indexable route exactly once, on the canonical origin, with no extra/noindex entries. Preserve all existing title/description checks and copy exceptions unchanged.

The added sitemap test fails against the plain staging build specifically because /courses is missing (1 failure, 7 passes in the extended metadata file). Validation and negative controls are recorded on the MR at its exact head. No UI, auth, hosting configuration, storage, clinical content or third-party dependency changes.
