import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const templatesRoot = resolve(repoRoot, 'templates');

const FORBIDDEN_VISIBLE_COPY = [
  /website generator/i,
  /website designer/i,
  /app designer/i,
  /SaaS dashboard/i,
  /SaaS landing page/i,
  /\bDesign Systems\b/i,
  /\bOpen Design\b/i,
  /\bpricing card\b/i,
  /\badmin panel\b/i,
  /\bCRM\b/i,
  /\be-commerce\b/i,
  /\bcustomer journey\b/i,
];

const VIEWPORTS = [
  { height: 950, name: 'desktop', width: 1440 },
  { height: 844, name: 'mobile', width: 390 },
] as const;

const STUDIO_DOCUMENTS = [
  {
    fileName: 'gameplay-encounter.gameview.json',
    label: 'Game Viewport',
    visibleCopy: [
      /Gameplay Encounter Viewport/i,
      /Spatial Readability/i,
      /World Simulation/i,
      /Objective Sightline/i,
      /Storm state lowers long sightlines/i,
      /Ember Court controls the shortcut core/i,
      /Camera Plan/i,
      /third-person shoulder/i,
    ],
  },
  {
    fileName: 'gameplay-logic.nodegraph.json',
    label: 'Node Graph',
    visibleCopy: [
      /Gameplay Logic Graph/i,
      /Studio Collaboration/i,
      /Gameplay Mechanics/i,
      /Economy & Progression/i,
      /reward-budget check/i,
      /Design Critique/i,
      /Procedural variants/i,
    ],
  },
  {
    fileName: 'enemy-captain.btree.json',
    label: 'Behavior Tree',
    visibleCopy: [
      /Enemy Captain Behavior Tree/i,
      /Readable Tells/i,
      /Counterplay Rules/i,
      /Flashlight cone widens/i,
      /Every support call has a cancel window/i,
      /Difficulty Director/i,
      /Delay support calls when player health is critical/i,
    ],
  },
  {
    fileName: 'combat-camera.systems.json',
    label: 'Game System',
    visibleCopy: [
      /Combat And Camera System Spec/i,
      /Production Scaling/i,
      /Vertical slice combat encounter/i,
      /Telemetry & Iteration/i,
      /death-readability/i,
      /Design Tokens/i,
      /Platform Adaptation/i,
      /No pay-to-win combat tuning/i,
      /\bmobile\b/i,
      /\bsolo\b/i,
    ],
  },
] as const;

test('studio JSON documents render as responsive game-editor surfaces', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Studio JSON visual QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);

  for (const doc of STUDIO_DOCUMENTS) {
    await writeProjectFile(page, projectId, doc.fileName, readFileSync(resolve(templatesRoot, doc.fileName), 'utf8'));
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissPrivacyPrompt(page);
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  for (const doc of STUDIO_DOCUMENTS) {
    await page.setViewportSize({ width: 1440, height: 950 });
    await closeSettingsDialogIfOpen(page);
    await page.getByTestId('game-files-tab').click();
    const fileRow = page.getByTestId(`game-file-row-${doc.fileName}`);
    await expect(fileRow).toBeVisible();
    await fileRow.locator('.df-cell-name').dblclick();
    await expect(page.getByTestId('game-studio-document-editor')).toBeVisible();
    await expect(page.getByText(doc.label, { exact: true })).toBeVisible();
    await expect(page.locator('body')).toContainText(doc.visibleCopy[0], { timeout: 15_000 });

    for (const viewport of VIEWPORTS) {
      const consoleStart = consoleErrors.length;
      const pageStart = pageErrors.length;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(page.getByTestId('game-studio-document-editor')).toBeVisible();

      const bodyText = await page.locator('body').innerText();
      for (const expected of doc.visibleCopy) {
        expect(bodyText, `${doc.fileName} ${viewport.name} expected ${expected}`).toMatch(expected);
      }
      for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
        expect(bodyText, `${doc.fileName} ${viewport.name} forbidden copy ${forbidden}`).not.toMatch(forbidden);
      }

      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${doc.fileName.replace(/\.json$/, '')}-${viewport.name}.png`, {
        body: screenshot,
        contentType: 'image/png',
      });
      const layout = await collectStudioDocumentLayoutIssues(page);

      expect(consoleErrors.slice(consoleStart), `${doc.fileName} ${viewport.name} console errors`).toEqual([]);
      expect(pageErrors.slice(pageStart), `${doc.fileName} ${viewport.name} page errors`).toEqual([]);
      expect(layout.horizontalOverflow, `${doc.fileName} ${viewport.name} horizontal overflow`).toBeLessThanOrEqual(2);
      expect(layout.offscreenRight, `${doc.fileName} ${viewport.name} offscreen elements`).toEqual([]);
      expect(layout.clippedChrome, `${doc.fileName} ${viewport.name} clipped studio chrome`).toEqual([]);
    }
  }
});

async function createProject(page: Page, projectName: string) {
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function dismissPrivacyPrompt(page: Page) {
  const notNow = page.getByRole('button', { name: 'Not now' });
  if (await notNow.isVisible().catch(() => false)) {
    await notNow.click();
  }
  await closeSettingsDialogIfOpen(page);
}

async function closeSettingsDialogIfOpen(page: Page) {
  const close = page.getByRole('button', { name: 'Close' }).first();
  if (await close.isVisible().catch(() => false)) {
    await close.click();
  }
}

async function writeProjectFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name, content },
  });
  expect(response.ok(), `${name} write response`).toBeTruthy();
}

function getProjectIdFromUrl(page: Page): string {
  const [, projects, projectId] = new URL(page.url()).pathname.split('/');
  expect(projects).toBe('projects');
  expect(projectId).toBeTruthy();
  return projectId!;
}

async function collectStudioDocumentLayoutIssues(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const offscreenRight = Array.from(document.body.querySelectorAll('.studio-doc-editor, .studio-svg-shell, .studio-system-board, .studio-insight-panel'))
      .filter(visible)
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2)
      .slice(0, 10)
      .map((el) => ({
        right: Math.round(el.getBoundingClientRect().right),
        tag: el.tagName,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      }));

    const clippedChrome = Array.from(
      document.querySelectorAll(
        '.studio-doc-tree button, .studio-doc-actions button, .studio-system-grid button, .studio-canvas-caption',
      ),
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
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      }));

    return {
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      offscreenRight,
      clippedChrome,
    };
  });
}
