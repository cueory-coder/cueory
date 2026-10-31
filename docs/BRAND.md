# cueory brand guide

Sources: Christian's brand board and `brand-source/Cueory_Branding_Spec.md` (both 2026-10-31). Where they differ, the
spec wins. Colors are applied in `src/styles/tokens.css`. Logo files are built from one traced geometry master by
`scripts/build-brand.mjs`.

## Identity
- **Brand name:** Cueory (the logo is always lowercase: "cueory"). In prose the name is "Cueory"; in lowercase-styled
  UI (headlines, buttons, menus, page titles) it is "cueory", matching the wordmark (D-47).
- **Motto (exact, always lowercase):** `by nursing students, for nursing students.`
- **Product description:** Nursing school is hard enough. Cueory makes studying simpler.
- **Use:** website, app, social, and all brand materials

## Typography
- **Logo (wordmark "cueory"):** traced artwork from the approved banner. It is never typed in a font. Bodoni Moda
  Medium was only an earlier approximation (spec section 1).
- **Body text, UI, buttons, and headings on study screens:** Inter. Live-text motto: Inter Medium, letter spacing 0.02em.
- **Marketing headings and their italic accent line:** Bodoni Moda Medium (spec section 4: 36–72 px, line height 1.12,
  letter spacing −0.025em), self-hosted Latin files in `public/fonts/` under the SIL Open Font License (D-41).

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

## Marketing look (D-41)
Christian's redesign brief (2026-10-31) for the marketing pages only: home, support, the legal pages and 404. It relaxes
"nothing decorative" there at his request; study screens stay plain.
- **Mood:** quiet luxury, editorial, like a high-end "launching soon" page. Lots of empty space.
- **Home hero (D-46):** full first screen, centered: the small traced wordmark, the motto, the Bodoni headline
  "nursing school is hard enough." on one straight line at every width (its size follows the screen, 72 px at most),
  the italic accent line "cueory makes studying simpler.", and one glassy pill button, "create your free account",
  with a small line under it. Until accounts exist it goes to the launch-updates signup; a quiet link keeps the free
  study-skills course one tap away.
- **Glassy button:** translucent brand glass (Espresso by day, Sand in the evening, about 80% opaque), a blur behind
  it, a thin light rim and a soft shadow. Where a browser can't blur, it is drawn solid.
- **Corners (every page, D-46):** a round ☰ button top-left and an account button top-right, 44 px, frosted on
  marketing pages and plain on study screens. ☰ opens a full-height side panel of dark glass (Espresso-tinted by day
  with Ivory text, Charcoal in the evening) that slides in from the left and dims the page; the current page is marked
  with a short line, not color alone. The account button opens a small menu of the same glass.
- **Background:** draped silk drawn in code from brand colors only: Ivory, Linen and Taupe by day; Charcoal and Walnut in
  the evening. CSS gradients plus a tiny SVG grain (about 1 KB for both palettes). No stock photos. A photo Christian
  supplies could replace it later.
- **Embossed logo:** the traced wordmark, very large and tone-on-tone (Linen by day, Walnut in the evening) behind the
  hero, hidden from screen readers.
- **Panels:** frosted (Ivory or Walnut, three-quarters opaque, blurred), rounded `--radius-xl`, soft shadow.
- **Readable:** tests compose the darkest Daytime and lightest Evening point of every background and require WCAG AA for
  Espresso/Bronze and Evening Ivory/Sand text.

## Voice: all lowercase (D-47)
Christian's decision (2026-10-31), to match how younger students write.
- **Lowercase:** headlines, taglines, section labels, buttons, navigation and menu items, panels, carousel chips and
  card titles, footer links, browser-tab titles, email and social copy. "nursing school is hard enough.",
  "create your free account", "support cueory".
- **Normal capitals stay** where accuracy and trust matter more than style: all nursing content (lessons, cards,
  questions, rationales; ABG, COPD, IV, mmHg and Na+ stay exact), acronyms and proper nouns anywhere (NCLEX, Open RN,
  YouTube, Ko-fi, Google), legal body text (privacy, terms, disclaimer; their headings can be lowercase), and error
  messages or form instructions that must be read carefully.
- **How:** write the copy in lowercase in the source. Never use CSS `text-transform` (it would change acronyms and
  names too). Screen-reader labels stay natural; lowercase reads the same aloud.

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
