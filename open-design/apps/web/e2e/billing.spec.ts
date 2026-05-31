// SPDX-License-Identifier: Apache-2.0
//
// Playwright spec for the customer-facing billing flow. The test exercises the
// /billing route, intercepts /api/billing/checkout so the daemon proxy is not
// required, and asserts that clicking "Choose Pro" redirects the browser to
// the Stripe checkout URL returned by the (faked) daemon. Run via the e2e
// package's playwright runner; the spec is co-located with apps/web by spec
// so future contributors can find it next to the route it covers.

import { expect, test } from '@playwright/test';

test.describe('/billing', () => {
  test('renders the plans grid with Free, Pro, Studio, and Enterprise', async ({ page }) => {
    await page.goto('/billing');
    await expect(page.getByRole('heading', { name: /Plans/i })).toBeVisible();
    await expect(page.getByText('Free', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Pro', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Studio', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Enterprise', { exact: false }).first()).toBeVisible();
  });

  test('Subscribe button POSTs /api/billing/checkout and redirects to the returned URL', async ({ page }) => {
    let capturedBody: unknown;
    await page.route('**/api/billing/checkout', async (route) => {
      const request = route.request();
      capturedBody = JSON.parse(request.postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://checkout.stripe.com/c/pay/cs_test_billing_e2e',
          id: 'cs_test_billing_e2e',
          dryRun: true,
        }),
      });
    });
    // The success page redirect would 404 against the fake Stripe URL, so we
    // also stub the destination URL with a minimal HTML body to keep the
    // assertion stable.
    await page.route('https://checkout.stripe.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><h1>stripe</h1></body></html>',
      }),
    );

    await page.route('**/api/billing/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, status: 'ok', tier: 'free' }),
      }),
    );

    await page.goto('/billing');
    await page.getByRole('button', { name: /Choose Pro/i }).click();
    await page.waitForURL(/checkout\.stripe\.com/u, { timeout: 5_000 });
    expect(capturedBody).toMatchObject({
      tier: 'indie',
    });
  });

  test('cancel page surfaces a friendly back-to-studio message', async ({ page }) => {
    await page.goto('/billing/cancel');
    await expect(page.getByRole('heading', { name: /No charge/i })).toBeVisible();
  });

  test('success page reads the session_id from the URL', async ({ page }) => {
    await page.goto('/billing/success?session_id=cs_test_e2e_demo');
    await expect(page.getByRole('heading', { name: /Welcome aboard/i })).toBeVisible();
    await expect(page.getByText('cs_test_e2e_demo')).toBeVisible();
  });
});
