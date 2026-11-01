# CUEORY — BRAND IDENTITY & IMPLEMENTATION SPECIFICATION

**Version:** 1.0  
**Date:** October 31, 2026  
**Document type:** Brand system, logo specification, creative direction, and developer handoff  
**Owner:** Cueory brand / creative direction  
**Purpose:** Give designers, developers, content agents, video producers, and quality reviewers one consistent specification for the **current Cueory identity**.

> **Read this first:** The latest **color-cleaned, user-approved Cueory logo images** are the visual source of truth. The logo artwork is **not** to be recreated with a font, regenerated with an AI image model, or silently changed to match an older brand board. This document distinguishes **confirmed decisions** from **implementation recommendations** and **open items**.

---

## 0. One-minute handoff

| Item | Current requirement | Status |
|---|---|---|
| Name | **cueory** in the logo, all lowercase | Confirmed |
| Product | Nursing learning and practice platform | Confirmed |
| Core promise | Clear, approachable, already-prepared nursing study material | Confirmed strategic positioning |
| Primary motto | **by nursing students, for nursing students.** | Confirmed wording/style |
| Secondary descriptive line | **nursing study, made clear.** | Existing strategy line; optional secondary copy |
| Look | Minimal, refined, calm, editorial, warm, high-end educational technology | Confirmed |
| Logo | Original custom serif **cueory** wordmark, **water-drop terminal on the c**, small **half-filled cruet** above the c/u area | Confirmed from current logo images |
| Light background | `#F9F5EF` (warm ivory) | Confirmed from cleaned images |
| Light logo/text | `#3E2C23` (espresso brown) | Confirmed from cleaned images |
| Dark background | `#1C1917` (near-black brown) | Confirmed from cleaned images |
| Dark logo/text | `#F9F5EF` (warm ivory) | Confirmed from cleaned images |
| Logo font reference | Bodoni Moda Medium, weight 500, lowercase, tracking 0 | Earlier official brand board; **not a replacement for the fixed logo artwork** |
| General interface font | Inter | Earlier official brand board; recommended current UI standard |
| UX | Readable, restrained, distraction-aware, accessible, responsive | Confirmed design direction |
| Branding rules | Preserve established proportions, geometry, lettering and colors | Confirmed repeatedly by founder |

### Absolute restrictions for every agent

1. **Never alter `ueory`.** Preserve the exact original letterforms, kerning, serifs, proportions, and the distinctive terminal of the `y`.
2. **Never redraw the `c`** unless explicitly instructed. Its approved upper-right end has a rounded **water-drop-like** terminal and its lower-right stroke tapers to a fine point.
3. **Do not resize, relocate, rotate, stylize, or replace the cruet** in an approved logo without explicit sign-off.
4. Do not convert the brand into generic medical clip art: no automatic stethoscopes, ECG lines, cartoon nurses, syringes, red crosses, or blue hospital colors.
5. **Do not invent clinical authority:** no claim that Cueory content is RN-reviewed or clinically validated unless the specific item actually received that review.
6. Do not confuse **`#3E2C23`** with the older board's **`#3F2E24`**, or **`#1C1917`** with its **`#1B1715`**. The cleaned-asset values govern current logo implementation.

---

## 1. Brand foundation

### 1.1 Name, pronunciation, and semantics

- **Brand name:** Cueory.
- **Written brand name in prose:** `Cueory` may be capitalized at the beginning of a sentence.
- **Official visible wordmark:** `cueory`, **lowercase only**.
- **Approximate pronunciation:** “KYOO-uh-ree” (from the October 30 strategy document).
- **Name rationale:** “cue” + “theory”; connect meaningful patient cues to understanding and clinical reasoning.
- **Brand category:** Self-directed nursing education and study support.
- **Primary audience:** Students learning nursing fundamentals and medical-surgical concepts, including beginners who need prerequisites explained before higher-level material.
- **Longer-term learning journey:** Foundations → med-surg → cumulative nursing-school and NCLEX preparation. Expansion must not be presented as already released.

### 1.2 Mission and product positioning

**Mission:** Help nursing students understand one clinical concept at a time, practice it without having to build their own study resources, and confidently recognize what to study next.

**Positioning statement:** A calm, carefully designed nursing study experience that makes difficult topics understandable through short explanations, intentional visuals, built-in practice, and honest sourcing and review labels.

**Product advantages to emphasize** (aspirational where features are still being built):

- Concepts taught from the knowledge a beginner actually has.
- Small, connected teaching units rather than overwhelming walls of text.
- Multiple ways to study the same concept, with no required format or learning-style label.
- Beautiful, practical and distraction-aware interfaces.
- Clear information about the sources and review status of learning material.
- A recognizable **water-drop c** and **cruet** visual identity.

### 1.3 Brand personality

