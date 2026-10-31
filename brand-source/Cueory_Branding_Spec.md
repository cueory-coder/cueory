# Cueory — Branding and Long-Banner Specification

**Version:** 1.0 — lowercase motto / long-banner handoff  
**Prepared:** October 31, 2026  
**For:** Design, development, content, and marketing agents  
**Primary website:** `cueory.app`  
**Scope:** Record the selected branding and define a repeatable implementation. This document does not deploy a website or supply a new vector logo.

> Reuse the selected artwork. Do not generate a new interpretation of the Cueory logo for each asset. Light and dark versions must use identical geometry, with only their assigned colors changing.

## 1. Source of truth and status

This handoff combines:

1. The user's selected Cueory wordmark and most recent long-banner reference.
2. The user's direction to make the entire motto lowercase.
3. The previously supplied Cueory daytime/evening color specifications.
4. Implementation rules below, explicitly identified where they are proposed rather than recovered from the image.

**Priority when older material conflicts:** the latest user instructions determine wording and layout. The explicit hex values in this document determine production colors. The latest banner determines the visual letterforms and composition. Older logo concepts and old taglines are not interchangeable substitutes.

### Important accuracy distinction

The reference banner is an AI-generated raster image. It does not contain a recoverable font family, font weight, font size, or kerning specification. Its pixels also contain subtle color variation.

**Bodoni Moda Medium was an earlier approximation, not an identification of the exact logo font.** Neither that font nor a new image-generation prompt is guaranteed to reproduce the selected wordmark.

For repeatable production, create one approved, outlined vector master from the selected artwork. Then reuse that file. Until the vector has been reviewed, retain the supplied PNG as the visual reference and do not describe a font reconstruction as an exact match.

A Markdown specification by itself cannot guarantee identical AI-generated images. Fixed assets, fixed geometry, explicit colors, and a controlled renderer provide the repeatable workflow.

## 2. Exact brand wording

| Element | Required wording |
|---|---|
| Name in ordinary prose | `Cueory` |
| Wordmark | `cueory` |
| Motto in the banner | `by nursing students, for nursing students.` |
| Product description | `Nursing school is hard enough. Cueory makes studying simpler.` |
| Website | `cueory.app` |

### Motto rules

- All letters are lowercase.
- Preserve the comma after the first `students`.
- Preserve the final period in the banner lockup.
- Use one space between words and after the comma.
- Keep the motto on one line in the long banner.
- Do not use `text-transform: uppercase` or capitalize the first word.
- Do not replace the motto with `stay cueory`, `know your cues`, or another earlier line.
- The short horizontal rules at both sides are decorative artwork, not typed hyphens or em dashes.

**Exact string for implementation:**

```text
by nursing students, for nursing students.
```

## 3. Brand character

**Selected direction:** warm, minimal, editorial, polished, and approachable.

The visual hierarchy is a prominent serif wordmark above a smaller, readable sans-serif motto. The palette uses warm neutrals rather than pure black and white. Spacious composition is part of the identity.

Keep study interfaces quieter than marketing banners. Do not add medical crosses, heartbeats, stethoscopes, sparkles, mascots, gradients, or background illustrations to this logo lockup without a separate approved design change.

## 4. Exact long-banner reference

### Supplied reference asset

```text
Original filename:
a_clean_minimal_brand_banner_on_a_warm_ivory_back.png

File type: PNG
Color mode: RGB
Native dimensions: 2172 × 724 pixels
Aspect ratio: 3:1

SHA-256:
056266ef0b4687918de8e3b1b952562c13f415ad03d3327d17b0beec01a962e0
```

The companion reference copy, when supplied with this handoff, is named:

```text
cueory-banner-reference-light.png
```

It has the same bytes and checksum as the original. It is a visual reference, not an exact-flat-color production master.

### Reference composition

The banner contains:

1. The lowercase `cueory` wordmark, centered approximately above the motto.
2. The lowercase motto on one line below it.
3. One short horizontal rule on each side of the motto.
4. Generous empty space around the entire arrangement.

