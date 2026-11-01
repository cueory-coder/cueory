/**
 * Pure helpers for the review-clip exporter (Task C7, D-81). No ffmpeg, no browser, no filesystem.
 * Import and test these in isolation; the main script (export-clips.ts) uses them for all decisions.
 */

import { join } from 'node:path';
import { parseArgs } from 'node:util';

export class ClipError extends Error {}

/** Output frame size: portrait, matching the device mockup. */
export const FRAME_WIDTH = 1080;
export const FRAME_HEIGHT = 1920;

export const JPEG_QUALITY = 92;
export const FPS = 30;
/** Crossfade duration between steps in seconds (the concat xfade filter). */
export const CROSSFADE_DURATION_S = 0.6;

// ── Y-band table ──────────────────────────────────────────────────────────────
// Each step's frame reveals only the band of the drawing that belongs to it, so
// the viewer's eye doesn't jump around. The bands divide the frame height evenly;
// the last band absorbs any remainder pixel.

export interface Band {
  /** Top of the visible portion of the drawing, in pixels from the drawing's top. */
  y: number;
  /** Height of the visible portion in pixels. */
  height: number;
}

/**
 * Computes one y-band per step so that together they cover exactly `drawingHeight` pixels
 * (defaults to FRAME_HEIGHT) with no gaps and no overlap. Returns an empty array for 0 steps.
 * Pass the actual rendered SVG height when it differs from FRAME_HEIGHT (e.g. an SVG with
 * a max-width constraint renders shorter than the full frame).
 */
export function bands(stepCount: number, drawingHeight: number = FRAME_HEIGHT): Band[] {
  if (stepCount < 1) return [];
  const base = Math.floor(drawingHeight / stepCount);
  return Array.from({ length: stepCount }, (_, i) => ({
    y: i * base,
    height: i < stepCount - 1 ? base : drawingHeight - i * base,
  }));
}

// ── Per-drawing step bands ────────────────────────────────────────────────────
// Each drawing's SVG has natural sections that align to its steps. These bands
// (in viewBox units) locate each step's visible area so the clip shows the part
// the caption describes, rather than an equal slice of the full SVG height.
//
// viewBox heights: fluid-compartments 790, osmosis-fluid-shifts 900,
// sodium-potassium-pump 560 (matching the HEIGHT constant in each drawing file).

const DRAWING_STEP_BANDS_SVG: Record<
  string,
  ReadonlyArray<{ readonly y: number; readonly height: number }>
> = {
  'fluid-compartments': [
    { y: 0,   height: 165 }, // step 1: ICF/ECF bar with labels (viewBox 0–165 of 790)
    { y: 163, height: 207 }, // step 2: ICF cell box (163–370 of 790)
    { y: 368, height:  87 }, // step 3: ECF box header (368–455 of 790)
    { y: 430, height: 360 }, // step 4: ECF types — intravascular, interstitial, transcellular (430–790)
  ],
  'osmosis-fluid-shifts': [
    { y: 0,   height: 308 }, // step 1: osmosis membrane section (0–308 of 900)
    { y: 306, height: 237 }, // step 2: capillary section (306–543 of 900)
    { y: 541, height: 359 }, // step 3: compartments section (541–900 of 900)
  ],
  'sodium-potassium-pump': [
    { y:  8, height: 460 }, // step 1: two-sides overview — ECF, membrane, ICF, key (8–468 of 560)
    { y:  0, height: 548 }, // step 2: pump + transport — starts at 0 to include "active transport" heading (0–548 of 560)
  ],
};

const DRAWING_VIEWBOX_HEIGHT: Record<string, number> = {
  'fluid-compartments':   790,
  'osmosis-fluid-shifts': 900,
  'sodium-potassium-pump': 560,
};

/**
 * Returns one Band per step for `drawingId`, scaled to pixel space using `drawingHeight`.
 * When the drawing is listed in DRAWING_STEP_BANDS_SVG and stepCount matches, the bands
 * follow the drawing's natural section boundaries rather than equal-height divisions.
 * Falls back to bands() for unknown drawings or a mismatched step count.
 */
