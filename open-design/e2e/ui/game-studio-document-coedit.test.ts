import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const templatesRoot = resolve(repoRoot, 'templates');
const documentFileName = 'gameplay-logic.nodegraph.json';

test('studio document JSON edits live-sync between collaborators', async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  collectPageIssues(page, 'systems-designer', consoleErrors, pageErrors);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Studio document coedit QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);
  const origin = new URL(page.url()).origin;
  const initialDoc = readTemplate(documentFileName);

  await writeProjectFile(page, projectId, documentFileName, initialDoc);
  await openStudioDocument(page, origin, projectId, documentFileName);

  let reviewerContext: BrowserContext | undefined;
  try {
    reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const reviewer = await reviewerContext.newPage();
    collectPageIssues(reviewer, 'game-director', consoleErrors, pageErrors);
    await openStudioDocument(reviewer, origin, projectId, documentFileName);

    await expect(page.getByRole('heading', { name: 'Gameplay Logic Graph' })).toBeVisible();
    await expect(reviewer.getByRole('heading', { name: 'Gameplay Logic Graph' })).toBeVisible();

    const retunedDoc = retuneNodeGraphForCoedit(JSON.parse(initialDoc));
    const retunedSource = JSON.stringify(retunedDoc, null, 2);
    await page.getByTestId('game-studio-document-source').fill(retunedSource);
    await page.getByTestId('game-studio-document-save').click();
    await expect(page.getByText(/Saved /)).toBeVisible();

    await expect(reviewer.getByRole('heading', { name: 'Gameplay Logic Graph - Coedit Review' })).toBeVisible({ timeout: 20_000 });
    await expect(reviewer.getByTestId('game-studio-document-source')).toHaveValue(/Remote co-edit pacing note/);
    await expect(reviewer.locator('body')).toContainText('Cooldown gate retuned with the Game Director before the bridge escalation.');

    await postStudioPresence(page, projectId, {
      actorName: 'Systems Designer',
      clientId: 'systems-designer-nodegraph-coedit',
      cursor: {
        column: 11,
        line: 64,
        selectionKind: 'node',
        selectionLabel: 'Remote co-edit pacing note',
      },
      filePath: documentFileName,
      mode: 'editing',
      surface: 'node-graph',
    });

    await expect(reviewer.getByTestId('studio-presence-rail')).toContainText('Systems Designer');
    await expect(reviewer.getByTestId('studio-presence-rail')).toContainText(documentFileName);
    await expect(reviewer.getByTestId('studio-presence-rail')).toContainText('Remote co-edit pacing note');

    await testInfo.attach('studio-document-coedit-author.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('studio-document-coedit-reviewer.png', {
      body: await reviewer.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    const authorLayout = await collectStudioDocumentCollaborationLayoutIssues(page);
    const reviewerLayout = await collectStudioDocumentCollaborationLayoutIssues(reviewer);
    expect(consoleErrors, 'console errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
    expect(authorLayout.horizontalOverflow, 'author horizontal overflow').toBeLessThanOrEqual(2);
    expect(reviewerLayout.horizontalOverflow, 'reviewer horizontal overflow').toBeLessThanOrEqual(2);
    expect(authorLayout.clippedChrome, 'author clipped editor chrome').toEqual([]);
    expect(reviewerLayout.clippedChrome, 'reviewer clipped editor chrome').toEqual([]);
    expect(reviewerLayout.clippedPresence, 'reviewer clipped presence chips').toEqual([]);
  } finally {
    await reviewerContext?.close();
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

async function openStudioDocument(
  page: Page,
  origin: string,
  projectId: string,
  fileName: string,
) {
  await page.goto(`${origin}/projects/${projectId}/files/${encodeURIComponent(fileName)}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissPrivacyPrompt(page);
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByTestId('game-studio-document-editor')).toBeVisible();
  await expect(page.getByTestId('game-studio-document-source')).toHaveValue(/Gameplay Logic Graph/);
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
    mode: 'editing';
    surface: 'node-graph';
  },
) {
  const response = await page.request.post(`/api/projects/${projectId}/presence`, {
    data,
  });
  expect(response.ok(), `${data.clientId} studio presence response`).toBeTruthy();
}

function retuneNodeGraphForCoedit(doc: any): any {
  return {
    ...doc,
    title: 'Gameplay Logic Graph - Coedit Review',
    nodes: [
      ...doc.nodes,
      {
        id: 'remote-coedit-note',
        title: 'Remote Co-edit Pacing Note',
        category: 'studio-collaboration',
        x: 1700,
        y: 520,
        description: 'Cooldown gate retuned with the Game Director before the bridge escalation.',
      },
    ],
    edges: [
      ...doc.edges,
      {
        id: 'edge-reward-coedit-note',
        from: 'grant-reward',
        to: 'remote-coedit-note',
        label: 'co-review note',
      },
    ],
    critiqueNotes: [
      ...doc.critiqueNotes,
      'Remote co-edit pacing note: review hazard cadence before the encounter ships.',
    ],
  };
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

function collectPageIssues(
  page: Page,
  label: string,
  consoleErrors: string[],
  pageErrors: string[],
) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`));
}

async function collectStudioDocumentCollaborationLayoutIssues(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

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
      clippedChrome,
      clippedPresence,
    };
  });
}
