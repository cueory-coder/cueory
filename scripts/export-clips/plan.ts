/**
 * Pure helpers for the review-clip exporter (Task C7, D-81). No ffmpeg, no browser, no filesystem.
 * Import and test these in isolation; the main script (export-clips.ts) uses them for all decisions.
 */

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
 * Computes one y-band per step so that together they cover exactly FRAME_HEIGHT pixels
 * with no gaps and no overlap. Returns an empty array for 0 steps.
 */
export function bands(stepCount: number): Band[] {
  if (stepCount < 1) return [];
  const base = Math.floor(FRAME_HEIGHT / stepCount);
  return Array.from({ length: stepCount }, (_, i) => ({
    y: i * base,
    height: i < stepCount - 1 ? base : FRAME_HEIGHT - i * base,
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
 */
export function frameList(drawingId: string, stepCount: number): FrameSpec[] {
  const bs = bands(stepCount);
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