There are no other words, icons, or graphics.

### Measured visible bounds

The following are **approximate visible-ink measurements from the supplied raster**, not recovered text-box or font metrics. Measurements used pixels with mean RGB below 170 to separate dark artwork from the light background. Antialiased edge pixels can extend slightly beyond these bounds.

Coordinates use the upper-left corner as `(0, 0)`. Bounding boxes are `[left, top, right, bottom)`, with the right and bottom edges exclusive.

| Element | Bounding box at 2172 × 724 | Visible width | Visible height |
|---|---|---:|---:|
| Wordmark, including the `y` descender | `[560, 204, 1620, 441)` | 1060 px | 237 px |
| Motto | `[427, 464, 1749, 518)` | 1322 px | 54 px |
| Left decorative rule | `[198, 491, 372, 496)` | 174 px | 5 px |
| Right decorative rule | `[1802, 491, 1976, 496)` | 174 px | 5 px |
| Entire visible lockup | `[198, 204, 1976, 518)` | 1778 px | 314 px |

Useful reference relationships:

- Canvas center: `(1086, 362)`.
- Wordmark bounding-box center: `(1090, 322.5)`.
- Motto bounding-box center: `(1088, 491)`.
- Gap from the lowest wordmark pixel to the top of the motto: approximately 23 px.
- Gap from the left rule to the motto: approximately 55 px.
- Gap from the motto to the right rule: approximately 53 px.
- Outer horizontal margins: approximately 198 px left and 196 px right.
- Outer vertical margins: approximately 204 px above and 206 px below the complete lockup.

Small asymmetries belong to the reference. Do not independently shift letters or recenter components as an unapproved cleanup.

### Scaling rule

Use the native reference coordinates as the layout basis:

```text
scale = output_width / 2172
output_height = output_width / 3

new_x = source_x × scale
new_y = source_y × scale
new_width = source_width × scale
new_height = source_height × scale
```

Scale the **entire lockup uniformly**. Never scale letters, rules, or the motto independently to fit a new output.

Examples of correct 3:1 export sizes:

| Use | Dimensions |
|---|---|
| Native reference | 2172 × 724 px |
| Common banner export | 3000 × 1000 px |
| Larger vector-derived export | 6000 × 2000 px |

Larger PNG dimensions do not create vector detail when merely enlarging the raster reference. Label an upscaled raster honestly. Export genuinely high-resolution production PNGs from the approved vector master when it exists.

A platform-specific cover with a different ratio requires a separate approved layout or additional safe padding. Do not stretch the 3:1 artwork.

## 5. Letterforms, thickness, and spacing

### Wordmark

The logo is artwork, not ordinary website text.

Preserve the selected:

- Lowercase letter shapes.
- Serif shapes and rounded terminals.
- Thin-to-thick stroke relationships.
- Open spaces inside each letter.
- Shape and length of the `y` descender.
- Relative letter sizes and positions.
- Spacing between adjacent letters.

**There is no single stroke-width value for this serif wordmark.** Its thickness varies along its contours. The approved vector paths must encode that variation.

Do not apply an SVG stroke, CSS text stroke, artificial bolding, horizontal compression, or automatic tracking to the logo. Use filled contours at full opacity. Once approved, the master geometry is fixed.

### Font policy

| Role | Specification | Status |
|---|---|---|
| Cueory logo | Approved outlined artwork based on the latest reference | Required production approach. A matching vector master still needs verification. |
| Bodoni Moda Medium, 500 | Possible font for ordinary marketing headings or a clearly labeled logo approximation | Earlier recommended font, not proof of the source logo's exact font. |
| Website body, questions, navigation | Inter | Retained implementation recommendation. |
| Live-text motto outside the logo | Inter Medium, 500 | Implementation recommendation, not an identification of the generated motto. |
| Banner motto | Preserve approved outlined artwork after reconstruction | Do not repeatedly typeset with changing font versions. |

