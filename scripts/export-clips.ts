/**
 * Review-clip exporter for teaching diagrams (Task C7, D-81).
 *
 * Usage (run `npm run build` first so the built CSS is in dist/):
 *
 *   node scripts/export-clips.ts --out <folder>
 *   node scripts/export-clips.ts --out <folder> --frames-only
 *
 * For each drawing in src/visuals/drawings/index.ts this script:
 *   1. Renders every step as a 1080×1920 JPEG frame (Playwright, quality 92).
 *   2. Joins the frames into one MP4 per drawing with a 0.6s xfade crossfade
 *      between steps (ffmpeg concat demuxer, -c copy, 30 fps).
 *
 * --frames-only skips step 2 so you can inspect frames before encoding.
 * Clips are for Christian's internal review — never post them anywhere.
 */
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { drawings } from '../src/visuals/drawings/index.ts';
import { playerSteps } from '../src/visuals/drawing.ts';
import { creditsFor, type Visual } from '../src/visuals/sources.ts';
import {
  type ClipOptions,
  ClipError,
  clipFileName,
  frameList,
  CROSSFADE_DURATION_S,
  FPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  JPEG_QUALITY,
  parseArguments,
} from './export-clips/plan.ts';

// ── Content loading ───────────────────────────────────────────────────────────

async function loadVisual(id: string, root: string): Promise<Visual> {
  const path = join(root, 'content', 'visuals', `${id}.json`);
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as Visual;
}

async function findBuiltCss(root: string): Promise<string> {
  const astroDir = join(root, 'dist', '_astro');
  if (!existsSync(astroDir)) {
    throw new ClipError(
      `dist/_astro not found. Run "npm run build" first so the built CSS is available.`,
    );
  }
  // Pick the first CSS file (the site builds a single bundle for the island pages).
  const { readdirSync } = await import('node:fs');
  const cssFiles = readdirSync(astroDir).filter((f) => f.endsWith('.css'));
  if (!cssFiles.length) throw new ClipError('No .css file found in dist/_astro/.');
  return await readFile(join(astroDir, cssFiles[0]!), 'utf-8');
}

// ── Frame HTML ────────────────────────────────────────────────────────────────

