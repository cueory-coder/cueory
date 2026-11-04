import type { TestInfo } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDesktopOfEachEngine, isStaticCheckProject } from '../e2e/projects';

/** The browser test projects, read from playwright.config.ts with or without the Release engines (D-48). */
async function projects(allEngines: boolean) {
  vi.resetModules();
  vi.stubEnv('ALL_ENGINES', allEngines ? '1' : '');
  const config = (await import('../../playwright.config')).default;
  return (config.projects ?? []).map((project) => ({ name: project.name, info: { project } as unknown as TestInfo }));
}

const matching = (list: Awaited<ReturnType<typeof projects>>, pick: (info: TestInfo) => boolean) =>
  list.filter(({ info }) => pick(info)).map(({ name }) => name);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Task 308: static checks run in one project', () => {
  it('picks only Chromium desktop on everyday pull requests', async () => {
    expect(matching(await projects(false), isStaticCheckProject)).toEqual(['desktop']);
  });

  it('still picks only Chromium desktop when WebKit and Firefox join on Release pull requests', async () => {
    const list = await projects(true);
    expect(list.map(({ name }) => name)).toContain('webkit-desktop');
    expect(matching(list, isStaticCheckProject)).toEqual(['desktop']);
    // The desktop project of each engine is unchanged.
    expect(matching(list, isDesktopOfEachEngine)).toEqual(['desktop', 'webkit-desktop', 'firefox-desktop']);
  });
});