Do not inherit old uppercase-motto tracking such as `0.35em`. Do not assume old wordmark tracking such as `-0.04em`, or a generated board's `0`, describes the source image. The approved artwork takes precedence.

### Supporting website typography

These are **proposed website implementation values**, not measurements of the banner:

| Element | Family | Weight | Size | Line height | Letter spacing |
|---|---|---:|---|---:|---|
| Lesson text and questions | Inter | 400 | 18 px | 1.65 | 0 |
| Navigation | Inter | 500 | 16 px | 1.5 | 0 |
| Buttons | Inter | 600 | 16 px | 1.25 | 0 |
| Supporting live-text motto | Inter | 500 | 16–18 px | 1.5 | 0.02em |
| Marketing headings | Bodoni Moda | 500 | 36–72 px | 1.12 | -0.025em |

Pin actual font files and versions in the development project. Record their hashes. Wait for fonts to finish loading before taking reference screenshots or converting text to outlines. No font binaries are supplied with this handoff.

## 6. Fixed light and dark colors

Use these hex values, not colors sampled from the generated reference's shading.

### Light palette

| Name | HEX | RGB | Role |
|---|---|---|---|
| Ivory | `#F9F5EF` | 249, 245, 239 | Main background |
| Linen | `#EADCCF` | 234, 220, 207 | Cards and sections |
| Taupe | `#D3B7A1` | 211, 183, 161 | Decorative fills |
| Mocha | `#8B6F5B` | 139, 111, 91 | Decorative accents |
| Espresso | `#3F2E24` | 63, 46, 36 | Wordmark and primary text |
| Bronze | `#6B5243` | 107, 82, 67 | Secondary text and supporting details |

### Dark palette

| Name | HEX | RGB | Role |
|---|---|---|---|
| Charcoal | `#1B1715` | 27, 23, 21 | Main background |
| Walnut | `#3A2D24` | 58, 45, 36 | Cards and sections |
| Bronze | `#6B5243` | 107, 82, 67 | Decorative accents only |
| Sand | `#CBB8A4` | 203, 184, 164 | Secondary text and controls |
| Evening Ivory | `#EFE6DA` | 239, 230, 218 | Wordmark and primary text |

### Banner color assignment

The background/wordmark pairs retain the previously selected palette. Applying the existing secondary-text colors to the lowercase motto and rules is the production mapping specified by this handoff.

| Banner component | Light | Dark |
|---|---|---|
| Background | `#F9F5EF` | `#1B1715` |
| Wordmark | `#3F2E24` | `#EFE6DA` |
| Lowercase motto | `#6B5243` | `#CBB8A4` |
| Both decorative rules | `#6B5243` | `#CBB8A4` |

All fills use opacity `1`. Use no gradients, artificial lighting, shadows, paper texture, or transparency in the background-bearing master.

An intentional transparent version may omit the background only. It must still be labeled for the appropriate destination theme.

Antialiased edge pixels naturally blend foreground and background. Exact hex checks apply to opaque interior pixels and source fill definitions, not every edge pixel. Different renderers may rasterize edges differently even when geometry and fill colors match.

### Website color assignment

| Element | Light | Dark |
|---|---|---|
| Page background | `#F9F5EF` | `#1B1715` |
| Card background | `#EADCCF` | `#3A2D24` |
| Main text | `#3F2E24` | `#EFE6DA` |
| Secondary text | `#6B5243` | `#CBB8A4` |
| Primary button background | `#3F2E24` | `#CBB8A4` |
| Primary button text | `#F9F5EF` | `#1B1715` |
| Form boundary / focus outline | `#6B5243` | `#CBB8A4` |

Do not use a global CSS invert filter to produce dark mode. It changes unrelated images and educational visuals as well as the brand colors.

### Readability notes retained from the earlier specification

The earlier specification calculated these solid-color pairs:

| Pair | Contrast |
|---|---:|
| Espresso on Ivory | 11.88:1 |
| Bronze on Ivory | 6.64:1 |
| Evening Ivory on Charcoal | 14.41:1 |
| Sand on Charcoal | 9.26:1 |

