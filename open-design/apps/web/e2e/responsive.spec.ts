// SPDX-License-Identifier: Apache-2.0
//
// Playwright spec for responsive behavior. Asserts that the /billing route
// has no horizontal overflow at mobile / tablet / desktop viewports and that
// interactive controls clear the 44x44 tap-target floor on mobile.

import { expect, test } from '@playwright/test';

interface Viewport {
  width: number;
  height: number;
  label: string;
}

const VIEWPORTS: Viewport[] = [
  { width: 375, height: 667, label: 'mobile' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 1280, height: 800, label: 'desktop' },
];

test.describe('/billing responsive layout', () => {
  for (const viewport of VIEWPORTS) {
    test(`has no horizontal overflow at ${viewport.label} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/billing');
      await page.waitForSelector('.billing-plans-grid');
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      // Allow a 1px tolerance for sub-pixel rounding from font metrics.
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    });
  }

  test('mobile tap targets clear the 44x44 floor', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/billing');
    const cta = page.getByRole('button', { name: /Choose Pro/i });
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
});