| Attribute | Meaning in practice | Avoid |
|---|---|---|
| Calm | Breathing room, predictable layouts, unhurried pacing | Loud graphics, flashing motion |
| Intelligent | Precise, evidence-aware explanations | Jargon without definition |
| Warm | Ivory, espresso, considerate copy | Cold institutional blues |
| Refined | Strong serif wordmark, carefully restrained details | Excessive ornaments, faux luxury |
| Accessible | Legible type, transparent controls, accessible contrast | Tiny study text and low-contrast labels |
| Honest | Specific promises, transparent sources/reviews | “Guaranteed NCLEX pass,” invented authority |
| Encouraging | Helps students make progress without shame | Guilt-based streaks or alarmist countdowns |

### 1.4 Brand language hierarchy

1. **Primary wordmark:** `cueory`.
2. **Primary motto:** `by nursing students, for nursing students.` Use lowercase wherever it appears in branded lockups. A two-line treatment is acceptable:
   
   ```text
   by nursing students,
   for nursing students.
   ```
3. **Optional descriptive tagline:** `nursing study, made clear.`
4. **Optional microcopy:** `know your cues.` as a campaign or educational sign-off, not a replacement for the motto.
5. **Retired on main banner:** `stay cueory` and the typo `stay cuerie`. These are **not** the primary brand motto.

---

## 2. Artwork and source-of-truth governance

### 2.1 Precedence when references disagree

Use the following hierarchy, top to bottom:

1. Explicit, most recent founder-approved logo changes and supplied final artwork.
2. The **cleaned** logo assets in `cueory-cleaned/` listed in §2.2.
3. This specification's confirmed identity, color, and layout requirements.
4. The earlier `Cueory Brand Logo Specification Board.png` **for typography and supporting palette only**, where not superseded by recent files.
5. `Nursing Study Platform — Merged Strategy Proposal.pdf` for broad positioning, product, and content-integrity principles.
6. Older mockups or intermediate AI-generated images are **historical concepts**, not production masters.

**Conflict handling:** Stop and flag a conflict to the brand owner instead of guessing. Do not resolve conflicts by selecting a more attractive image or an approximate font match.

### 2.2 Current cleaned asset registry (exact source filenames)

Source directory in this handoff: `/mnt/data/cueory-cleaned/`.

| Asset file | Canvas | Contents | Background / format | Recommended role |
|---|---:|---|---|---|
| `cueory_name_Light_logo.png` | 2048 × 2048 | Full `cueory` wordmark, drop-ended c, small cruet | Opaque warm ivory | **Primary full logo — light** |
| `cueory_name_dark_logo.png` | 2048 × 2048 | Same layout and symbols | Opaque dark brown | **Primary full logo — dark** |
| `cueory_name_BW_logo.png` | 2048 × 2048 | Full wordmark / cruet in monochrome | Transparent PNG with black/white pixels | Monochrome source; inspect before compositing |
| `cueory_letter_Light_logo.png` | 2048 × 2048 | Water-drop c + cruet | Opaque warm ivory | **Compact emblem — light** |
| `cueory_letter_dark_logo.png` | 2048 × 2048 | Water-drop c + cruet | Opaque dark brown | **Compact emblem — dark** |
| `cueory_letter_logo.png` | 2048 × 2048 | Water-drop c + cruet | Transparent black/white PNG | Monochrome emblem source |
| `cueory_cruet_light_logo.png` | 2048 × 2048 | Cruet only | Opaque warm ivory | Decorative/special-use cruet — light |
| `cueory_cruet_dark_logo.png` | 2048 × 2048 | Cruet only | Opaque dark brown | Decorative/special-use cruet — dark |
| `cueory_cruet_BW_logo.png` | 1254 × 1254 | Cruet only | Transparent black/white PNG | Monochrome cruet source |
| `cueory-waterdrop-wordmark-transparent.png` | 2048 × 2048 | **Actually the c + cruet emblem, not the full wordmark** | Transparent color PNG | Historical filename, use with caution |

The latest assets were previously bundled as `cueory-all-logos-cleaned.zip`. These cleaned files keep the artwork and canvas sizes unchanged. **They are PNGs, not verified or freshly traced SVG geometry.**

**Production housekeeping:** Import the actual files into the repository. A Markdown file that mentions a path does not automatically ship the image. Avoid loading images from a developer's `/mnt/data` path at runtime.

### 2.3 Proposed repository locations

```text
public/
  brand/
    v1/
      logo-full-light.png
      logo-full-dark.png
      logo-full-bw.png
      emblem-light.png
      emblem-dark.png
      emblem-bw.png
      cruet-light.png
      cruet-dark.png
      cruet-bw.png
      README.md
src/
  styles/
    cueory-tokens.css
  components/
    brand/
      CueoryLogo.tsx
      CueoryEmblem.tsx
      CueoryCruet.tsx
      BrandThemeProvider.tsx
```

The filenames above are **proposed deployment aliases**, not claims that those files already exist. Maintain a manifest that maps each alias to its cleaned original and includes checksum, revision, export date, and human approval.

### 2.4 SVG policy

