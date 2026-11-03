status: READY_FOR_REVIEW — W24 Task 207, board revision 7.

Scope: tests/unit/image-markup.test.ts, src/components/Wordmark.astro,
src/components/PilloTitle.astro, src/pages/index.astro and this status note.
Adds built-HTML checks for explicit alt text, decorative markers, positive width/height attributes and lazy loading. Wordmark and Pillo supporting art are explicitly decorative. Their images default to lazy loading. The initial home hero retains eager loading through an exact asset/route exception. Christian's image files are unchanged.

Static HTML cannot establish the screen fold, so the test applies a stricter explicit policy: every image is lazy except the two home hero palette variants. It covers SSR images, not client-only island output or actual viewport geometry. No browser or visual-layout pass is claimed.

Validation on refreshed staging dce93b9: npm run check passed (0 errors, 0 warnings, 11 existing hints), npm run build passed, npm test -- --maxWorkers=1 passed 3331 tests across 109 files. All 31 built routes pass image-markup checks. No browser spec changed. Local browser execution remains unavailable because Chromium is missing. CI must verify rendering.
