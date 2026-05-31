// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { expect, test } from '@playwright/test';
import { installProxyMocks } from './_fixtures';

test('creator onboarding wizard walks profile -> stripe (mocked redirect)', async ({ page }) => {
  await installProxyMocks(page);

  await page.goto('/creator/onboard');
  await expect(page.getByTestId('step-profile')).toBeVisible();

  await page.getByTestId('displayName').fill('Test Creator');
  await page.getByTestId('country').fill('US');
  await page.getByTestId('email').fill('test@example.com');

  await page.getByTestId('step-profile-next').click();
  await expect(page.getByTestId('step-stripe')).toBeVisible();

  // Stripe Connect mock returns a same-origin URL so we land back on the
  // wizard at step=2 without a real Stripe redirect.
  await page.getByTestId('step-stripe-start').click();
  await expect(page).toHaveURL(/step=2/);

  // After return, recheck should not error and tax step should show.
  await expect(page.getByTestId('step-tax')).toBeVisible();
});

test('onboarding state is persisted to localStorage between reloads', async ({ page }) => {
  await installProxyMocks(page);

  await page.goto('/creator/onboard');
  await page.getByTestId('displayName').fill('Persisted Creator');
  await page.getByTestId('country').fill('GB');
  await page.getByTestId('email').fill('persist@example.com');
  await page.getByTestId('step-profile-next').click();
  await expect(page.getByTestId('step-stripe')).toBeVisible();

  await page.reload();
  // On reload we hydrate from localStorage and should still be on step 1.
  await expect(page.getByTestId('step-stripe')).toBeVisible();
});
