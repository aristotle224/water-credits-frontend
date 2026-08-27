import { test, expect, loginUser } from './fixtures';

/**
 * Journey 1 — Freighter connect → login → land on dashboard.
 *
 * The wallet is the mocked {@link E2EWalletProvider} (seeded by the page
 * fixture) and the backend is the in-memory stub, so this exercises the real
 * AuthEffects login flow without any live Stellar/testnet dependency.
 */
test.describe('Auth journey: wallet connect → login → dashboard', () => {
  test('logs in with the mocked wallet and reaches the dashboard', async ({ page }) => {
    await loginUser(page);

    // End-state UI assertion only — no internal store inspection.
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'Dashboard', level: 1 }),
    ).toBeVisible();

    // The authenticated shell should show the disconnected WS pill rather than
    // bouncing back to /auth/login (proves the guard accepted the session).
    await expect(page.getByText(/Disconnected|Live/)).toBeVisible();
  });
});