export function drawingBands(drawingId: string, stepCount: number, drawingHeight: number = FRAME_HEIGHT): Band[] {
  const svgBands = DRAWING_STEP_BANDS_SVG[drawingId];
  const vbHeight = DRAWING_VIEWBOX_HEIGHT[drawingId];
  if (svgBands && vbHeight && svgBands.length === stepCount) {
    const scale = drawingHeight / vbHeight;
    return svgBands.map(({ y, height }) => ({
      y: Math.round(y * scale),
      height: Math.max(1, Math.round(height * scale)),
    }));
  }
  return bands(stepCount, drawingHeight);
}

// ── Frame and clip naming ─────────────────────────────────────────────────────

/**
 * JPEG file name for one step frame. Step indices are zero-based; the name shows 1-based numbers
 * with enough zero-padding so alphabetic and numeric sort agree.
 */
export function frameFileName(drawingId: string, stepIndex: number, totalSteps: number): string {
  const width = String(totalSteps).length;
  const n = String(stepIndex + 1).padStart(width, '0');
  return `${drawingId}-step-${n}.jpg`;
}

/** MP4 file name for one drawing's finished clip. */
export function clipFileName(drawingId: string): string {
  return `${drawingId}.mp4`;
}

// ── Frame spec ────────────────────────────────────────────────────────────────

export interface FrameSpec {
  drawingId: string;
  stepIndex: number;
  totalSteps: number;
  /** File name under the output directory (no path components). */
  fileName: string;
  /** The portion of the drawing visible in this frame. */
  band: Band;
}

/**
 * Returns one FrameSpec per step for a drawing, in order. Pass this list to the
 * playwright loop and the ffmpeg concat to keep the two in sync.
 * `drawingHeight` should be the actual rendered SVG height measured from the browser;
 * it defaults to FRAME_HEIGHT when not yet known.
 */
export function frameList(drawingId: string, stepCount: number, drawingHeight: number = FRAME_HEIGHT): FrameSpec[] {
  const bs = drawingBands(drawingId, stepCount, drawingHeight);
  return bs.map((band, i) => ({
    drawingId,
    stepIndex: i,
    totalSteps: stepCount,
    fileName: frameFileName(drawingId, i, stepCount),
    band,
  }));
}

// ── CLI argument parsing ──────────────────────────────────────────────────────