- Prefer genuine SVG **paths** when an authentic, visually verified vector master becomes available.
- Do **not** label an SVG that embeds a raster PNG as a scalable vector master.
- Do **not** automatically trace the logo and deploy the tracing without visual comparison at 100%, 200%, and 400%.
- Do **not** reconstruct the `ueory` letters with live text and assume it matches the supplied raster artwork.
- Keep separate versions for dark, light, transparent, and monochrome.
- Any future path conversion must pass a silhouette overlay/diff against the founder-approved PNG, including the droplet tip, the `y`, cruet spout, loop handle, and liquid line.

---

## 3. Logo anatomy and geometry

### 3.1 Primary wordmark

**Exact reading:** `cueory`.

Appearance:

- Lowercase, sophisticated, high-contrast serif letterforms.
- The **c** is bold and open to the right, with an **integrated water-drop-like upper terminal** and a long lower stroke that ends in a fine taper.
- The **u-e-o-r-y** sequence stays as supplied. Particularly preserve the `e` crossbar, rounded `o`, the `r` shoulder, spacing around `r/y`, and the distinctive curled lower-left terminal of the `y`.
- A small cruet is placed **above the c/u junction area** of the established logo. It is visually separate from the letters.
- No extra outline, surrounding circle, gradient, drop shadow, glow, bevel, or shine.

The current full lockup is defined by the actual image—not a newly typed string.

### 3.2 Water-drop `c`

The water-drop terminal is **part of the letter** rather than an adjacent floating drop.

- Upper-right terminal: thick, rounded, subtly downward-facing and droplet-like.
- Main outside contour: broad, smooth, rising into the upper curve.
- Main inside contour: smooth, open negative space.
- Lower-right terminal: narrow, finely tapered, pointed upward-right.
- The c remains instantly legible as a letter at every approved display size.
- Do not make the tip a detached drop, flatten it into a conventional serif terminal, or reshape it into a crescent moon.

### 3.3 Cruet icon

The small vessel is a deliberate brand signature with a nursing/history/heritage feel, **not** a generic pouring can.

**Keep:**

- A short spout angled toward the left.
- A small rounded loop-like handle at the top/rear.
- A neck and rounded body with minimal contour lines.
- A half-filled vessel: flat, horizontal liquid boundary, darker bottom half.
- A restrained outline, using the main wordmark color.
- Small size and separation from the lettering in the official lockup.

**Do not introduce without a separate approved variant:**

- A round stopper or cap on the cruet.
- Falling drops, fluid streams, splash marks, bubbles, crosses, the gold IHS, or ornamental church motifs.
- Transparent glass reflections, 3D shading, photorealism, or gradients.
- Rotation or movement that makes the source symbol unrecognizable.

### 3.4 Three distinct approved visual families

1. **Full wordmark with cruet:** primary brand identification.
2. **Water-drop c with cruet:** icon/emblem for selected compact contexts.
3. **Cruet alone:** small supporting mark, decorative easter egg, or section motif; never the sole identifier for a new visitor without accessible text.

A **water-drop c without cruet** existed during design exploration. Treat it as a possible future fallback for the smallest favicon sizes, **not an independently approved replacement for the current compact emblem** until reviewed.

### 3.5 Clear space, size, and resizing

**Proposed implementation rules** (require visual approval on final layouts):

- Define `H` as the rendered height of the visible lowercase **c**, excluding transparent canvas padding.
- Leave at least **0.25 × H** of clear space on all sides of the complete symbol, including the cruet. More is preferred for premium editorial layouts.
- Preserve source proportions. Never independently stretch the `c`, cruet, or `ueory`.
- Scale artwork from its **visible bounding box**, not simply from its 2048 × 2048 image canvas.
- The source images contain substantial whitespace, and cruet-only images contain a **very small symbol on a large canvas**. Derive tightly cropped production exports while preserving identical visible geometry, or use `object-position`/a wrapper to control layout.
- Treat **240 px visible width** as a recommended minimum for full logo with recognizable cruet. At smaller sizes test the approved compact emblem or a text label, rather than shrinking the cruet to a blur.
- Test proposed emblems at **24, 32, 48, 64, 96 and 128 CSS pixels**. Avoid assuming the tiny cruet remains recognizable at 16 px.
- Keep the logo crisp: high-density PNG exports or a verified SVG master. Do not enlarge a low-resolution crop with nearest-neighbor interpolation.

### 3.6 Forbidden logo changes

- Change spelling, capitalization, or custom glyph construction.
- Change `ueory` relative spacing to accommodate a new c.
- Replace the c with the old conventional c.
- Move the cruet so it touches the letter or overlaps the `u`.
- Make the cruet a visual focal point larger than the wordmark.
- Rotate/tilt the wordmark or independently stretch individual elements.
- Apply gradients, drop shadows, embossing, outline strokes, photographic textures, metallic gold, or unapproved colors.
- Use an alternative AI-generated version because it looks similar.

---

## 4. Color system

### 4.1 Canonical foundation — latest cleaned logo files

