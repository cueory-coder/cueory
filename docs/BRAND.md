# cueory brand guide

**Brand v1.0 (D-55).** The full specification is Christian's
[`brand-source/v1.0/Cueory_Brand_Guide.md`](../brand-source/v1.0/Cueory_Brand_Guide.md). It wins over this summary and
over everything in `brand-source/legacy/` (the earlier spec, traced banner and geometry master, kept for history only).
Colors are applied in `src/styles/tokens.css`. The logo is shown by `src/components/Wordmark.astro`.

## Identity
- **Brand name:** Cueory (the logo is always lowercase: "cueory"). In prose the name is "Cueory"; in lowercase-styled
  UI (headlines, buttons, menus, page titles) it is "cueory", matching the wordmark (D-47).
- **Motto (exact, always lowercase):** `by nursing students, for nursing students.`
- **Product description:** Nursing school is hard enough. Cueory makes studying simpler.
- **Use:** website, app, social, and all brand materials.

## Logo
- **The logo is Christian's PNG artwork**, approved 2026-10-31: the custom serif wordmark "cueory", a water-drop end on
  the **c**, and a small half-filled **cruet** above the c and u. Three families (guide §3.4):
  - the **full logo** (wordmark and cruet), the main identifier;
  - the **emblem** (water-drop c and cruet), for compact places;
  - the **cruet alone**, a small supporting mark, never the only identifier.
- **Never** retype it in a font, trace it into an SVG, redraw the c, move or resize the cruet, stretch it, or add a
  gradient, shadow, embossing, outline, texture or any other color (guide §3.6 and §2.4).
- **Sources:** `brand-source/v1.0/` holds every file Christian supplied, unchanged: the guide, the PNGs and his
  Photoshop working file for the emblem. `manifest.json` records each file's checksum.
- **Web copies:** `public/brand/v1/` holds copies built from them by `node scripts/build-brand-v1.mjs`:
  - the full logo and the emblem, in Espresso and in Ivory, on transparent backgrounds, cropped to the artwork, at a
    few widths;
  - the cruet alone (`cruet-light-*` and `cruet-dark-*`, 32, 64 and 128px wide), the same way (Task 138);
  - browser and home-screen icons (the emblem on Ivory).

  The script never redraws anything. It reads how much ink covers each pixel and writes that ink in one exact brand
  color, so the logo sits on silk without a box, and the cruet's empty top half stays empty.
- **Same drawing in both palettes (guide §4.5).** The full logo and the emblem use the light file's drawing in both
  palettes. The dark files are the same drawings (the script checks the overlap), but the full logo's dark file has
  stair-stepped edges and the emblem's dark file is only 348px wide.
- **The cruet alone (Task 138).** Its files draw it only about 135px wide, so no copy is wider than 128px and nothing is
  scaled up. Its dark file is a coarser drawing (one thick handle, a striped neck), so both palettes use the light
  file's drawing, which the script checks against the cruet in the approved emblem. It is used in one place: pillo's
  game mark on /play (`src/components/PilloTitle.astro`), at the top right of the name "pillo" set in Bodoni Moda, as
  in Christian's approved mockup. It is a supporting mark next to the name, never the only identifier: the name is
  the text and the cruet is decorative (empty alt text).
- **Tests:** `tests/unit/brand.test.ts` fails if a source or web copy changes without rebuilding, or if any pixel
  drifts from the exact colors.
- **Sizes (guide §3.5):**
  - Full logo: 240px wide in the header on screens 640px and wider, and 240–320px in the home hero.
  - On phones the header shows the emblem: 240px plus the two corner buttons would not fit.
  - Study screens show the emblem, 36px wide (guide §6.1: small, unobtrusive branding during study).
  - Clear space: at least 0.25 × the height of the letter c on every side.
- **Palettes:** Espresso art on the Daytime palette, Ivory art on the Evening palette. Both images are in the page,
  and CSS shows the one that matches. Printing uses the Espresso art.

## Typography
- **Logo:** the artwork above. Bodoni Moda Medium is only a reference for its letter style (guide §5.1).
- **Body text, UI, buttons, and headings on study screens:** Lato, regular and bold (Christian, 2026-11-01; replaces
  Inter from guide §5.2). Self-hosted Latin files in `public/fonts/`, SIL Open Font License. Live-text motto: Lato Bold.
- **Line spacing:** at least 1.5 for every text style set in Lato (Christian, 2026-11-01).
- **Marketing headings:** Bodoni Moda Medium (D-41). **Accent lines** under them (for example "cueory makes studying
  simpler.") are plain upright Lato in Bronze, never italic or script (Christian, 2026-11-01: the italic serif was hard to
  read). The fonts are self-hosted Latin
  files in `public/fonts/`, under the SIL Open Font License. Serif is for the logo and selected editorial emphasis
  only (guide §5.3).

