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
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { playerSteps } from '../src/visuals/drawing.ts';
import { creditsFor, type Visual } from '../src/visuals/sources.ts';
import {
  type ClipOptions,
  type FrameHtmlOptions,
  ClipError,
  buildFfmpegInput,
  clipFileName,
  frameHtml,
  frameList,
  CROSSFADE_DURATION_S,
  FPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  JPEG_QUALITY,
  parseArguments,
} from './export-clips/plan.ts';

// ── Drawing loader (esbuild bundle — handles TSX components) ──────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DrawingEntry = { Component: (props: { visual: Visual; shown: number }) => any; steps: unknown[] };
type DrawingMap = Record<string, DrawingEntry>;

/**
 * Bundles src/visuals/drawings/index.ts with esbuild so that the TSX component
 * files it imports can be loaded by Node (which handles .ts but not .tsx natively).
 * The bundle is written to a temp file and imported dynamically.
 */
async function loadDrawings(root: string): Promise<DrawingMap> {
  const { build } = await import('esbuild');
  const tmpFile = join(tmpdir(), `cueory-drawings-${Date.now()}.mjs`);
  await build({
    entryPoints: [join(root, 'src/visuals/drawings/index.ts')],
    bundle: true,
    format: 'esm',
    outfile: tmpFile,
    jsx: 'automatic',
    platform: 'node',
  });
  const mod = await import(pathToFileURL(tmpFile).href);
  rm(tmpFile).catch(() => {});
  return mod.drawings as DrawingMap;
}

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
  const { readdirSync } = await import('node:fs');
  const cssFiles = readdirSync(astroDir).filter((f) => f.endsWith('.css'));
  if (!cssFiles.length) throw new ClipError('No .css file found in dist/_astro/.');
  return await readFile(join(astroDir, cssFiles[0]!), 'utf-8');
}

// ── SVG height measurement ────────────────────────────────────────────────────

/**
 * Measures the actual rendered height of a drawing's SVG by loading a minimal
 * measurement page in Playwright. This is necessary because SVG components use
 * Tailwind classes like `max-w-md h-auto` that constrain the height to less than
 * FRAME_HEIGHT, making bands() need the real height to crop correctly.
 */
async function measureDrawingHeight(
  page: Page,
  drawing: DrawingEntry,
  visual: Visual,
  builtCss: string,
  outDir: string,
): Promise<number> {
  const svgMarkup = renderToStaticMarkup(
    createElement(drawing.Component, { visual, shown: 999 }),
  );
  const measureHtml = `<!doctype html><html><head>
<meta charset="utf-8">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${FRAME_WIDTH}px; overflow: visible; }
${builtCss}
.measure-wrap { width: 100%; padding: 0 40px; }
</style>
</head><body><div class="measure-wrap">${svgMarkup}</div></body></html>`;

  const tmpHtml = join(outDir, '_measure.html');
  await writeFile(tmpHtml, measureHtml);
  await page.setViewportSize({ width: FRAME_WIDTH, height: FRAME_HEIGHT });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle' });
  const height = await page.evaluate(
    () => document.querySelector('svg')?.getBoundingClientRect().height ?? 0,
  );
  await rm(tmpHtml);
  return Math.max(1, Math.round(height));
}

// ── ffmpeg ────────────────────────────────────────────────────────────────────

function runFfmpeg(
  drawingId: string,
  frames: { fileName: string }[],
  framesDir: string,
  clipOut: string,
): void {
  if (frames.length < 2) {
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

  const holdSec = 2.0;
  const xfadeSec = CROSSFADE_DURATION_S;
  const inputs: string[] = frames.flatMap((f) => ['-loop', '1', '-t', String(holdSec + xfadeSec), '-i', join(framesDir, f.fileName)]);
  const filterParts: string[] = [];
  let prev = '[0:v]';
  for (let i = 1; i < frames.length; i++) {
    const next = `[${i}:v]`;
    const out = i < frames.length - 1 ? `[v${i}]` : '[vout]';
    const offset = holdSec * i - xfadeSec * (i - 1);
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

  let drawings: DrawingMap;
  try {
    drawings = await loadDrawings(root);
  } catch (e) {
    process.stderr.write(`Failed to load drawings: ${String(e)}\n`);
    return 2;
  }

  let encodeErrors = 0;
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

      const steps = playerSteps(visual, drawing.steps as Parameters<typeof playerSteps>[1]);
      const credits = creditsFor(visual).map((b) => b.credit);
      const isDraft = visual.status !== 'approved';

      const drawingOutDir = join(outDir, drawingId);
      await mkdir(drawingOutDir, { recursive: true });

      const page = await browser.newPage();
      await page.setViewportSize({ width: FRAME_WIDTH, height: FRAME_HEIGHT });

      const drawingHeight = await measureDrawingHeight(page, drawing, visual, builtCss, drawingOutDir);
      const frames = frameList(drawingId, steps.length, drawingHeight);

      for (const spec of frames) {
        const step = steps[spec.stepIndex]!;
        const svgMarkup = renderToStaticMarkup(
          createElement(drawing.Component, { visual, shown: spec.stepIndex + 1 }),
        );
        const htmlOpts: FrameHtmlOptions = {
          svgMarkup,
          title: visual.title,
          caption: step.caption,
          stepLabel: `step ${spec.stepIndex + 1} of ${spec.totalSteps}`,
          creditLines: credits,
          isDraft,
          builtCss,
          bandY: spec.band.y,
          bandHeight: spec.band.height,
        };

        const tmpHtml = join(drawingOutDir, `_frame-${spec.stepIndex}.html`);
        await writeFile(tmpHtml, frameHtml(htmlOpts));
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
          encodeErrors += 1;
          process.stderr.write(`${e instanceof ClipError ? e.message : String(e)}\n`);
        }
      }
    }
    return encodeErrors > 0 ? 1 : 0;
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