| Token | Human name | HEX | RGB | Main use |
|---|---|---|---|---|
| `--cueory-ivory` | Warm Ivory | **`#F9F5EF`** | 249, 245, 239 | Light canvas, dark-mode logo/letter |
| `--cueory-espresso` | Espresso Brown | **`#3E2C23`** | 62, 44, 35 | Light-mode logo, main light-mode text |
| `--cueory-charcoal` | Charcoal Brown | **`#1C1917`** | 28, 25, 23 | Dark canvas |

These three are the **current authoritative logo colors**. Do not introduce tiny channel variations as new named colors: partially blended edge pixels are normal anti-aliasing.

#### Exact pairings

| Appearance | Canvas | Primary lettering | Cruet outline | Cruet liquid / foreground |
|---|---|---|---|---|
| Light | `#F9F5EF` | `#3E2C23` | `#3E2C23` | `#3E2C23` |
| Dark | `#1C1917` | `#F9F5EF` | `#F9F5EF` | `#F9F5EF` |
| Black/white | Transparent where possible | Black `#000000` or white `#FFFFFF` | Match monochrome treatment | Match monochrome treatment |

*Important:* The cruet's **unfilled top half uses negative space or the background**, not an invented fourth base color. Preserve contrast between its boundary and background.

### 4.2 Supporting warm neutrals — legacy board carried forward as UI recommendations

These are available **supporting interface palette** values from the earlier brand specification board. Their use beyond the three core colors is a **design-system recommendation**, not proof that every supplied new logo uses them.

| Token | Name | HEX | Suggested use |
|---|---|---|---|
| `--cueory-linen` | Linen | `#EADCCF` | Light cards/surfaces |
| `--cueory-taupe` | Taupe | `#D3B7A1` | Decorative soft fills and diagrams |
| `--cueory-mocha` | Mocha | `#8B6F5B` | Nonessential accent only |
| `--cueory-bronze` | Bronze | `#6B5243` | Secondary text on light, muted icons |
| `--cueory-walnut` | Walnut | `#3A2D24` | Dark cards/surfaces |
| `--cueory-sand` | Sand | `#CBB8A4` | Secondary text on dark |

### 4.3 Legacy conflicts explicitly retired

The older logo specification board printed these values:

- Espresso `#3F2E24` **instead of current `#3E2C23`**.
- Dark charcoal `#1B1715` **instead of current `#1C1917`**.
- Evening ivory `#EFE6DA` **instead of current dark-mode lettering `#F9F5EF`**.

These may remain historically useful, but **must not overwrite** the more recent cleaned brand assets. Treat them as **superseded for logo production**.

### 4.4 Contrast verification

The following contrast ratios use standard WCAG relative-luminance calculation, rounded to two decimals:

| Pair | Contrast | Guidance |
|---|---:|---|
| Espresso `#3E2C23` on Ivory `#F9F5EF` | **12.17:1** | Passes WCAG AA/AAA for normal text |
| Ivory `#F9F5EF` on Charcoal `#1C1917` | **16.10:1** | Passes WCAG AA/AAA |
| Bronze `#6B5243` on Ivory `#F9F5EF` | **6.64:1** | Passes AA normal text |
| Mocha `#8B6F5B` on Ivory `#F9F5EF` | **4.28:1** | **Does not pass 4.5:1 for normal text**; use for decorative marks or eligible large text only |
| Sand `#CBB8A4` on Charcoal `#1C1917` | **9.10:1** | Passes AA/AAA |
| Ivory `#F9F5EF` on Walnut `#3A2D24` | **12.23:1** | Passes AA/AAA |

Never rely on color alone to communicate correct/incorrect, ready/held, selected/unselected, or safety-critical meaning. Validate contrast of **the actual component state**, including text on accent fills.

### 4.5 Color and theming behavior

- Default site theme: **Light**, unless a saved user preference exists.
- Offer a visible and accessible dark/light theme toggle.
- First visit can follow `prefers-color-scheme`, if consistent with product policy.
- Use the **same geometry** for light and dark logos. Only colors change.
- Background and font colors should transition gently, but respect reduced-motion settings.
- Keep both modes warm. Never substitute pure black for the dark UI background except in explicitly monochrome export work.
- Do not use gold metallic styling just because the cruet has historical or religious associations.

---

## 5. Typography system

### 5.1 Fixed logo typography

Earlier brand board reference:

- **Family:** Bodoni Moda.
- **Weight:** 500 / Medium.
- **Case:** lowercase only.
- **Tracking:** 0.
- **Kerning:** original artwork's optimized spacing.

**Crucial:** The approved wordmark contains custom/edited shapes. **The original image is the logo.** Typing `cueory` in Bodoni Moda is not automatically pixel-identical and must not be substituted without approval.

### 5.2 Product and marketing UI typography

**Recommended family:** Inter, as listed on the original brand board.