function frameHtml(opts: {
  svgMarkup: string;
  title: string;
  caption: string;
  stepLabel: string;
  creditLines: string[];
  isDraft: boolean;
  builtCss: string;
  bandY: number;
  bandHeight: number;
}): string {
  const { svgMarkup, title, caption, stepLabel, creditLines, isDraft, builtCss, bandY, bandHeight } = opts;
  const draftBadge = isDraft
    ? `<div class="draft-badge">draft for review</div>`
    : '';
  const creditsHtml = creditLines
    .map((line) => `<p class="credit">${escHtml(line)}</p>`)
    .join('');
  // The drawing is clipped to show only the current step's y-band.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${FRAME_WIDTH}, height=${FRAME_HEIGHT}">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; overflow: hidden; background: #fff; }
${builtCss}
.frame { display: flex; flex-direction: column; width: ${FRAME_WIDTH}px; height: ${FRAME_HEIGHT}px; font-family: system-ui, sans-serif; padding: 48px 40px 40px; gap: 24px; position: relative; }
.frame-title { font-size: 36px; font-weight: 700; line-height: 1.2; color: #111; }
.drawing-clip { flex: 1; overflow: hidden; position: relative; }
.drawing-inner { position: absolute; left: 0; top: -${bandY}px; width: 100%; height: ${FRAME_HEIGHT}px; }
.drawing-inner svg { width: 100%; height: 100%; }
.caption { font-size: 28px; color: #222; line-height: 1.4; }
.step-label { font-size: 22px; color: #666; }
.credits { font-size: 18px; color: #888; }
.credit { line-height: 1.3; }
.draft-badge { position: absolute; top: 16px; right: 24px; background: #f59e0b; color: #fff; font-size: 20px; font-weight: 700; padding: 8px 18px; border-radius: 8px; letter-spacing: 0.05em; text-transform: uppercase; }
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

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── ffmpeg ────────────────────────────────────────────────────────────────────

function buildFfmpegInput(frames: { fileName: string }[], outDir: string): string {
  // ffmpeg concat demuxer input file: one duration-less entry per frame, with xfade transition durations.
  const durationPerFrame = 2.0; // seconds each frame is visible before the xfade starts
  return frames
    .map((f) => `file '${join(outDir, f.fileName)}'\nduration ${durationPerFrame}`)
    .join('\n') + `\nfile '${join(outDir, frames.at(-1)!.fileName)}'`;
}

function runFfmpeg(
  drawingId: string,
  frames: { fileName: string }[],
  framesDir: string,
  clipOut: string,
): void {
  if (frames.length < 2) {
    // Single-step drawing: just re-encode the one frame with no transition.
    const result = spawnSync(
      'ffmpeg',
      ['-y', '-loop', '1', '-i', join(framesDir, frames[0]!.fileName), '-t', '2', '-r', String(FPS), clipOut],
      { stdio: 'pipe' },
    );
    if (result.status !== 0) {
      throw new ClipError(
        `ffmpeg failed for ${drawingId}: ${result.stderr?.toString() ?? '(no output)'}`,
      );
    }
    return;
  }

  // Build a filter_complex with xfade for N steps.
  // For N inputs and N-1 xfades: each segment is 2 s; xfade starts 0.6s before end.
  const holdSec = 2.0;
  const xfadeSec = CROSSFADE_DURATION_S;
  const inputs: string[] = frames.flatMap((f) => ['-loop', '1', '-t', String(holdSec + xfadeSec), '-i', join(framesDir, f.fileName)]);
  const filterParts: string[] = [];
  let prev = '[0:v]';
  for (let i = 1; i < frames.length; i++) {
    const next = `[${i}:v]`;
    const out = i < frames.length - 1 ? `[v${i}]` : '[vout]';
    const offset = (holdSec) * i - xfadeSec * (i - 1);
    filterParts.push(`${prev}${next}xfade=transition=fade:duration=${xfadeSec}:offset=${offset.toFixed(3)}${out}`);
    prev = `[v${i}]`;
  }
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      ...inputs,
      '-filter_complex', filterParts.join('; '),
      '-map', '[vout]',
      '-r', String(FPS),
      '-pix_fmt', 'yuv420p',
      clipOut,
    ],
    { stdio: 'pipe' },
  );
  if (result.status !== 0) {
    throw new ClipError(
      `ffmpeg failed for ${drawingId}: ${result.stderr?.toString() ?? '(no output)'}`,
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(args = process.argv.slice(2)): Promise<number> {
  let options: ClipOptions;
  try {
    options = parseArguments(args);
  } catch (e) {
    process.stderr.write(`${e instanceof ClipError ? e.message : String(e)}\n`);
    return 2;
  }

  const root = resolve(process.cwd());
  await mkdir(options.out, { recursive: true });
  const outDir = await realpath(resolve(options.out));

  let builtCss: string;
  try {
    builtCss = await findBuiltCss(root);
  } catch (e) {
    process.stderr.write(`${e instanceof ClipError ? e.message : String(e)}\n`);
    return 2;
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    for (const [drawingId, drawing] of Object.entries(drawings)) {
      let visual: Visual;
      try {
        visual = await loadVisual(drawingId, root);
      } catch {
        process.stderr.write(`Skipping ${drawingId}: could not load content/visuals/${drawingId}.json\n`);
        continue;
      }

      const steps = playerSteps(visual, drawing.steps);
      const credits = creditsFor(visual).map((b) => b.credit);
      const isDraft = visual.status !== 'approved';
      const frames = frameList(drawingId, steps.length);

      const drawingOutDir = join(outDir, drawingId);
      await mkdir(drawingOutDir, { recursive: true });

      const page = await browser.newPage();
      await page.setViewportSize({ width: FRAME_WIDTH, height: FRAME_HEIGHT });

      for (const spec of frames) {
        const step = steps[spec.stepIndex]!;
        // Render the drawing showing all steps up to and including this one (progressive reveal).
        const svgMarkup = renderToStaticMarkup(
          createElement(drawing.Component, { visual, shown: spec.stepIndex + 1 }),
        );
        const html = frameHtml({
          svgMarkup,
          title: visual.title,
          caption: step.caption,
          stepLabel: `step ${spec.stepIndex + 1} of ${spec.totalSteps}`,
          creditLines: credits,
          isDraft,
          builtCss,
          bandY: spec.band.y,
          bandHeight: spec.band.height,
        });

        const tmpHtml = join(drawingOutDir, `_frame-${spec.stepIndex}.html`);
        await writeFile(tmpHtml, html);
        await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle' });
        const framePath = join(drawingOutDir, spec.fileName);
        await page.screenshot({ path: framePath, type: 'jpeg', quality: JPEG_QUALITY });
        await rm(tmpHtml);
        process.stdout.write(`  ${spec.fileName}\n`);
      }

      await page.close();

      if (!options.framesOnly) {
        const clipOut = join(outDir, clipFileName(drawingId));
        process.stdout.write(`Encoding ${clipFileName(drawingId)} …\n`);
        try {
          runFfmpeg(drawingId, frames, drawingOutDir, clipOut);
          process.stdout.write(`  → ${clipOut}\n`);
        } catch (e) {
          process.stderr.write(`${e instanceof ClipError ? e.message : String(e)}\n`);
        }
      }
    }
    return 0;
  } catch (e) {
    process.stderr.write(`Unexpected error: ${String(e)}\n`);
    return 1;
  } finally {
    await browser?.close();
  }
}

if (process.argv[1]?.endsWith('export-clips.ts')) {
  const code = await main();
  process.exit(code);
}
