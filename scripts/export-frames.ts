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
import { durationMs, FRAME_SIZES, frameName, frameTimes, parseArguments, PlanError } from './export-frames/plan.ts';

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
          // Screenshots normally wait for an element to stop moving. At a paused time it is stable already.
          const png = await element.screenshot({ type: 'png', animations: 'allow', scale: 'css' });
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
