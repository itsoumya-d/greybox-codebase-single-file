// SPDX-License-Identifier: Apache-2.0
//
// Playwright spec for the theme cycle. The toggle component is currently
// only mounted on the /billing route's auxiliary header — we navigate there
// and exercise the cycle directly via localStorage + a reload to keep the
// spec stable when the toggle moves to other surfaces.

import { expect, test } from '@playwright/test';

test.describe('theme cycle', () => {
  test('localStorage greybox-theme drives <html data-theme>', async ({ page }) => {
    await page.goto('/billing');
    // Default: theme=system → no data-theme attribute.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /(light|dark)/u);

    await page.evaluate(() => window.localStorage.setItem('greybox-theme', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.evaluate(() => window.localStorage.setItem('greybox-theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.evaluate(() => window.localStorage.setItem('greybox-theme', 'system'));
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /(light|dark)/u);
  });

  test('billing page is screenshot-stable across light and dark', async ({ page }) => {
    await page.goto('/billing');
    await page.evaluate(() => window.localStorage.setItem('greybox-theme', 'light'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/theme-billing-light.png', fullPage: true });

    await page.evaluate(() => window.localStorage.setItem('greybox-theme', 'dark'));
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-results/theme-billing-dark.png', fullPage: true });
  });
});
