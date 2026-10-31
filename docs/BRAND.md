# cueory brand guide

Sources: Christian's brand board and `brand-source/Cueory_Branding_Spec.md` (both 2026-10-31). Where they differ, the
spec wins. Colors are applied in `src/styles/tokens.css`. Logo files are built from one traced geometry master by
`scripts/build-brand.mjs`.

## Identity
- **Brand name:** Cueory (the logo is always lowercase: "cueory")
- **Motto (exact, always lowercase):** `by nursing students, for nursing students.`
- **Product description:** Nursing school is hard enough. Cueory makes studying simpler.
- **Use:** website, app, social, and all brand materials

## Typography
- **Logo (wordmark "cueory"):** traced artwork from the approved banner. It is never typed in a font. Bodoni Moda
  Medium was only an earlier approximation (spec section 1).
- **Headings, body text, UI and buttons:** Inter. Live-text motto: Inter Medium, letter spacing 0.02em.

## Daytime (light) palette
| Role | Name | HEX |
| --- | --- | --- |
| Page background | Ivory | `#F9F5EF` |
| Card / surface | Linen | `#EADCCF` |
| Decorative / soft fill | Taupe | `#D3B7A1` |
| Accents / highlights | Mocha | `#8B6F5B` |
| Primary text / logo / buttons | Espresso | `#3F2E24` |
| Secondary text / icons | Bronze | `#6B5243` |

## Evening (dark) palette
| Role | Name | HEX |
| --- | --- | --- |
| Page background | Charcoal | `#1B1715` |
| Card / surface | Walnut | `#3A2D24` |
| Accents / highlights | Bronze | `#6B5243` |
| Secondary text / UI | Sand | `#CBB8A4` |
| Primary text / logo | Evening Ivory | `#EFE6DA` |

## Logo
- **Status: approved master v1.0** (approved by Christian on 2026-10-31). Traced with potrace from
  `brand-source/cueory-banner-reference-light.png` (SHA-256 `056266ef…a962e0`). The geometry master
  `brand-source/cueory-geometry-master-v1.0.json` (SHA-256 `4982f24f…3adea6`) is frozen: a test fails if it changes.
  Any change needs a new version and Christian's approval.
- Files in `public/brand/`: wordmark, square and 3:1 banner, each light and dark with identical geometry, plus PNG
  exports and `cueory-brand-manifest.json` (checksums). Tests fail if a file drifts from the master.
- Primary aspect ratio 1:1 (square), wordmark centered. The full banner is 3:1; use it only where the motto stays
  readable (about 800px wide or more), otherwise wordmark plus live-text motto.
- Clear space: at least 0.25 × letter height on all sides.
- Minimum size: 96 px wide on screen, 25 mm (1 in) wide in print.
- Espresso logo on ivory backgrounds. Evening Ivory logo on charcoal backgrounds.

## Usage rules
- Use only the exact colors, the fonts above, and the lowercase spelling "cueory".
- Never retype, re-space, outline-stroke or stretch the logo; use the files in `public/brand/`.

## Accessibility notes (engineering)
- Mocha (daytime) and Bronze (evening) are too low-contrast for small text. Use them only for fills, borders and
  highlights. Tests in `tests/unit/tokens.test.ts` enforce text contrast for both palettes.
- Right/wrong answers (Task 4) must use words and icons. The brand has no red or green, and color is never the only
  signal.
- Website color roles (spec section 6): buttons Espresso on Ivory text (day) / Sand with Charcoal text (evening);
  form borders and focus outlines Bronze (day) / Sand (evening).
- Light / Dark / Follow device (spec section 9): a switch in every page footer. Follow device is the default; a
  Light or Dark pick overrides the device and is remembered in the browser. Colors change, layout never does.
