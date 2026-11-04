import type { TestInfo } from '@playwright/test';

/*
 * Tests that run only in some projects pick them by what the project is (its window size, touch screen and palette),
 * never by its name, so the WebKit and Firefox projects that join on Release pull requests (D-48,
 * playwright.config.ts) are picked exactly like their Chromium twins.
 */

/** The project's window size class: phone below 600 px wide, desktop from 1200 px, tablet in between. */
export function sizeOf(info: TestInfo): 'phone' | 'tablet' | 'desktop' {
  const width = info.project.use.viewport?.width ?? 0;
  return width >= 1200 ? 'desktop' : width >= 600 ? 'tablet' : 'phone';
}

/** True for the project that forces the Evening palette from the device (`phone-evening`). */
export function isEveningProject(info: TestInfo): boolean {
  return info.project.use.colorScheme === 'dark';
}

/**
 * True for the desktop-size, mouse-driven project of each engine: `desktop` (Chromium) on every pull request, plus
 * `webkit-desktop` and `firefox-desktop` on Release pull requests. For tests that need a mouse, set their own window
 * sizes, or only need to run once per engine.
 */
export function isDesktopOfEachEngine(info: TestInfo): boolean {
  return sizeOf(info) === 'desktop' && !info.project.use.hasTouch && !isEveningProject(info);
}

/**
 * True only for Chromium's `desktop` project: the one project where a static check runs (Task 308). A static check
 * reads only what the server sends or what the built HTML says (status codes, headers, meta tags, titles, link
 * targets, structured data), so the window size, touch screen, palette and engine can't change its answer.
 */
export function isStaticCheckProject(info: TestInfo): boolean {
  const engine = info.project.use.browserName ?? info.project.use.defaultBrowserType ?? 'chromium';
  return engine === 'chromium' && isDesktopOfEachEngine(info);
}

/**
 * Opt-in for static route sweeps: put this first in the sweep's `test.describe`, and its tests run once instead of in
 * every project. It runs before the test asks for a page, so the other projects skip without opening one:
 *
 *   test.beforeEach(({}, testInfo) => runStaticCheckOnce(testInfo));
 *
 * Never use it for anything a person sees or touches (layout, focus, scrolling, colors, taps, axe): those run in every
 * project (D-48).
 */
export function runStaticCheckOnce(info: TestInfo): void {
  info.skip(!isStaticCheckProject(info), 'static check: runs once, in Chromium at desktop size (Task 308)');
}
