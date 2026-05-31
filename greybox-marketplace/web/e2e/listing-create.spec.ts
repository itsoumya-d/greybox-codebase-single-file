// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { expect, test } from '@playwright/test';
import { installProxyMocks } from './_fixtures';

test('creator listing wizard submits and appears in admin queue', async ({ page }) => {
  await installProxyMocks(page);

  // Seed creator ID in localStorage so the wizard skips the onboard nag.
  await page.goto('/creator/onboard');
  await page.evaluate(() => {
    localStorage.setItem(
      'gb_onboarding_state',
      JSON.stringify({ step: 4, creatorId: 'creator-pf-new', country: 'US', displayName: 'Test', email: '' }),
    );
  });

  await page.goto('/creator/listings/new');
  await expect(page.getByTestId('step-type')).toBeVisible();

  await page.getByTestId('type-option-template').click();
  await page.getByTestId('step-type-next').click();
  await expect(page.getByTestId('step-asset')).toBeVisible();

  // Skip the upload step — the file is staged client-side and the backend
  // doesn't require it on the listing draft path.
  await page.getByTestId('step-asset-next').click();
  await expect(page.getByTestId('step-metadata')).toBeVisible();

  await page.getByTestId('listing-title').fill('Walkthrough listing');
  await page.getByTestId('listing-description').fill('Description from a Playwright walkthrough.');
  await page.getByTestId('listing-tags').fill('playwright,template');
  await page.getByTestId('step-metadata-next').click();

  await expect(page.getByTestId('step-pricing')).toBeVisible();
  await page.getByTestId('listing-price').fill('29.00');
  await page.getByTestId('step-pricing-next').click();

  await expect(page.getByTestId('step-preview')).toBeVisible();
  await page.getByTestId('step-preview-submit').click();

  await expect(page.getByTestId('step-submitted')).toBeVisible({ timeout: 5000 });
});
