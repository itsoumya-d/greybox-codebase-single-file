// SPDX-License-Identifier: Apache-2.0

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test('TodoWrite plan claims propagate between two live project tabs', async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  collectPageIssues(page, 'planner', consoleErrors, pageErrors);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Realtime TodoWrite QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);
  const origin = new URL(page.url()).origin;
  const conversationId = await firstConversationId(page, projectId);
  await seedTodoWriteMessage(page, projectId, conversationId);
  await page.goto(`${origin}/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await dismissPrivacyPrompt(page);
  await expect(page.getByRole('button', { name: 'Claim Build HUD import' })).toBeVisible({ timeout: 20_000 });

  let reviewerContext: BrowserContext | undefined;
  try {
    reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const reviewer = await reviewerContext.newPage();
    collectPageIssues(reviewer, 'reviewer', consoleErrors, pageErrors);
    await reviewer.goto(`${origin}/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await dismissPrivacyPrompt(reviewer);
    await expect(reviewer.getByRole('button', { name: 'Claim Build HUD import' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Claim Build HUD import' }).click();
    await expect(page.getByRole('button', { name: 'Release Build HUD import' })).toBeVisible();
    await expect(todoRow(reviewer, 'Build HUD import').getByText('Claimed')).toBeVisible({ timeout: 10_000 });
    await expect(reviewer.getByRole('button', { name: 'Claim Build HUD import' })).toBeHidden();

    await page.getByRole('button', { name: 'Release Build HUD import' }).click();
    await expect(reviewer.getByRole('button', { name: 'Claim Build HUD import' })).toBeVisible({ timeout: 10_000 });

    await testInfo.attach('realtime-todos-planner.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('realtime-todos-reviewer.png', {
      body: await reviewer.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(consoleErrors, 'console errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
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

async function firstConversationId(page: Page, projectId: string): Promise<string> {
  const response = await page.request.get(`/api/game-deliverables/${projectId}/conversations`);
  expect(response.ok(), 'conversation list response').toBeTruthy();
  const body = (await response.json()) as { conversations: Array<{ id: string }> };
  const conversationId = body.conversations[0]?.id;
  expect(conversationId, 'default conversation id').toBeTruthy();
  return conversationId!;
}

async function seedTodoWriteMessage(page: Page, projectId: string, conversationId: string) {
  const now = Date.now();
  const message = {
    id: `todo-plan-${now}`,
    role: 'assistant',
    content: '',
    agentName: 'Greybox Planner',
    runStatus: 'succeeded',
    startedAt: now - 1000,
    endedAt: now,
    events: [
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Build HUD import', status: 'pending' },
            { content: 'Run Unity sample QA', status: 'pending' },
          ],
        },
      },
    ],
  };
  const response = await page.request.put(
    `/api/game-deliverables/${projectId}/conversations/${conversationId}/messages/${message.id}`,
    { data: message },
  );
  expect(response.ok(), 'seed TodoWrite message response').toBeTruthy();
}

function getProjectIdFromUrl(page: Page): string {
  const [, projects, projectId] = new URL(page.url()).pathname.split('/');
  expect(projects).toBe('projects');
  expect(projectId).toBeTruthy();
  return projectId!;
}

function todoRow(page: Page, body: string) {
  return page.locator('.todo-item', { hasText: body });
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
