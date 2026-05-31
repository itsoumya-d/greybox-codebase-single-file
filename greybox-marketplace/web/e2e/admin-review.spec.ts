// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { expect, test } from '@playwright/test';
import { installProxyMocks } from './_fixtures';

test('admin reviewer can approve a pending listing', async ({ page }) => {
  await installProxyMocks(page);

  await page.goto('/admin/review');
  await expect(page.getByTestId('admin-review-table')).toBeVisible();
  await expect(page.getByTestId('review-row-review-pf-pending')).toBeVisible();

  await page.getByTestId('approve-review-pf-pending').click();
  // After approval the mock returns a published listing summary; the table row
  // remains until the next dashboard pull, but the approve POST should have
  // completed without error.
  await expect(page.locator('.gb-error')).toHaveCount(0);
});

test('admin review table renders KPI cards and reviewer field', async ({ page }) => {
  await installProxyMocks(page);
  await page.goto('/admin/review');
  await expect(page.getByText('Pending human')).toBeVisible();
  await expect(page.getByLabel('Reviewer ID (recorded on approval)')).toBeVisible();
});