## Daytime (light) palette
| Role | Name | HEX |
| --- | --- | --- |
| Page background | Ivory | `#F9F5EF` |
| Card / surface | Linen | `#EADCCF` |
| Decorative / soft fill | Taupe | `#D3B7A1` |
| Accents / highlights (not small text) | Mocha | `#8B6F5B` |
| Primary text / logo / buttons | Espresso | `#3E2C23` |
| Secondary text / icons | Bronze | `#6B5243` |

## Evening (dark) palette
| Role | Name | HEX |
| --- | --- | --- |
| Page background | Charcoal | `#1C1917` |
| Card / surface | Walnut | `#3A2D24` |
| Accents / highlights (not text) | Bronze | `#6B5243` |
| Secondary text / UI | Sand | `#CBB8A4` |
| Primary text / logo | Ivory | `#F9F5EF` |

**Retired (guide §4.3):** Espresso `#3F2E24`, Charcoal `#1B1715` and Evening Ivory `#EFE6DA` from the earlier board. A
test fails if they come back.

## Marketing look (D-41)
This covers the marketing pages only: home, support, the legal pages and 404. Study screens stay plain.
- **Mood:** quiet luxury, editorial, calm (guide §6.1). Wide margins, one focal element per section, few simultaneous
  visual cues, no clutter.
- **Home hero (D-46, D-55):** full first screen, centered, top to bottom:
  1. the logo;
  2. the Bodoni headline "nursing school is hard enough." on one line at every width;
  3. the accent line "cueory makes studying simpler." (plain Lato);
  4. one glassy pill button, "create your free account";
  5. one small line under it.

  The embossed logo is gone (forbidden by guide §3.6). The motto is in the footer.
- **Glassy button:** translucent brand glass (Espresso by day, Sand in the evening, about 80% opaque), a blur behind
  it, a thin light rim and a soft shadow. Where a browser can't blur, it is drawn solid.
- **Corners (every page, D-46):**
  - A round ☰ button top-left and an account button top-right, 44px. They are frosted on marketing pages and plain on
    study screens.
  - ☰ opens a full-height side panel of dark glass that dims the page. The current page is marked with a short line,
    not by color alone.
- **Background:** draped silk drawn in code from brand colors only, plus a tiny SVG grain tinted Espresso by day and
  Ivory in the evening. No stock photos.
- **Panels:** frosted (Ivory or Walnut, three-quarters opaque, blurred), rounded `--radius-xl`, soft shadow.
- **Readable:** tests compose the darkest Daytime and the lightest Evening point of every background, and require WCAG
  AA for text.
- **No medical clip art** (guide §0, rule 4): no stethoscopes, ECG lines, cartoon nurses, syringes, red crosses or
  hospital blue as decoration.

## Voice: all lowercase (D-47)
Christian's decision (2026-10-31), to match how younger students write.
- **Lowercase:** headlines, taglines, section labels, buttons, navigation and menu items, panels, card titles, footer
  links, browser-tab titles, email and social copy. Examples: "nursing school is hard enough.", "create your free
  account", "support cueory".
- **Normal capitals stay** where accuracy and trust matter more than style:
  - all nursing content: lessons, cards, questions and rationales (ABG, COPD, IV, mmHg and Na+ stay exact);
  - acronyms and proper nouns anywhere (NCLEX, Open RN, YouTube, Ko-fi, Google);
  - legal body text: privacy, terms and disclaimer (their headings can be lowercase);
  - error messages and form instructions that must be read carefully.
- **How:** write the copy in lowercase in the source. Never use CSS `text-transform`, which would change acronyms and
  names too. Screen-reader labels stay natural; lowercase reads the same aloud.

## Accessibility notes (engineering)
- **Low-contrast colors:** Mocha (daytime, 4.28:1 on Ivory) and Bronze (evening) are too low-contrast for small text.
  Use them only for fills, borders and highlights. `tests/unit/tokens.test.ts` enforces text contrast for both
  palettes.
- **Right and wrong answers** (Task 4) use words and icons. The brand has no red or green, and color is never the only
  signal.
- **Motion:** hover scale 1.015–1.04 over 160–240 ms; transitions of 180–280 ms, easing out (guide §7.3). Reduced
  motion removes everything nonessential.
- **Light / Dark / Follow device:** a switch in every page footer. Follow device is the default; a Light or Dark pick
  overrides the device and is remembered in the browser. Colors change; layout never does.