export interface ClipOptions {
  /** Root directory to write frames and clips into. */
  out: string;
  /** When true, skip the ffmpeg step and keep the per-step JPEG frames. */
  framesOnly: boolean;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface FrameHtmlOptions {
  svgMarkup: string;
  title: string;
  caption: string;
  stepLabel: string;
  creditLines: string[];
  isDraft: boolean;
  builtCss: string;
  bandY: number;
  bandHeight: number;
  /** Actual rendered SVG height in pixels, as measured by measureDrawingHeight. */
  drawingHeight: number;
}

/**
 * Renders the HTML for one step frame. Colors use brand tokens from tokens.css
 * (D-55): Ivory page background, Espresso primary text, Bronze secondary text,
 * Mocha draft-badge background.
 */
export function frameHtml(opts: FrameHtmlOptions): string {
  const { svgMarkup, title, caption, stepLabel, creditLines, isDraft, builtCss, bandY, bandHeight, drawingHeight } = opts;
  const draftBadge = isDraft ? `<div class="draft-badge">draft for review</div>` : '';
  const creditsHtml = creditLines.map((line) => `<p class="credit">${escHtml(line)}</p>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${FRAME_WIDTH}, height=${FRAME_HEIGHT}">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; overflow: hidden; background: #f9f5ef; }
${builtCss}
.frame { display: flex; flex-direction: column; width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; font-family: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif; padding: 48px 40px 40px; gap: 24px; position: relative; }
.frame-title { font-size: 36px; font-weight: 700; line-height: 1.2; color: #3e2c23; }
.drawing-clip { flex: none; overflow: hidden; position: relative; }
.drawing-inner { position: absolute; left: 0; top: -${bandY}px; width: 100%; height: ${drawingHeight}px; }
.drawing-inner svg { width: 100%; height: 100%; }
.caption { font-size: 28px; color: #3e2c23; line-height: 1.4; }
.step-label { font-size: 22px; color: #6b5243; }
.credits { font-size: 18px; color: #6b5243; }
.credit { line-height: 1.3; }
.draft-badge { position: absolute; top: 16px; right: 24px; background: #8b6f5b; color: #f9f5ef; font-size: 20px; font-weight: 700; padding: 8px 18px; border-radius: 8px; letter-spacing: 0.05em; text-transform: uppercase; }
</style>
</head>
<body>
<div class="frame">
  ${draftBadge}
  <div class="frame-title">${escHtml(title)}</div>
  <div class="drawing-clip" style="height:${bandHeight}px">
    <div class="drawing-inner">${svgMarkup}</div>
  </div>
  <div class="caption">${escHtml(caption)}</div>
  <div class="step-label">${escHtml(stepLabel)}</div>
  <div class="credits">${creditsHtml}</div>
</div>
</body>
</html>`;
}

// ── Font URL rewriting ────────────────────────────────────────────────────────

/**
 * Rewrites root-relative font URLs in built CSS so they resolve when loaded as
 * a `file://` page. Chromium cannot fetch `/_astro/Inter-*.woff2` from a local
 * file, so we replace those references with absolute `file://` paths.
 *
 * Example: `url(/_astro/Inter-Bold.woff2)` → `url("file:///abs/path/dist/_astro/Inter-Bold.woff2")`
 *
 * The url() value is wrapped in CSS double-quotes so any character valid in a
 * filesystem path — spaces, parentheses, apostrophes — is also valid inside the
 * string. Only `"` itself needs percent-encoding to prevent premature string
 * termination; all other characters are safe inside a CSS double-quoted string and
 * are valid in file: URLs (RFC 3986 sub-delimiters include `'`, `(`, `)`;
 * spaces become %20 so the URL is well-formed).
 */
export function rewriteFontUrls(css: string, astroDir: string): string {
  const safeDir = astroDir.replace(/ /g, '%20').replace(/"/g, '%22');
  return css.replace(/url\(\/_astro\/([^)]*)\)/g, (_, filename) =>
    `url("file://${safeDir}/${filename}")`
  );
}

// ── ffmpeg concat list ────────────────────────────────────────────────────────

function escapeSingleQuotes(p: string): string {
  return p.replace(/'/g, "'\\''");
}

/**
 * Builds the text content of an ffmpeg concat demuxer input file. Single quotes
 * inside file paths are escaped so that paths with apostrophes do not break the
 * concat syntax.
 */
export function buildFfmpegInput(frames: { fileName: string }[], outDir: string): string {
  const durationPerFrame = 2.0;
  return (
    frames
      .map((f) => `file '${escapeSingleQuotes(join(outDir, f.fileName))}'\nduration ${durationPerFrame}`)
      .join('\n') + `\nfile '${escapeSingleQuotes(join(outDir, frames.at(-1)!.fileName))}'`
  );
}

// ── CLI argument parsing ──────────────────────────────────────────────────────

export function parseArguments(args: readonly string[]): ClipOptions {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: false,
      strict: true,
      options: {
        out: { type: 'string' },
        'frames-only': { type: 'boolean', default: false },
      },
    });
  } catch {
    throw new ClipError('Use --out <folder> [--frames-only].');
  }
  const out = parsed.values.out;
  if (typeof out !== 'string' || !out.trim()) {
    throw new ClipError('--out <folder> is required.');
  }
  return { out: out.trim(), framesOnly: Boolean(parsed.values['frames-only']) };
}
