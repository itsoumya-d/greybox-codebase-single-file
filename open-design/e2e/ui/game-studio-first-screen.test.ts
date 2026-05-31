import { expect, test, type Page } from '@playwright/test';

const FORBIDDEN_VISIBLE_COPY = [
  /website generator/i,
  /website designer/i,
  /app designer/i,
  /SaaS dashboard/i,
  /SaaS landing page/i,
  /mobile app/i,
  /\bDesign Systems\b/i,
  /\bOpen Design\b/i,
];

const VIEWPORTS = [
  { height: 950, name: 'desktop', width: 1440 },
  { height: 844, name: 'mobile', width: 390 },
] as const;

async function collectLayoutIssues(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const textOverflow = Array.from(
      document.querySelectorAll('button, [role="button"], input, select, textarea, .tab-button, .segmented-control *'),
    )
      .filter(visible)
      .filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
      .slice(0, 10)
      .map((el) => ({
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
          .trim()
          .slice(0, 80),
      }));

    return {
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      textOverflow,
    };
  });
}

test('AI Game Design Studio first screen is game-native and responsive', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByText('AI Game Design Studio').first().waitFor();

    const bodyText = await page.locator('body').innerText();
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`first-screen-${viewport.name}.png`, {
      body: screenshot,
      contentType: 'image/png',
    });
    const layout = await collectLayoutIssues(page);

    expect(response?.status(), `${viewport.name} HTTP status`).toBe(200);
    expect(bodyText, `${viewport.name} brand`).toContain('AI Game Design Studio');
    expect(bodyText, `${viewport.name} game vocabulary`).toMatch(/game|player|studio|art bible|playable/i);
    expect(bodyText, `${viewport.name} should not show Next 404`).not.toMatch(/404\s+This page could not be found/i);
    for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
      expect(bodyText, `${viewport.name} forbidden copy ${forbidden}`).not.toMatch(forbidden);
    }
    expect(consoleErrors, `${viewport.name} console errors`).toEqual([]);
    expect(pageErrors, `${viewport.name} page errors`).toEqual([]);
    expect(layout.horizontalOverflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(2);
    expect(layout.textOverflow, `${viewport.name} clipped controls`).toEqual([]);
  }
});

test('AI Game Design Studio workspace shell is game-native and responsive', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Workspace visual QA game');
  await page.getByTestId('create-project').click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('studio-mode-strip')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  for (const mode of ['Gameplay', 'Level', 'Narrative', 'World Map', 'Logic Graph', 'Production']) {
    await page.getByRole('tab', { name: mode }).click();
    await expect(page.getByRole('tab', { name: mode })).toHaveAttribute('aria-selected', 'true');
  }

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByTestId('studio-mode-strip')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach(`workspace-${viewport.name}.png`, {
      body: screenshot,
      contentType: 'image/png',
    });
    const layout = await collectLayoutIssues(page);

    expect(bodyText, `${viewport.name} workspace brand`).toContain('AI Game Design Studio');
    expect(bodyText, `${viewport.name} workspace surface`).toMatch(/studio surface/i);
    expect(bodyText, `${viewport.name} workspace files`).toContain('Game Files');
    for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
      expect(bodyText, `${viewport.name} forbidden copy ${forbidden}`).not.toMatch(forbidden);
    }
    expect(consoleErrors, `${viewport.name} console errors`).toEqual([]);
    expect(pageErrors, `${viewport.name} page errors`).toEqual([]);
    expect(layout.horizontalOverflow, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(2);
    expect(layout.textOverflow, `${viewport.name} clipped controls`).toEqual([]);
  }
});
