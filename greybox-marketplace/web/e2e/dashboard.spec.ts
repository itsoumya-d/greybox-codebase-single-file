// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { expect, test } from '@playwright/test';
import { installProxyMocks } from './_fixtures';

test('creator dashboard shows KPI cards and listings table', async ({ page }) => {
  await installProxyMocks(page);

  // Seed creator ID so the gate shows the dashboard.
  await page.goto('/creator/dashboard');
  await page.evaluate(() => {
    localStorage.setItem(
      'gb_onboarding_state',
      JSON.stringify({ step: 4, creatorId: 'creator-1', country: 'US', displayName: 'Loops' }),
    );
  });
  await page.reload();

  await expect(page.getByTestId('kpi-cards')).toBeVisible();
  await expect(page.getByTestId('listings-table')).toBeVisible();
  await expect(page.getByText('Payout readiness')).toBeVisible();
});

test('public catalog renders cards', async ({ page }) => {
  await installProxyMocks(page);
  await page.goto('/');
  await expect(page.getByTestId('catalog-grid')).toBeVisible();
  await expect(page.locator('[data-testid="listing-card"]')).toHaveCount(2);
});