These values describe those flat-color combinations only, not full-site accessibility. The previous guide's lighter Mocha-on-Ivory pairing was about 4.28:1. Keep Mocha decorative rather than using it for small lesson text. Keep Bronze decorative in dark mode.

## 7. Exact asset workflow for agents

### Establish one master

1. Open the reference image and confirm its checksum.
2. Reconstruct its visible geometry as vector outlines without substituting a different wordmark design.
3. Preserve the native 2172 × 724 composition and measured proportions as the reference for comparison.
4. Assign the fixed production colors above rather than copying the reference's gradients or pixel variation.
5. Review the new vector beside the reference at full size and at intended display sizes. Obtain approval for the reconstruction.
6. Save the approved version as the immutable geometry master. Record its version and SHA-256.
7. Produce light and dark assets from that same geometry. Only fill assignments change.
8. Keep source vectors, exported files, and a manifest together in version control.

**No new vector reconstruction or dark banner is supplied by this Markdown document.** These are implementation tasks, not completed deliverables.

### Suggested production filenames

The following are **target filenames**, not a claim that the files already exist:

```text
public/brand/
  cueory-banner-light.svg
  cueory-banner-dark.svg
  cueory-banner-light-3000x1000.png
  cueory-banner-dark-3000x1000.png
  cueory-wordmark-light.svg
  cueory-wordmark-dark.svg
  cueory-brand-manifest.json
```

The wordmark-only files are separate responsive assets. They must use the same approved letterforms, not a second font approximation.

A production SVG should use outlines, a fixed `viewBox`, explicit fills, and no embedded font files. Its geometry must not depend on fonts installed on the viewer's device. Add an accessible title or equivalent alternative text.

### Renderer consistency

For byte-for-byte repeatable exports, pin the renderer version, output size, color handling, and export settings. Record them in the manifest. Keep production colors in sRGB. PNG is the default raster format for the wordmark.

Do not claim that a PNG is vector merely because it is embedded in an SVG wrapper. Do not claim that AI upscaling created additional original logo detail.

## 8. Responsive behavior

The full lockup is a long banner, not a navigation logo.

**Proposed display rule:** use the complete lockup only where the motto remains comfortably readable. As an initial implementation check, use approximately 800 CSS px as the minimum full-banner display width, then test the actual result.

At smaller widths:

- Use the approved wordmark-only artwork.
- Place the motto below it as live Inter text.
- Permit the live motto to wrap at normal word boundaries.
- Hide decorative rules when they crowd the text.
- Do not shrink the entire desktop banner until the motto becomes illegible.

This responsive arrangement is an implementation recommendation, not a separate approved logo redesign. Do not bake a line break into the master long banner.

For square social images, use a separately approved square layout. Do not turn the 3:1 banner into a square by stretching it or cutting off its ends.

## 9. Theme implementation

Support Light, Dark, and Follow device. User choice should override device preference when explicitly selected. Theme switching changes colors, not layout, geometry, font weight, or spacing.

Example brand tokens:

```json
{
  "brand": {
    "name": "Cueory",
    "wordmark": "cueory",
    "motto": "by nursing students, for nursing students.",
    "banner": {
      "referenceWidth": 2172,
      "referenceHeight": 724,
      "aspectRatio": "3:1",
      "referenceSha256": "056266ef0b4687918de8e3b1b952562c13f415ad03d3327d17b0beec01a962e0"
    }
  },
  "themes": {
    "light": {
      "background": "#F9F5EF",
      "surface": "#EADCCF",
      "wordmark": "#3F2E24",
      "motto": "#6B5243",
      "rules": "#6B5243",
      "buttonBackground": "#3F2E24",
      "buttonText": "#F9F5EF"
    },
    "dark": {
      "background": "#1B1715",
      "surface": "#3A2D24",
      "wordmark": "#EFE6DA",
      "motto": "#CBB8A4",
      "rules": "#CBB8A4",
      "buttonBackground": "#CBB8A4",
      "buttonText": "#1B1715"
    }
  }
}
```

