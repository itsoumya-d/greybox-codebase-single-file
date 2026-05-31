import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const artifactFileName = 'encounter-review.html';

test('playable preview comments and studio presence sync across collaborators', async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  collectPageIssues(page, 'author', consoleErrors, pageErrors);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Studio collaboration QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);
  const appOrigin = new URL(page.url()).origin;

  await writeHtmlArtifact(page, projectId, artifactFileName, encounterReviewHtml());
  await openPlayablePreview(page, appOrigin, projectId, artifactFileName);
  await enableBoardComments(page);

  let reviewerContext: BrowserContext | undefined;
  try {
    reviewerContext = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const reviewer = await reviewerContext.newPage();
    collectPageIssues(reviewer, 'reviewer', consoleErrors, pageErrors);
    await openPlayablePreview(reviewer, appOrigin, projectId, artifactFileName);
    await enableBoardComments(reviewer);

    await page.getByTestId('comment-mode-toggle').click();
    const authorFrame = page.frameLocator('[data-testid="artifact-preview-frame"]');
    await authorFrame.locator('[data-agds-id="encounter-title"]').click();
    await expect(page.getByTestId('comment-popover')).toBeVisible();
    await page.getByTestId('comment-popover-input').fill('Clarify the phase-two flank timing before the bridge burns.');
    await page.getByTestId('comment-popover').getByRole('button', { name: 'Save comment' }).click();

    await expect(page.getByTestId('comment-saved-marker-encounter-title')).toBeVisible();
    await expect(reviewer.getByTestId('comment-saved-marker-encounter-title')).toBeVisible();
    await reviewer.getByTestId('comment-saved-marker-encounter-title').getByRole('button').click();
    await expect(reviewer.getByTestId('comment-popover')).toBeVisible();
    await expect(reviewer.getByTestId('comment-popover-input')).toHaveValue(
      'Clarify the phase-two flank timing before the bridge burns.',
    );

    await page.getByTestId('comment-popover').getByRole('button', { name: 'Close' }).click();
    await reviewer.getByTestId('comment-popover').getByRole('button', { name: 'Close' }).click();
    await writeHtmlArtifact(
      page,
      projectId,
      artifactFileName,
      encounterReviewHtml('Ashfall Gate Retuned Encounter'),
    );
    await expect(
      reviewer.frameLocator('[data-testid="artifact-preview-frame"]').locator('[data-agds-id="encounter-title"]'),
    ).toContainText('Ashfall Gate Retuned Encounter');
    await expect(reviewer.getByTestId('comment-saved-marker-encounter-title')).toBeVisible();

    await postStudioPresence(page, projectId, {
      actorName: 'Level Designer',
      clientId: 'level-designer-preview-review',
      cursor: {
        line: 24,
        column: 13,
        selectionKind: 'region',
        selectionLabel: 'Encounter title marker',
      },
      filePath: artifactFileName,
      mode: 'commenting',
      surface: 'html-preview',
    });

    await expect(page.getByTestId('studio-presence-rail')).toContainText('Level Designer');
    await expect(page.getByTestId('studio-presence-rail')).toContainText(artifactFileName);
    await expect(page.getByTestId('studio-presence-rail')).toContainText('Encounter title marker');
    await expect(reviewer.getByTestId('studio-presence-rail')).toContainText('Level Designer');
    await expect(reviewer.getByTestId('studio-presence-rail')).toContainText(artifactFileName);

    await testInfo.attach('game-studio-collaboration-author.png', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await testInfo.attach('game-studio-collaboration-reviewer.png', {
      body: await reviewer.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    const authorLayout = await collectCollaborationLayoutIssues(page);
    const reviewerLayout = await collectCollaborationLayoutIssues(reviewer);
    expect(consoleErrors, 'console errors').toEqual([]);
    expect(pageErrors, 'page errors').toEqual([]);
    expect(authorLayout.horizontalOverflow, 'author horizontal overflow').toBeLessThanOrEqual(2);
    expect(reviewerLayout.horizontalOverflow, 'reviewer horizontal overflow').toBeLessThanOrEqual(2);
    expect(authorLayout.clippedPresence, 'author clipped studio presence').toEqual([]);
    expect(reviewerLayout.clippedPresence, 'reviewer clipped studio presence').toEqual([]);
    expect(reviewerLayout.offscreenPopovers, 'reviewer comment popover bounds').toEqual([]);
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
        title: 'Encounter Review',
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
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.locator('[data-agds-id="encounter-title"]')).toContainText('Ashfall Gate Encounter');
}

async function enableBoardComments(page: Page) {
  await expect(page.getByTestId('board-mode-toggle')).toBeVisible();
  await page.getByTestId('board-mode-toggle').click();
  await expect(page.getByTestId('comment-mode-toggle')).toBeVisible();
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
      selectionKind: 'cursor' | 'range' | 'node' | 'region';
      selectionLabel: string;
    };
    filePath: string;
    mode: 'commenting' | 'editing' | 'reviewing' | 'viewing';
    surface: 'html-preview';
  },
) {
  const response = await page.request.post(`/api/projects/${projectId}/presence`, {
    data,
  });
  expect(response.ok(), `${data.clientId} studio presence response`).toBeTruthy();
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

async function collectCollaborationLayoutIssues(page: Page) {
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
    const offscreenPopovers = Array.from(document.querySelectorAll('[data-testid="comment-popover"]'))
      .filter(visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          top: rect.top,
        };
      })
      .filter((rect) => (
        rect.left < -2 ||
        rect.top < -2 ||
        rect.right > window.innerWidth + 2 ||
        rect.bottom > window.innerHeight + 2
      ));

    return {
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      clippedPresence,
      offscreenPopovers,
    };
  });
}

function encounterReviewHtml(title = 'Ashfall Gate Encounter'): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Encounter Review</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, system-ui, sans-serif;
        background: #05070c;
        color: #f7f4ea;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at 18% 10%, rgba(255, 92, 42, 0.26), transparent 30%),
          linear-gradient(135deg, #080b12 0%, #16202a 50%, #1d1410 100%);
      }
      main {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 48px;
      }
      .encounter-board {
        width: min(860px, calc(100vw - 72px));
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 6px;
        background: rgba(8, 12, 18, 0.78);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
        padding: 34px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 38px;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        max-width: 680px;
        color: #d8d6ca;
        font-size: 18px;
        line-height: 1.55;
      }
      .lane-map {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin-top: 28px;
      }
      .lane-map span {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.07);
        color: #f4e0a6;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="encounter-board" data-agds-id="encounter-board" data-agds-label="Bridge combat space">
        <h1 data-agds-id="encounter-title" data-agds-label="Encounter title">${title}</h1>
        <p data-agds-id="encounter-copy" data-agds-label="Encounter objective">
          Hold the fractured bridge while ember scouts flank from the lower kiln path and the boss phase burns away cover.
        </p>
        <div class="lane-map" data-agds-id="lane-map" data-agds-label="Three-lane combat layout">
          <span data-agds-id="left-flank" data-agds-label="Left flank route">Stealth flank</span>
          <span data-agds-id="center-lane" data-agds-label="Center clash lane">Shield clash</span>
          <span data-agds-id="right-reward" data-agds-label="Right reward pocket">Loot pocket</span>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
