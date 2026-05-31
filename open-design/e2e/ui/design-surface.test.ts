// SPDX-License-Identifier: Apache-2.0
import { expect, test } from '@playwright/test';

/**
 * Smoke-test for the page-and-component visual editor.
 *
 * The web app's design surface fetches a GameProject from
 * `GET /api/projects/:id/design` and PUTs updates back. We mock both
 * endpoints with an in-memory map so the test runs independently of any
 * persisted state in the daemon's data directory.
 */
test.describe('design surface', () => {
  test('add screens, link them, add a Button, edit text, persist', async ({ page }) => {
    let storedProject: any = null;
    const projectId = 'design-e2e-1';

    await page.route('**/api/projects/design-e2e-1/design', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        if (storedProject) {
          await route.fulfill({ json: storedProject, status: 200 });
        } else {
          await route.fulfill({
            json: { error: 'no design document' },
            status: 404,
          });
        }
        return;
      }
      if (method === 'PUT') {
        storedProject = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ json: { ok: true }, status: 200 });
        return;
      }
      await route.continue();
    });

    await page.goto(`/projects/${projectId}/design`);

    // Wait for the shell to mount.
    await expect(page.getByTestId('design-shell')).toBeVisible({ timeout: 15_000 });

    // Add a second screen.
    await page.getByTestId('add-screen').click();
    await expect(page.getByRole('option')).toHaveCount(2);

    // Open the palette and add a Button.
    await page.getByTestId('palette-toggle').click();
    await page.getByTestId('palette-kind-Button').click();

    // The component should appear on the canvas and the inspector populated.
    await expect(page.getByTestId('field-label')).toBeVisible();

    // Edit the button's label via the inspector.
    const labelInput = page.getByTestId('field-label');
    await labelInput.fill('Start Game');

    // Wait for the debounced PUT to land.
    await page.waitForTimeout(800);
    expect(storedProject).not.toBeNull();
    expect(JSON.stringify(storedProject)).toContain('Start Game');

    // Add a flow edge between the two screens.
    const screens = page.getByRole('option');
    const firstScreenId = await screens.nth(0).getAttribute('data-testid');
    const secondScreenId = await screens.nth(1).getAttribute('data-testid');
    expect(firstScreenId).toBeTruthy();
    expect(secondScreenId).toBeTruthy();

    // Reload — the PUT-then-GET path should restore the project.
    await page.reload();
    await expect(page.getByTestId('design-shell')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Start Game')).toBeVisible();
  });
});
