import { test as base, expect, type Page } from '@playwright/test';
import { registerMockApi, TEST_WALLET_ADDRESS } from './mock-api';

/**
 * Shared e2e fixtures.
 *
 * Every page created by the suite is instrumented with:
 *   1. `window.__WC_E2E_WALLET_ADDRESS__` — installed *before* the Angular app
 *      boots (via `addInitScript`) so the WalletProviderRegistry swaps in the
 *      deterministic {@link E2EWalletProvider}. No real Freighter / testnet.
 *   2. A network route that fulfils every `/api/v1/**` call from the in-memory
 *      stubs in `mock-api.ts`. No live backend.
 */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    await page.addInitScript(
      ([address]) => {
        (window as unknown as Record<string, string>).__WC_E2E_WALLET_ADDRESS__ = address;
      },
      [TEST_WALLET_ADDRESS],
    );

    await registerMockApi(page);

    await use(page);
  },
});

export { expect };

/**
 * Drive the wallet-based login flow and wait until the dashboard is reached.
 * Used as the entry point for every authenticated journey.
 */
export async function loginUser(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: /connect wallet/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await expect(
    page.getByRole('heading', { name: 'Dashboard', level: 1 }),
  ).toBeVisible();
}