| Use | Suggested weight | Suggested mobile / desktop size | Line height |
|---|---|---|---|
| Hero heading | 500–600 | 36 / 56–64 px | 1.05–1.15 |
| H1 page title | 600 | 30 / 40 px | 1.15–1.2 |
| H2 | 600 | 24 / 32 px | 1.2–1.3 |
| H3 | 600 | 20 / 24 px | 1.3 |
| Body/study explanation | 400–500 | **16–18 px** | **1.5–1.65** |
| UI label | 500–600 | 14–16 px | 1.3–1.45 |
| Caption/metadata | 400–500 | 12–14 px | 1.4–1.5 |
| Buttons | 500–600 | 14–16 px | 1.2 |

These are **recommended design tokens**, not previously locked pixel measurements. Adjust responsively and validate on real mobile screens. Prefer a reasonable base of 16 px, support browser zoom, and avoid all-caps paragraphs.

### 5.3 Typography rules

- Use serif for the logo and select editorial marketing emphasis only.
- Use Inter for explanations, answer options, rationales, navigation, controls, and dense interface text.
- Do not use thin contrast-heavy serif text in small sizes.
- Keep line lengths to approximately 55–75 characters for extended teaching text where possible.
- Avoid center-aligned paragraphs, tight letter spacing, tiny footnotes, and long all-caps labels.
- Preserve math, units, decimals, superscripts, and clinical abbreviations accurately.
- A student's ability to read and understand the lesson outranks ornamentation.

---

## 6. Layout, spacing, shape, and imagery

### 6.1 Visual composition

- Editorial, high-end, quietly confident.
- Wide margins and deliberate whitespace.
- Large, elegant brand presence in marketing. Small, unobtrusive branding during study.
- Simple panels, limited border decoration, restrained rounded corners.
- Soft warm neutrals, strong information hierarchy, few simultaneous visual cues.
- One dominant focal element per section.
- No cluttered backgrounds, repetitive motifs, or decorative animations behind quiz text.

### 6.2 Suggested layout tokens

These measurements are **implementation recommendations**:

| Token | Value | Intended role |
|---|---:|---|
| Spacing scale | 4, 8, 12, 16, 24, 32, 48, 64, 96 px | Consistent layout rhythm |
| Mobile page padding | 16–20 px | Comfortable content margins |
| Desktop page padding | 32–48 px | Editorial whitespace |
| Content maximum width | 1120–1200 px | Marketing and dashboards |
| Reading column maximum | 680–760 px | Lessons and explanations |
| Standard card radius | 12–16 px | Modern, quiet shape language |
| Small control radius | 8–12 px | Controls and inputs |
| Button min touch target | 44 × 44 CSS px | Accessible interaction |
| Grid baseline | 8 px | Component alignment |

### 6.3 Image and illustration style

**Prefer:**

- Minimal vector diagrams with true structure and labels.
- High-quality anatomy imagery with documented licensing.
- Original, clinically appropriate 3D anatomy models/visuals.
- Neutral backgrounds, restrained accents, intentional negative space.
- Close-up clinical detail only when it teaches something real.

**Avoid:**

- Generic clipboard-and-stethoscope graphics.
- Cartoon clinical emergencies and sensational imagery.
- Photorealistic invented patient scenarios presented as authentic cases.
- Busy stock-photo mosaics or watermarked imagery.
- Third-party educational diagrams copied without appropriate rights.
- Gratuitous anatomical visuals on pages where no anatomy is being taught.

The 3D body and the **cue highlight** motif are strategic visual directions from the project proposal. Any third-party model, illustration, or embedded component must have its actual license reviewed before publication.

---

## 7. Product UI patterns

### 7.1 Marketing website vs study workspace

**Marketing** may use expressive brand typography, scroll-driven reveals, elegant image transitions, and carefully framed 3D previews.

**Study pages** must be quieter: one lesson objective, one actionable step, one clear primary control, easy navigation, and no visual distractions near assessments.

### 7.2 Core components

| Component | Cueory treatment | Must preserve |
|---|---|---|
| Top navigation | Compact wordmark, few high-priority links | Keyboard focus and responsive layout |
| Hero | Clear promise, spacious serif brand presence, short supporting copy | One primary CTA |
| Lesson card | Ivory/linen or charcoal/walnut panel, short heading, concise summary | Readability and click target |
| Flashcard | One concept at a time, explicit flip/reveal | Do not treat flipping as mastery |
| Practice question | Clear stem, equally readable options, rationale for every answer | Clinical precision and accessibility |
| Progress feedback | Calm, specific text and neutral status icons | No invented pass probability |
| Timer/break | Optional, subdued, off by default | No guilt-based streaks |
| Modal/preview | Smooth zoom or fade, minimal surrounding chrome | Escape key, focus management, reduced motion |
| Source/review label | Plain small text placed near educational content | Accurate provenance and status |

### 7.3 Motion language

Cueory motion should feel like a **premium editorial interface**, not a game.

**Suggested implementation:**

- Hover scale: approximately 1.015–1.04, depending on card size.
- Hover duration: 160–240 ms.
- Standard transitions: 180–280 ms, ease-out.
- Preview/zoom modal: 220–360 ms, only when functionally useful.
- Page reveals: subtle opacity + short translation, no dramatic parallax.
- Strong focus indicators on all keyboard-interactive elements.
- Fully respect `prefers-reduced-motion: reduce`; remove nonessential transformations and animations.

