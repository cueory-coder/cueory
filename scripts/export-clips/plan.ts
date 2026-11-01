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
  const bs = bands(stepCount, drawingHeight);
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
.drawing-clip { flex: 1; overflow: hidden; position: relative; }
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
 * Example: `url(/_astro/Inter-Bold.woff2)` → `url(file:///abs/path/dist/_astro/Inter-Bold.woff2)`
 */
export function rewriteFontUrls(css: string, astroDir: string): string {
  return css.replace(/url\(\/_astro\//g, `url(file://${astroDir}/`);
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
