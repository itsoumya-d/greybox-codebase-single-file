import { expect, test, type BrowserContext, type Page, type Response } from '@playwright/test';
import {
  createFakeAgentRuntimes,
} from '@/playwright/fake-agents';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const templatesRoot = resolve(repoRoot, 'templates');
const documentFileName = 'gameplay-logic.nodegraph.json';
const storageKey = 'ai-game-design-studio:config';

let fakeRuntimes: Awaited<ReturnType<typeof createFakeAgentRuntimes>>;

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes(['codex']);
});

test('studio document cursor presence reaches a second tab through realtime awareness', async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let interceptedRestPresencePosts = 0;
  collectPageIssues(page, 'systems-designer', consoleErrors, pageErrors);
  await interceptRestPresenceWrites(page, () => {
    interceptedRestPresencePosts += 1;
  });

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Realtime presence QA ${Date.now()}`);
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

    const source = page.getByTestId('game-studio-document-source');
    await source.scrollIntoViewIfNeeded();
    await source.click();
    await source.press('End');
    await source.press('ArrowUp');

    const observedAt = Date.now();
    const rail = reviewer.getByTestId('studio-presence-rail');
    await expect(rail).toBeVisible({ timeout: 10_000 });
    await expect(rail).toContainText('Studio collaborator');
    await expect(rail).toContainText(documentFileName);
    await expect(rail).toContainText('JSON Source');

    const realtimeLatencyMs = Date.now() - observedAt;
    await testInfo.attach('realtime-presence-latency.json', {
      body: Buffer.from(JSON.stringify({ realtimeLatencyMs, interceptedRestPresencePosts }, null, 2)),
      contentType: 'application/json',
    });
    await testInfo.attach('realtime-presence-author.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('realtime-presence-reviewer.png', {
      body: await reviewer.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(interceptedRestPresencePosts, 'author REST presence writes were intercepted').toBeGreaterThan(0);
    const authorLayout = await collectRealtimePresenceLayoutIssues(page);
    const reviewerLayout = await collectRealtimePresenceLayoutIssues(reviewer);
    expect(consoleErrors, 'console errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
    expect(authorLayout.horizontalOverflow, 'author horizontal overflow').toBeLessThanOrEqual(2);
    expect(reviewerLayout.horizontalOverflow, 'reviewer horizontal overflow').toBeLessThanOrEqual(2);
    expect(reviewerLayout.clippedPresence, 'reviewer clipped presence chips').toEqual([]);
  } finally {
    await reviewerContext?.close();
  }
});

test('collaborator sees AGENT chip through realtime awareness while author run is active', async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  collectPageIssues(page, 'author', consoleErrors, pageErrors);

  await resetDaemonAppConfig(page);
  await configureFakeAgent(page);
  await seedBrowserAgentConfig(page);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Realtime agent writing QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);
  const origin = new URL(page.url()).origin;

  let reviewerContext: BrowserContext | undefined;
  try {
    reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const reviewer = await reviewerContext.newPage();
    collectPageIssues(reviewer, 'reviewer', consoleErrors, pageErrors);
    await seedBrowserAgentConfig(reviewer);
    await reviewer.goto(`${origin}/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await dismissPrivacyPrompt(reviewer);
    await expect(reviewer.getByTestId('file-workspace')).toBeVisible({ timeout: 30_000 });

    await sendPrompt(page, 'Hold AGENT writing smoke so the collaborator can see the remote AI writing chip.');
    const agentChip = reviewer.getByTestId('studio-presence-rail').getByLabel('AGENT');
    await expect(agentChip).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('fake-agent-runtime-codex.html', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(agentChip).toBeHidden({ timeout: 20_000 });

    await testInfo.attach('realtime-agent-writing-author.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('realtime-agent-writing-reviewer.png', {
      body: await reviewer.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(consoleErrors, 'console errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
  } finally {
    await reviewerContext?.close();
    await resetDaemonAppConfig(page);
  }
});

async function interceptRestPresenceWrites(page: Page, onIntercept: () => void) {
  await page.route(/\/api\/(?:game-deliverables|projects)\/[^/]+\/presence$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    onIntercept();
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ presence: null }),
    });
  });
}

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

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveValue(prompt);
  await expect(sendButton).toBeEnabled();
  const chatResponse = page.waitForResponse(isCreateRunResponse);
  await sendButton.click();
  const response = await chatResponse;
  expect(response.ok()).toBeTruthy();
}

async function configureFakeAgent(page: Page) {
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { codex: fakeRuntimes.codex.env },
      skillId: null,
      gameArtBibleId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function seedBrowserAgentConfig(page: Page) {
  await page.addInitScript(({ key, codexEnv }) => {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          mode: 'daemon',
          apiKey: '',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5',
          agentId: 'codex',
          skillId: null,
          gameArtBibleId: null,
          onboardingCompleted: true,
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          agentCliEnv: { codex: codexEnv },
        }),
      );
    } catch {
      // Sandboxed artifact iframes intentionally lack localStorage.
    }
  }, { key: storageKey, codexEnv: fakeRuntimes.codex.env });
}

async function resetDaemonAppConfig(page: Page) {
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'mock',
      agentModels: {},
      agentCliEnv: {},
      skillId: null,
      gameArtBibleId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
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
  await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('game-studio-document-editor')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('game-studio-document-source')).toHaveValue(/Gameplay Logic Graph/, { timeout: 30_000 });
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

function isCreateRunResponse(response: Response): boolean {
  const url = new URL(response.url());
  return url.pathname === '/api/runs' && response.request().method() === 'POST';
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

async function collectRealtimePresenceLayoutIssues(page: Page) {
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