Do not animate clinical diagrams in ways that could imply incorrect physiology. Any timed quiz interaction must remain usable with animations disabled.

---

## 8. Hidden details, easter eggs, and interactive brand motifs

Easter eggs are intentional but **secondary**. They should never obstruct learning, conceal critical information, or become required for navigation.

### 8.1 Approved motif vocabulary

- The water-drop-shaped **c** terminal.
- The small **half-filled cruet**.
- A fluid-level horizontal line.
- The cue highlight: one meaningful word or clinical finding illuminated as the lesson progresses.
- A quiet visual reveal on hover/click, where it clarifies a concept rather than distracts.

### 8.2 Recommended easter egg concepts — proposals, not launched features

1. A small cruet icon that gently rotates a few degrees on deliberate hover or click, then settles. No liquid or pouring effect unless separately approved.
2. A subtle water-drop reveal at the end of a completed fluid-balance explanation (not a scoring reward).
3. A hidden historical nursing note, accessible through a labeled icon and non-hover alternative.
4. The `c` emblem as a tasteful loading transition that works without motion.
5. A brief `know your cues.` detail beneath a mastered concept, subject to actual mastery evidence rules.

**Technical requirements:** keyboard activation, labels for screen readers, no hover-only discovery for required functions, opt-out for motion, no sound by default, no flashing, and no interference with clinical content.

---

## 9. Voice, messaging, and content tone

### 9.1 Writing characteristics

- Friendly but academically accurate.
- Short sentences, active verbs, one idea at a time.
- Define new medical terms before using them heavily.
- Concrete examples rather than motivational filler.
- Calm and practical when a student struggles.
- Specific about what a study tool can and cannot prove.
- Inclusive of nursing students regardless of background, religion, program type, or stage.

### 9.2 Copy examples

| Context | On-brand | Off-brand |
|---|---|---|
| Hero | “Make med-surg make sense.” | “The world's most revolutionary nursing AI!” |
| Lesson start | “Start with what sodium does.” | “Master complex electrolyte homeostasis immediately.” |
| Progress | “You answered 4 of 5 correctly. Review this one concept.” | “You're 92% ready for the NCLEX.” |
| Encouragement | “You can review this again tomorrow.” | “Don't break your streak.” |
| Sources | “Source-checked against [named reference].” | “100% nurse-approved.” |
| Motto | “by nursing students, for nursing students.” | “Stay Cuerie.” |

The phrasing in the on-brand column is sample copy, **not an evidence claim that features or review steps already exist**.

### 9.3 Brand claims

- A study **resource**, not a clinical provider or accredited nursing school.
- No unsupported guarantee of exam success or claims of similarity to an official NCLEX examination engine.
- Clearly separate `AI-assisted`, `Source-checked`, and `Clinician-reviewed` (only where accurate and scoped).
- No title of “nurse educator” or “RN-reviewed” without a qualified person having performed that review.
- No fake testimonials, fabricated learner outcomes, or undisclosed sponsors.
- Educational materials need a correction/report mechanism and a rights record.

---

## 10. Social, video, presentations, print, and merchandise

### 10.1 Social identity

- Maintain the same wordmark, colors, and proportion rules across YouTube, Instagram, TikTok, and future platform profiles.
- Use the compact emblem only where a full wordmark would be unreadable.
- Create separate light and dark templates, not arbitrary color-swapped screenshots.
- Keep text within each platform's safe areas; do **not** assume one square profile image or one banner crop works universally.
- Place the motto beneath the full wordmark when there is enough room and legibility.

### 10.2 Video structure

Three recurring short-form educational series from the strategy proposal:

1. **Make it make sense:** one difficult nursing concept, explained simply.
2. **Spot the cue:** one reviewed practice question and its rationale.
3. **Already made:** demonstrate an actual lesson, card, organizer, or body visual.

Presentation rules:

- Original or properly licensed visuals only.
- Consistent voice and readable captions.
- Clear source and review disclosures when relevant.
- AI-generated audio/video disclosures where platform rules require them.
- Unique educational content rather than repetitive near-identical videos.
- No publication without the authorized human approval process.

### 10.3 Merchandise

- Small, restrained logo placement preferred over giant chest graphics.
- Monochrome, ivory, espresso, and neutral fabric options first.
- Suggested short lines: `know your cues.`, `nurses notice.`, `assess before you act.` — **ideas pending separate approval**.
- Do not launch trademarked merchandise or claim name exclusivity before clearance work is complete.

### 10.4 Print exports

- Use reviewed high-resolution exports or verified vector paths.
- Test true black/white as well as dark brown on warm ivory.
- Define CMYK values through an actual print proof/vendor profile; **do not invent CMYK equivalents** from HEX.
- Leave appropriate bleed and safe area as specified by the printer.
- Avoid microscopic cruet detail that collapses in embroidery, engraving, or one-color screen printing.

---

## 11. Accessibility and quality rules

