import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const templatesRoot = resolve(repoRoot, 'templates');

test('workspace shows live studio collaborators on game-studio documents', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Studio presence QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);

  await writeProjectFile(page, projectId, 'gameplay-logic.nodegraph.json', readTemplate('gameplay-logic.nodegraph.json'));
  await writeProjectFile(page, projectId, 'enemy-captain.btree.json', readTemplate('enemy-captain.btree.json'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await dismissPrivacyPrompt(page);
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  await page.goto(`/projects/${projectId}/files/${encodeURIComponent('gameplay-logic.nodegraph.json')}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissPrivacyPrompt(page);
  await expect(page.getByTestId('game-studio-document-editor')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gameplay Logic Graph' })).toBeVisible();

  await postStudioPresence(page, projectId, {
    actorName: 'Combat Designer',
    clientId: 'combat-designer-1',
    cursor: {
      column: 9,
      line: 38,
      selectionKind: 'node',
      selectionLabel: 'Cooldown gate',
    },
    filePath: 'gameplay-logic.nodegraph.json',
    mode: 'editing',
    surface: 'node-graph',
  });
  await postStudioPresence(page, projectId, {
    actorName: 'Narrative Designer',
    clientId: 'narrative-designer-1',
    cursor: {
      selectionKind: 'node',
      selectionLabel: 'Faction reveal branch',
    },
    filePath: 'enemy-captain.btree.json',
    mode: 'reviewing',
    surface: 'behavior-tree',
  });

  const rail = page.getByTestId('studio-presence-rail');
  await expect(rail).toBeVisible();
  await expect(rail).toContainText('Combat Designer');
  await expect(rail).toContainText('gameplay-logic.nodegraph.json');
  await expect(rail).toContainText('Cooldown gate');
  await expect(rail).toContainText('L38:9');
  await expect(rail).toContainText('Narrative Designer');
  await expect(rail).toContainText('enemy-captain.btree.json');
  await expect(rail).toContainText('Faction reveal branch');

  await expect(rail.getByTitle(/Combat Designer is editing gameplay-logic\.nodegraph\.json at Cooldown gate/i)).toBeVisible();
  await expect(rail.getByTitle(/Narrative Designer is reviewing enemy-captain\.btree\.json at Faction reveal branch/i)).toBeVisible();

  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach('studio-presence-rail.png', {
    body: screenshot,
    contentType: 'image/png',
  });
  const layout = await collectPresenceLayoutIssues(page);
  expect(consoleErrors, 'console errors').toEqual([]);
  expect(pageErrors, 'page errors').toEqual([]);
  expect(layout.horizontalOverflow, 'horizontal overflow').toBeLessThanOrEqual(2);
  expect(layout.clippedPresence, 'clipped studio presence chips').toEqual([]);
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

async function postStudioPresence(
  page: Page,
  projectId: string,
  data: {
    actorName: string;
    clientId: string;
    cursor: {
      column?: number;
      line?: number;
      selectionKind: 'node';
      selectionLabel: string;
    };
    filePath: string;
    mode: 'editing' | 'reviewing';
    surface: 'behavior-tree' | 'node-graph';
  },
) {
  const response = await page.request.post(`/api/projects/${projectId}/presence`, {
    data,
  });
  expect(response.ok(), `${data.clientId} studio presence response`).toBeTruthy();
}

function readTemplate(name: string): string {
  return readFileSync(resolve(templatesRoot, name), 'utf8');
}

function getProjectIdFromUrl(page: Page): string {
  const [, projects, projectId] = new URL(page.url()).pathname.split('/');
  expect(projects).toBe('projects');
  expect(projectId).toBeTruthy();
  return projectId!;
}

async function collectPresenceLayoutIssues(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clippedPresence = Array.from(document.querySelectorAll('.studio-presence-chip, .studio-presence-actor, .studio-presence-target'))
      .filter(visible)
      .filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
      .slice(0, 10)
      .map((el) => ({
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        tag: el.tagName,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      }));

    return {
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      clippedPresence,
    };
  });
}
