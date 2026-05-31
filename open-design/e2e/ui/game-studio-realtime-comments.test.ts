// SPDX-License-Identifier: Apache-2.0

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const artifactFileName = 'realtime-comment-board.html';

test('preview comments sync through realtime comments when project-event SSE is unavailable', async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  let blockedReviewerCommentFetches = 0;
  collectPageIssues(page, 'author', consoleErrors, pageErrors);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Realtime comments QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);
  const origin = new URL(page.url()).origin;

  await writeHtmlArtifact(page, projectId, artifactFileName, realtimeCommentHtml());
  await openPlayablePreview(page, origin, projectId, artifactFileName);
  await enableBoardComments(page);

  let reviewerContext: BrowserContext | undefined;
  try {
    reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const reviewer = await reviewerContext.newPage();
    collectPageIssues(reviewer, 'reviewer', consoleErrors, pageErrors);
    await disableProjectEvents(reviewer);
    await reviewer.route(/\/api\/game-deliverables\/[^/]+\/conversations\/[^/]+\/comments$/, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      blockedReviewerCommentFetches += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comments: [] }),
      });
    });
    await openPlayablePreview(reviewer, origin, projectId, artifactFileName);
    await enableBoardComments(reviewer);

    await page.getByTestId('comment-mode-toggle').click();
    const authorFrame = page.frameLocator('[data-testid="artifact-preview-frame"]');
    await authorFrame.locator('[data-agds-id="boss-health"]').click();
    await expect(page.getByTestId('comment-popover')).toBeVisible();
    await page.getByTestId('comment-popover-input').fill('Move the boss HP readout closer to the action lane.');
    await page.getByTestId('comment-popover').getByRole('button', { name: 'Save comment' }).click();

    await expect(page.getByTestId('comment-saved-marker-boss-health')).toBeVisible();
    await expect(reviewer.getByTestId('comment-saved-marker-boss-health')).toBeVisible({ timeout: 10_000 });
    await expect(reviewer.getByRole('tab', { name: 'Comments (1 new)' })).toBeVisible();
    await expect(reviewer.getByTestId('comment-notification-badge')).toContainText('1');

    await reviewer.getByTestId('comment-saved-marker-boss-health').getByRole('button').click();
    await expect(reviewer.getByTestId('comment-popover-input')).toHaveValue(
      'Move the boss HP readout closer to the action lane.',
    );

    await reviewer.reload({ waitUntil: 'domcontentloaded' });
    await dismissPrivacyPrompt(reviewer);
    await enableBoardComments(reviewer);
    await expect(reviewer.getByTestId('comment-saved-marker-boss-health')).toBeVisible({ timeout: 10_000 });

    await reviewer.getByRole('tab', { name: /comments/i }).click();
    await expect(reviewer.getByRole('tab', { name: 'Comments' })).toBeVisible();
    await expect(reviewer.getByTestId('comment-notification-badge')).toBeHidden();
    await expect(reviewer.getByTestId('comment-card-boss-health')).toBeVisible();
    await expect(reviewer.getByTestId('comment-status-boss-health')).toContainText('open');
    await reviewer.getByTestId('comment-reply-input-boss-health').fill('Use a controller-safe boss HP meter treatment.');
    await reviewer.getByTestId('comment-reply-submit-boss-health').click();
    await expect(reviewer.getByTestId('comment-thread-boss-health')).toContainText('controller-safe boss HP');

    await page.getByRole('tab', { name: /comments/i }).click();
    await expect(page.getByTestId('comment-thread-boss-health')).toContainText('controller-safe boss HP', { timeout: 10_000 });

    await reviewer.getByTestId('comment-status-toggle-boss-health').click();
    await expect(reviewer.getByTestId('comment-status-boss-health')).toContainText('Resolved');
    await expect(reviewer.getByTestId('comment-status-toggle-boss-health')).toContainText('Reopen');

    await expect(page.getByTestId('comment-status-boss-health')).toContainText('Resolved', { timeout: 10_000 });

    await testInfo.attach('realtime-comments-author.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('realtime-comments-reviewer.png', {
      body: await reviewer.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(blockedReviewerCommentFetches, 'reviewer REST comment reads were forced empty').toBeGreaterThan(0);
    expect(consoleErrors, 'console errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
  } finally {
    await reviewerContext?.close();
  }
});

async function disableProjectEvents(page: Page) {
  await page.addInitScript(() => {
    class SilentEventSource extends EventTarget {
      readonly url: string;
      readonly withCredentials = false;
      readyState = 1;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string | URL) {
        super();
        this.url = String(url);
        window.setTimeout(() => {
          const event = new Event('open');
          this.onopen?.(event);
          this.dispatchEvent(event);
        }, 0);
      }

      close() {
        this.readyState = 2;
      }
    }

    window.EventSource = SilentEventSource as typeof EventSource;
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

async function writeHtmlArtifact(
  page: Page,
  projectId: string,
  name: string,
  content: string,
) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name,
      content,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Realtime Comment Board',
        entry: name,
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(response.ok(), `${name} write response`).toBeTruthy();
}

async function openPlayablePreview(
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
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="artifact-preview-frame"]').locator('[data-agds-id="boss-health"]'),
  ).toContainText('Boss HP');
}

async function enableBoardComments(page: Page) {
  await expect(page.getByTestId('board-mode-toggle')).toBeVisible();
  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('comment-mode-toggle')).toBeVisible();
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

function realtimeCommentHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Realtime Comment Board</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #05070c; color: #f7f4ea; }
      body { margin: 0; min-height: 100vh; background: linear-gradient(135deg, #080b12 0%, #16202a 54%, #2a1710 100%); }
      main { display: grid; min-height: 100vh; place-items: center; padding: 48px; }
      .board { width: min(780px, calc(100vw - 72px)); border: 1px solid rgba(255,255,255,.16); border-radius: 6px; background: rgba(8,12,18,.82); padding: 34px; }
      h1 { margin: 0 0 18px; font-size: 40px; letter-spacing: 0; }
      .hud { display: flex; gap: 16px; align-items: center; }
      .meter { min-width: 180px; padding: 16px 18px; border-radius: 4px; background: rgba(255,107,53,.16); border: 1px solid rgba(255,107,53,.44); }
    </style>
  </head>
  <body>
    <main>
      <section class="board" data-agds-id="encounter-board">
        <h1 data-agds-id="encounter-title">Ashfall Gate Realtime Review</h1>
        <div class="hud">
          <div class="meter" data-agds-id="boss-health">Boss HP: 3 hits</div>
          <div class="meter" data-agds-id="phase-timer">Phase timer: 45s</div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