Design against **WCAG 2.2 AA** where practical, and test the actual application instead of relying only on color ratios.

**Required checks:**

- Text contrast at least 4.5:1 for normal text, at least 3:1 where the WCAG large-text exception applies.
- Visible keyboard focus, logical focus order, Escape to close dialogs.
- Pointer target sizing and spacing suitable for touch; 44 × 44 px is the project design target.
- A reduced-motion mode with nonessential animation removed.
- All educational meaning available in text, not solely color, position, sound, hover, or motion.
- Zoom to 200% and reflow to small viewports without clipped content.
- Accessible labels for compact icon buttons and decorative icon hiding where appropriate.
- Captions/transcripts for instructional audio/video.
- No distracting blinking, excessive parallax, or autoplay voice.

**Suggested descriptive alt text:**

- Full wordmark: `Cueory — nursing study platform` (do not redundantly repeat nearby text if decorative).
- Compact emblem: `Cueory` if it functions as a home link.
- Standalone decorative cruet: empty alt text or `aria-hidden="true"`.

---

## 12. Developer-ready token starter

These tokens encode the **current three core brand colors** and the **recommended supporting UI palette**. Component shapes, spacing, animation, and typography measurements may change after visual review. Keep logo artwork separate from UI typography.

```css
:root {
  /* Verified current logo colors */
  --cueory-ivory: #F9F5EF;
  --cueory-espresso: #3E2C23;
  --cueory-charcoal: #1C1917;

  /* Supporting palette from the original brand board */
  --cueory-linen: #EADCCF;
  --cueory-taupe: #D3B7A1;
  --cueory-mocha: #8B6F5B;
  --cueory-bronze: #6B5243;
  --cueory-walnut: #3A2D24;
  --cueory-sand: #CBB8A4;

  /* Light interface */
  --color-page: var(--cueory-ivory);
  --color-surface: var(--cueory-linen);
  --color-text: var(--cueory-espresso);
  --color-text-secondary: var(--cueory-bronze);
  --color-logo: var(--cueory-espresso);
  --color-border: #D3B7A1;

  /* Proposed UI tokens */
  --font-ui: "Inter", system-ui, sans-serif;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --radius-control: 10px;
  --radius-card: 14px;
  --content-reading-max: 720px;
  --content-page-max: 1200px;
  --motion-fast: 180ms;
  --motion-standard: 240ms;
}

[data-theme="dark"] {
  color-scheme: dark;
  --color-page: var(--cueory-charcoal);
  --color-surface: var(--cueory-walnut);
  --color-text: var(--cueory-ivory);
  --color-text-secondary: var(--cueory-sand);
  --color-logo: var(--cueory-ivory);
  --color-border: var(--cueory-bronze);
}

html {
  font-family: var(--font-ui);
  background: var(--color-page);
  color: var(--color-text);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-standard: 0ms;
  }
}
```

**Engineering notes:**

1. Use the correct light/dark **image asset** for the logo. Changing a CSS `color` declaration does not recolor an opaque PNG.
2. The supplied 2048 × 2048 source logos include large blank margins. Do not use those dimensions as a reason to render tiny letterforms.
3. Build purpose-made display exports with non-destructive cropping and appropriate internal padding, then **verify against the source images**.
4. Keep original uncropped files in a versioned source-assets directory.
5. A theme switch may change the asset source, background, UI text, and surfaces, but **never** the wordmark geometry.
6. Preload only the logo actually displayed initially; lazy-load secondary branding assets.
7. Supply width and height attributes or aspect-ratio containers to avoid cumulative layout shift.
8. Use lossless PNG for reference/approval. Test optimized WebP/AVIF only after visual comparison, especially around thin cruet strokes.
9. When producing a true SVG, confirm paths, current color mapping, aria/alt behavior, and an accurate viewBox.
10. Check the brand at 100% and at small mobile display sizes before merge.

### 12.1 Example content/component naming

```text
CueoryLogo             -> Full approved wordmark + cruet
CueoryEmblem           -> Approved drop-c + cruet
CueoryCruet            -> Cruet only, supporting element
CueoryTheme            -> Light / dark image selection + tokens
CueorySourceLabel      -> Accuracy/review provenance text
CueoryStudyCard        -> Reusable quiet learning panel
CueoryEasterEgg        -> Optional accessible microinteraction
```

These are proposed component names, not claims about an existing repository implementation.

---

## 13. Required brand quality assurance before publishing

### 13.1 Logo approval checklist

- [ ] Correct spelling: `cueory`.
- [ ] Existing original `ueory` glyphs remain identical.
- [ ] Approved c retains its integrated drop-shaped upper terminal and fine lower taper.
- [ ] Cruet still has its correct spout, loop handle, rounded half-full vessel and straight liquid boundary.
- [ ] Cruet size and placement match the source image and remain separate from the letters.
- [ ] Correct light or dark canonical colors.
- [ ] No stray halos, random color pixels, aliasing artifacts or non-brand outlines.
- [ ] No distortion, stretching, additional shadows, gradients or unauthorized ornaments.
- [ ] Sufficient visible clear space around **artwork**, not merely a padded source canvas.
- [ ] Output is crisp on small and high-DPI screens.
- [ ] Any SVG claiming to be vector actually contains paths.
- [ ] Final comparison against the approved cleaned PNG at overlay and close-up scale.

