import { test, expect, loginUser } from './fixtures';

/**
 * Journey 3 — marketplace create listing & buy flow.
 *
 * Both sub-flows run against the mocked backend and wallet. The created listing
 * is owned by the test user (so it is NOT buyable by them), while the seeded
 * "Blue Lake Restoration" listing is owned by a different seller and is used to
 * exercise the buy → wallet-sign → confirmation path.
 */
test.describe('Marketplace journey: create listing & buy', () => {
  test('creates a new listing that then appears in the marketplace', async ({ page }) => {
    await loginUser(page);

    await page.goto('/marketplace');
    await page.getByRole('link', { name: /Create Listing/ }).click();

    await page.locator('#projectId').selectOption({ label: 'Clean River Project' });
    await page.locator('#amount').fill('250');
    await page.locator('#price').fill('3');

    await page.getByRole('button', { name: /Create Listing/ }).click();

    // End-state: back on the marketplace with the new listing visible.
    await page.waitForURL('**/marketplace$', { timeout: 15000 });
    await expect(page.getByText('Clean River Project')).toBeVisible();
  });

  test('buys an active listing from another seller to completion', async ({ page }) => {
    await loginUser(page);

    await page.goto('/marketplace');

    // Seed listing "Blue Lake Restoration" is owned by a different seller.
    await page
      .locator('tr', { hasText: 'Blue Lake Restoration' })
      .getByRole('button', { name: 'Buy' })
      .click();

    await page.waitForURL('**/marketplace/**/buy', { timeout: 15000 });
    await expect(
      page.getByRole('heading', { name: /Buy Credits|Manage Listing/ }),
    ).toBeVisible();

    await page.getByRole('button', { name: /Confirm Purchase/ }).click();

    // End-state: purchase confirmation screen.
    await expect(page.getByText('Purchase Complete')).toBeVisible();
  });
});
