import { defineConfig, devices } from '@playwright/test';

const port = 4322;

// Safari's engine (WebKit) and Firefox run only when CI sets ALL_ENGINES=1, which it does on pull requests into `main`
// (D-48). Without it these projects don't exist, so ordinary pull requests and `npm run test:e2e` stay Chromium only.
const allEngines = process.env.ALL_ENGINES === '1';
// The accessibility scan (axe) takes about 30 s per page in WebKit on a Mac, which is the whole default test limit, so
// the engine projects get a longer limit. Only the time allowed changes; no assertion is skipped or loosened.
const engineTimeout = 90_000;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  // Phone 390 × 844, tablet 820 × 1180 and desktop 1440 × 900 in Chromium on every pull request (D-48). On Release
  // pull requests WebKit (phone and desktop) and Firefox (desktop) join them. Firefox has no phone emulation.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'phone-evening', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    ...(allEngines
      ? [
          { name: 'webkit-phone', timeout: engineTimeout, use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
          { name: 'webkit-desktop', timeout: engineTimeout, use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
          { name: 'firefox-desktop', timeout: engineTimeout, use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
        ]
      : []),
  ],
  webServer: {
    // Serves the already-built dist/ folder. Run `npm run build` first.
    // --ignore-lock: Playwright owns this server; don't clash with a dev's own preview.
    command: `npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