### 13.2 Website/screen approval checklist

- [ ] Uses correct palette tokens in both modes.
- [ ] Main study text meets contrast and type-size requirements.
- [ ] Visual hierarchy is clear at first glance.
- [ ] Responsive at 320 px mobile through desktop.
- [ ] Keyboard, touch, screen-reader and reduced-motion behavior checked.
- [ ] No fake review labels or unsupported outcomes claims.
- [ ] Easter eggs remain optional, accessible and nonintrusive.
- [ ] Marketing messaging matches the actual features currently shipped.
- [ ] Founder/authorized human has approved release.

### 13.3 Asset metadata to maintain

Every final delivered asset should have a record containing:

```yaml
brand: cueory
brand_system_version: 1.0
asset_id: cueory-logo-full-light
source_file: cueory_name_Light_logo.png
source_variant: light
status: founder-approved-source
format: png
canvas_px: [2048, 2048]
background_hex: '#F9F5EF'
foreground_hex: '#3E2C23'
geometry_locked: true
vector_master_verified: false
approved_by: brand_owner
approved_at: to_be_recorded
sha256: calculate_from_actual_repository_file
```

Do **not** fabricate dates, approvals, file hashes, or a vector-master status. Generate hashes directly from bytes after the actual files are checked into the repository.

---

## 14. Open decisions and cautions

| Topic | Current situation | Recommended next step |
|---|---|---|
| Trademark / handles | The strategic proposal treated Cueory name clearance as pending; no result is established here | Complete actual trademark, domain and social-handle checks before costly merchandise or formal claims |
| Authentic SVG masters | Cleaned current PNG artwork exists; prior SVG experiments are **not** proven identical to all final PNGs | Create and visually approve path-based SVG masters, with light/dark and monochrome variants |
| Small favicon | Cruet may disappear at tiny sizes | Approve a c-only micro icon or a verified simplified emblem after size testing |
| Exact visual clear space | New lockup has not been supplied as a geometric design file with measured baselines | Calibrate the recommended `0.25H` rule on a vector master |
| Body and heading sizes | Recommended but not yet independently signed off | Test on real study lessons and phones |
| Supporting neutrals | Colors come from older brand board | Accept as UI palette after checking component-level contrast |
| Religious/historical symbolism | Cruet is visual branding; avoid treating it as a claim of institutional religious endorsement | Keep symbolic use tasteful, optional and accurate |
| Illustration/model rights | Any anatomy model needs its own license verification | Keep a source-and-license record per asset |
| Clinical education claims | Review workflows differ by item type and risk | Make public labels reflect what actually occurred |

### 14.1 Why the older brand board is not enough by itself

The older board correctly captures the intended **quiet editorial look**, reference typography and supporting colors. However, it predates the latest changes to the **water-drop c** and the **half-filled cruet**. It also lists slightly different primary logo color values. For those reasons it is an **influence and supporting reference**, not the canonical current logo geometry or production color specification.

### 14.2 Practical next milestone for the brand team

1. Archive the 10 cleaned source PNGs and their exact hashes.
2. Confirm this document as the current source for coding agents.
3. Create **one verified, path-based SVG** for the final full wordmark, compact emblem, and cruet, in each required palette, without changing shapes.
4. Publish a logo-safe-area sheet using real vector bounds and favicon tests.
5. Implement a minimal tokenized light/dark component demo.
6. Check all outputs against the originals before the website goes public.

---

## 15. Agent handoff directive (copy into design/development tasks)

> **CUEORY BRAND SYSTEM v1.0 — IMPLEMENTATION RULE**  
> Use `CUEORY_BRAND_SPECIFICATION_v1.0.md` and the most recent cleaned Cueory images as your source of truth. The official logo is the original lowercase `cueory` wordmark with the integrated water-drop c and a small half-filled cruet hovering above the c/u area. Preserve the original `ueory` letter shapes and all spacing. Light palette: ivory background `#F9F5EF`, espresso mark `#3E2C23`. Dark palette: charcoal-brown background `#1C1917`, ivory mark `#F9F5EF`. Use supporting colors and Inter for UI, but never replace the approved logo artwork with generated font text. Maintain accessible contrast, refined editorial layout and simple, calm interactions. Keep clinical claims and review labels factual. Do not introduce new ornaments or alter the cruet/drop geometry without explicit human approval. If an artifact or requirement conflicts with this spec, flag the conflict and hold instead of guessing.

---

## 16. Change log

| Version | Date | Summary |
|---|---|---|
| 1.0 | October 31, 2026 | Consolidated the new drop-c and cruet logo family, exact cleaned-image colors, user-approved motto, earlier supporting palette and font references, web UI design rules, easter-egg guardrails, developer tokens, and approval controls. |

**End of specification.**
