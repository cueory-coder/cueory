status: READY_FOR_REVIEW — W24 Task 247, board revision 10 (claimed under revision 9, reread before publication).

Scope: tests/unit/mixed-content.test.ts and this note only.
Scans every built HTML, CSS, JavaScript, JSON, SVG, XML, TXT and webmanifest asset for HTTP URL literals, including JSON-escaped slashes. Rejects unapproved occurrences with asset path and URL. This is a static inventory, not browser network observation.

Documented exact exceptions: standard SVG/HTML/MathML/XML/XLink/sitemap namespace identifiers, unmodified SIL font-license references in the three known license files, the bundled Supabase SDK localhost:9999 development default, and the two loopback examples in its configuration error text. SDK/error exceptions are restricted to their generated asset roles. Suffix lookalikes and those URLs in ordinary page markup are rejected. No dependencies or application source changed.

Validation on latest staging beeebc0: check passed (0 errors, 0 warnings, 12 existing hints), build passed, all 3675 unit tests in 119 files passed under the shared one-worker validation lock. Focused scanner suite: 128 tests passed. No browser spec changed and no browser network pass is claimed.
