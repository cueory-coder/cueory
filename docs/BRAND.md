# cueory brand guide

Source: Christian's brand board (2026-10-31). This text copy is what engineers and reviewers follow. Colors are applied
in `src/styles/tokens.css`. The logo is produced by `scripts/build-logo.mjs`.

## Identity
- **Brand name:** Cueory (the logo is always lowercase: "cueory")
- **Tagline:** By nursing students, for nursing students.
- **Use:** website, app, social, and all brand materials

## Typography
- **Logo (wordmark "cueory"):** Bodoni Moda Medium, weight 500, lowercase, letter spacing 0, default kerning
- **Headings, body text, UI and buttons:** Inter

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
- Primary aspect ratio 1:1 (square), wordmark centered.
- Clear space: at least 0.25 × letter height on all sides.
- Minimum size: 96 px wide on screen, 25 mm (1 in) wide in print.
- Espresso logo on ivory backgrounds. Evening Ivory logo on charcoal backgrounds.

## Usage rules
- Use only the exact colors, the fonts above, and the lowercase spelling "cueory".
- Keep logo letter spacing at 0 and weight at 500.

## Accessibility notes (engineering)
- Mocha (daytime) and Bronze (evening) are too low-contrast for small text. Use them only for fills, borders and
  highlights. Tests in `tests/unit/tokens.test.ts` enforce text contrast for both palettes.
- Right/wrong answers (Task 4) must use words and icons. The brand has no red or green, and color is never the only
  signal.
- Open item: the board lists the logo width as ≈ 3.18 × letter height, but the supplied artwork measures about
  4.2 × its full height. The generated logo matches the artwork (≈ 4.3). If Christian supplies the original logo file,
  it replaces the generated one.
