import { test, expect, loginUser } from './fixtures';

/**
 * Journey 2 — navigate to a project → retire credits (wallet signing mocked)
 * → certificate page.
 *
 * The retirement effect runs the full two-phase flow; because the stub returns
 * an `unsignedXdr`, the mocked `signTx` is exercised (signature step is not
 * skipped) and the certificate is then fetched and rendered.
 */
test.describe('Retirement journey: project → retire → certificate', () => {
  test('retires credits for a project and reaches the certificate', async ({ page }) => {
    await loginUser(page);

    await page.goto('/retirement/new');

    // Step 0 — pick a project from the searchable list.
    await page.getByRole('button', { name: /Clean River Project/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 1 — amount.
    await page.getByPlaceholder('e.g., 100').fill('100');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 — purpose. Scope to the select that owns the purpose option so we
    // never accidentally target a layout/nav <select>.
    await page
      .locator('select')
      .filter({ has: page.getByRole('option', { name: 'Voluntary Retirement' }) })
      .selectOption({ label: 'Voluntary Retirement' });
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 — confirm & sign (mocked wallet).
    await page.getByRole('button', { name: /Confirm & Retire/ }).click();

    // End-state: certificate page is reached.
    await page.waitForURL('**/retirement/**/certificate', { timeout: 15000 });
    await expect(page.locator('#certificate-content')).toBeVisible();
    await expect(
      page.getByText('Certificate of Carbon Credit Retirement'),
    ).toBeVisible();
    await expect(page.getByText('Clean River Project')).toBeVisible();
  });
});
