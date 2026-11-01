/**
 * Render an animated page element as PNG frames, without changing the page's source.
 * node scripts/export-frames.ts --url <url> --selector <css> --out <folder> [--fps 30] [--seconds <n>]
 *
 * Timing: https://developer.mozilla.org/en-US/docs/Web/API/AnimationEffect/getComputedTiming
 * Capture: https://playwright.dev/docs/api/class-locator#locator-screenshot
 * Exit codes: 0 exported, 2 invalid arguments/selector/timing, 1 capture or filesystem failure.
 */
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from '@playwright/test';
import {
  durationMs,
  FILL_STYLE,
  FRAME_SIZES,
  frameName,
  frameTimes,
  parseArguments,
  PlanError,
  pngSize,
} from './export-frames/plan.ts';

export async function main(args = process.argv.slice(2)): Promise<number> {
  let browser: Browser | undefined;
  let scratch: string | undefined;
  const previousTemp = process.env.TMPDIR;
  try {
    const options = parseArguments(args);
    await mkdir(resolve(options.out), { recursive: true });
    const out = await realpath(resolve(options.out));
    scratch = await mkdtemp(join(out, '.export-frames-'));
    // Playwright's profiles and temporary artifacts also stay inside the chosen output folder.
    process.env.TMPDIR = scratch;
    browser = await chromium.launch();
    let total = 0;
    for (const { name, width, height } of FRAME_SIZES) {
      const folder = join(out, name);
      await mkdir(folder, { recursive: true });
      if ((await lstat(folder)).isSymbolicLink()) throw new PlanError('Frame folders must not be symbolic links.');
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        await page.goto(options.url, { waitUntil: 'load' });
        await page.evaluate(async () => { await document.fonts.ready; });
        const element = page.locator(options.selector);
        if ((await element.count()) !== 1) throw new PlanError('--selector must match exactly one element.');
        // Stretch the element over the whole window, so each frame is exactly the frame size (Codex review, #47).
        await element.evaluate((node, style) => {
          for (const [property, value] of Object.entries(style)) {
            (node as HTMLElement | SVGElement).style.setProperty(property, value, 'important');
          }
          // Everything else is hidden; the page's own background still shows around the diagram.
          document.documentElement.style.setProperty('overflow', 'hidden', 'important');
          document.documentElement.style.setProperty('visibility', 'hidden', 'important');
        }, FILL_STYLE);
        const ends = await page.evaluate(() => document.getAnimations().map((animation) => {
          animation.pause();
          const end = animation.effect?.getComputedTiming().endTime ?? 0;
          return typeof end === 'number' ? end : Number.NaN;
        }));
        const times = frameTimes(durationMs(ends, options.seconds), options.fps);
        for (let index = 0; index < times.length; index++) {
          await page.evaluate((time) => {
            for (const animation of document.getAnimations()) {
              animation.pause();
              animation.currentTime = time;
            }
          }, times[index]!);
          // The window is the frame: the element fills it. At a paused time nothing moves, so no waiting is needed.
          const png = await page.screenshot({ type: 'png', animations: 'allow', scale: 'css' });
          const size = pngSize(png);
          if (size?.width !== width || size.height !== height) {
            throw new Error(`A ${name} frame came out ${size?.width ?? '?'} × ${size?.height ?? '?'} px.`);
          }
          // Refuse existing files (including symlinks), so a rerun never overwrites unrelated output.
          await writeFile(join(folder, frameName(index)), png, { flag: 'wx' });
          total++;
        }
      } finally {
        await context.close();
      }
    }
    console.log(`Exported ${total} PNG frames in portrait and landscape.`);
    return 0;
  } catch (error) {
    console.error(error instanceof PlanError ? error.message : 'Could not capture the page or write frames; check Chromium, the page and an empty output folder.');
    return error instanceof PlanError ? 2 : 1;
  } finally {
    await browser?.close();
    if (previousTemp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTemp;
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
