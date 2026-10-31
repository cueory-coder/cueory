import { defineConfig, devices } from '@playwright/test';

const port = 4322;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  // Phone 390 × 844, tablet 820 × 1180 and desktop 1440 × 900 in Chromium on every pull request (D-48). Safari's
  // engine (WebKit) and Firefox join on Release pull requests once that CI change is approved.
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'phone-evening', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // Serves the already-built dist/ folder. Run `npm run build` first.
    // --ignore-lock: Playwright owns this server; don't clash with a dev's own preview.
    command: `npx astro preview --port ${port} --ignore-lock`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
