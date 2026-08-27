import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright end-to-end configuration for the Water Credits frontend.
 *
 * The suite is fully hermetic: the Angular `page` fixture (see e2e/fixtures.ts)
 * installs a mocked wallet provider and routes every `/api/v1/**` request to an
 * in-memory stub. No live backend, Stellar node, or testnet is contacted, so
 * the run is deterministic and CI-friendly.
 *
 * The app is built once (service worker disabled via the `e2e` Angular build
 * configuration) and served by a tiny static server (e2e/server.mjs) that
 * rewrites unknown paths to index.html for client-side routing.
 */
export default defineConfig({
  testDir: './e2e',
  // Test files are matched by the default *.spec.ts / *.test.ts glob.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A single retried run keeps CI green against the occasional slow CI machine
  // without hiding genuine regressions (which fail twice).
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['github'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build (copying the example env if needed) then serve the SPA.
    command: 'npm run build:e2e && node e2e/server.mjs 4200',
    url: 'http://localhost:4200',
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