When using external SVGs through `<img>`, select the correct themed asset. Do not assume page CSS automatically recolors paths inside an external image. With inline SVG, connect its fills to the appropriate theme tokens.

## 10. Acceptance checklist

An agent must verify the actual exported file, not merely report that a prompt contained the right instructions.

### Copy

- [ ] Wordmark reads exactly `cueory`.
- [ ] Banner motto reads exactly `by nursing students, for nursing students.`
- [ ] Motto is fully lowercase with the correct comma and period.
- [ ] No old tagline remains in public assets or page templates.

### Geometry

- [ ] Full banner is 3:1.
- [ ] Letterforms match the approved master.
- [ ] Letter spacing, contours, and stroke thickness have not been independently changed.
- [ ] Wordmark, motto, and rules scale as a single composition.
- [ ] No cropped descender, missing rule, or distorted letter appears.
- [ ] Light and dark assets contain the same geometry and placement.

### Colors

- [ ] Light background is `#F9F5EF` and wordmark is `#3F2E24`.
- [ ] Dark background is `#1B1715` and wordmark is `#EFE6DA`.
- [ ] Motto and rules use the theme-specific secondary color.
- [ ] Opaque interior colors match the intended values.
- [ ] No gradient, shadow, texture, or global inversion has been introduced.

### Implementation

- [ ] Logo artwork does not depend on a live font fallback.
- [ ] Mobile use keeps the motto readable rather than shrinking it excessively.
- [ ] Image alternative text or SVG accessible naming is present.
- [ ] Release contains approved source assets, version information, checksums, and export settings.
- [ ] New production exports receive visual review before replacing existing assets.

## 11. Copy-and-paste developer-agent instruction

> Implement Cueory's branding from this specification and the supplied reference artwork. The latest logo is lowercase `cueory`. The exact banner motto is `by nursing students, for nursing students.` in lowercase. The long banner is 3:1, based on the 2172 × 724 reference. Preserve letter shapes, spacing, proportions, the y descender, and the two short rules. Do not regenerate the logo with an image model or substitute a font and claim it is identical. Use the approved vector master when available. If it is missing, flag that dependency and prepare a clearly labeled reconstruction for approval. Light colors: background #F9F5EF, wordmark #3F2E24, motto and rules #6B5243. Dark colors: background #1B1715, wordmark #EFE6DA, motto and rules #CBB8A4. Use identical geometry in both themes. No gradients, textures, shadows, uppercase motto, new symbols, or unapproved tracking changes. Use Inter for interface text. Bodoni Moda is an earlier heading/approximation recommendation, not a verified identification of the generated logo. Return the actual files, checksums, renderer settings, and verification results. Do not claim deployment or exact reproduction unless performed and checked.

## 12. Provenance and outstanding work

**Source-derived decisions:** name, exact lowercase motto, selected 3:1 banner artwork, full light/dark palette, and the requirement to keep shapes consistent between themes.

**Measured in this handoff:** source PNG dimensions, checksum, and approximate visible-ink bounding boxes.

**Implementation proposals:** controlled asset workflow, naming convention, responsive minimum, live-text styling, and the assignment of existing secondary colors to motto/rules.

**Not established by the reference:** an exact logo font name, numeric font weight, live-text tracking, original vector paths, or a fully approved responsive/mobile lockup.

**Still required before claiming a definitive vector brand master:** reconstruct the latest banner's shapes, confirm the lowercase motto treatment, approve the vector, and freeze its geometry. Earlier square-logo SVGs, if located, must be compared rather than assumed to match this newer banner.

**Earlier supplied document used for the palette and supporting typography:** `Cueory_Font_and_Color_Spec.md`. Its uppercase tagline settings are superseded by the latest lowercase-motto instruction. Its font-approximation caveat remains in force.

No font files, legal clearance, website changes, account changes, or newly generated logo artwork are included in this handoff.
