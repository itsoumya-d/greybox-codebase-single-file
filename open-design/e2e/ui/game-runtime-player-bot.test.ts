import { expect, test, type Page } from '@playwright/test';

const playableFileName = 'runtime-player-bot.html';

test('browser player-bot drives a playable game artifact in the studio preview', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  collectPageIssues(page, consoleErrors, pageErrors);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, `Runtime player-bot QA ${Date.now()}`);
  await dismissPrivacyPrompt(page);
  const projectId = getProjectIdFromUrl(page);
  const appOrigin = new URL(page.url()).origin;

  await writeHtmlArtifact(page, projectId, playableFileName, runtimePlayableHtml());
  await page.goto(`${appOrigin}/projects/${projectId}/files/${encodeURIComponent(playableFileName)}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissPrivacyPrompt(page);
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();

  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.locator('[data-agds-id="runtime-title"]')).toContainText('Ashfall Runtime Probe');
  await expect(frame.locator('[data-testid="runtime-telemetry"]')).toContainText('phase=idle');

  await frame.getByRole('button', { name: 'Start Run' }).click();
  await expect(frame.locator('[data-testid="runtime-telemetry"]')).toContainText('phase=running');
  await expect(frame.locator('[data-testid="runtime-objective"]')).toContainText('Reach extraction checkpoint');

  await frame.locator('body').press('ArrowRight');
  await frame.locator('body').press('KeyD');
  await expect(frame.locator('[data-testid="runtime-telemetry"]')).toContainText('x=2');

  await frame.getByRole('button', { name: 'Attack Enemy' }).click();
  await expect(frame.locator('[data-testid="runtime-telemetry"]')).toContainText('attacks=1');
  await expect(frame.locator('[data-testid="runtime-hud"]')).toContainText('enemyPressure=90');

  await frame.getByRole('button', { name: 'Extract' }).click();
  await expect(frame.locator('[data-testid="runtime-telemetry"]')).toContainText('objective=complete');
  await expect(frame.locator('[data-testid="runtime-objective"]')).toContainText('Extraction complete');

  const botState = await frame.locator('[data-testid="runtime-state-json"]').textContent();
  expect(JSON.parse(botState ?? '{}')).toMatchObject({
    phase: 'complete',
    x: 2,
    attacks: 1,
    objective: 'complete',
  });

  await testInfo.attach('runtime-player-bot-preview.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  const layout = await collectPreviewLayoutIssues(page);
  expect(consoleErrors, 'console errors').toEqual([]);
  expect(pageErrors, 'page errors').toEqual([]);
  expect(layout.horizontalOverflow, 'horizontal overflow').toBeLessThanOrEqual(2);
  expect(layout.frameVisible, 'preview frame visible').toBe(true);
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

async function writeHtmlArtifact(page: Page, projectId: string, name: string, content: string) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name,
      content,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Runtime Player Bot',
        entry: name,
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(response.ok(), `${name} write response`).toBeTruthy();
}

function getProjectIdFromUrl(page: Page): string {
  const [, projects, projectId] = new URL(page.url()).pathname.split('/');
  expect(projects).toBe('projects');
  expect(projectId).toBeTruthy();
  return projectId!;
}

function collectPageIssues(page: Page, consoleErrors: string[], pageErrors: string[]) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
}

async function collectPreviewLayoutIssues(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const frame = document.querySelector('[data-testid="artifact-preview-frame"]');
    const rect = frame?.getBoundingClientRect();
    return {
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      frameVisible: Boolean(rect && rect.width > 240 && rect.height > 180),
    };
  });
}

function runtimePlayableHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Ashfall Runtime Probe</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; background: #070b11; color: #eef6ff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; grid-template-columns: 1fr 280px; background: #080d14; }
      canvas { width: 100%; height: 100%; min-height: 520px; background: linear-gradient(135deg, #131d2a, #1f1511); border: 0; }
      aside { padding: 18px; border-left: 1px solid rgba(132, 213, 255, 0.28); background: rgba(7, 11, 17, 0.92); }
      h1 { margin: 0 0 12px; font-size: 22px; letter-spacing: 0; }
      p, div { line-height: 1.45; }
      button { width: 100%; margin: 8px 0; padding: 10px 12px; border: 1px solid rgba(132, 213, 255, 0.5); border-radius: 8px; color: #eef6ff; background: #132235; font-weight: 800; }
      [data-testid="runtime-telemetry"], [data-testid="runtime-hud"], [data-testid="runtime-state-json"] { margin-top: 10px; padding: 10px; border: 1px solid rgba(132, 213, 255, 0.28); border-radius: 8px; color: #bfe8ff; background: rgba(132, 213, 255, 0.08); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    </style>
  </head>
  <body tabindex="0" aria-label="Playable combat runtime with keyboard controls">
    <canvas id="game" width="960" height="540" aria-label="Ashfall combat arena"></canvas>
    <aside id="hud" aria-label="HUD health stamina objective and enemy pressure">
      <h1 data-agds-id="runtime-title">Ashfall Runtime Probe</h1>
      <p data-testid="runtime-objective">Objective: reach extraction checkpoint.</p>
      <button type="button" data-player-action="start-run" aria-label="Start Run">Start Run</button>
      <button type="button" data-player-action="attack" aria-label="Attack Enemy">Attack Enemy</button>
      <button type="button" data-player-action="extract" aria-label="Extract">Extract</button>
      <div data-testid="runtime-hud">health=100; stamina=80; ammo=12; enemyPressure=100; subtitles=on; colorblind-safe=on</div>
      <div data-testid="runtime-telemetry">phase=idle; x=0; attacks=0; objective=reach-extraction</div>
      <div data-testid="runtime-state-json">{}</div>
    </aside>
    <script>
      const state = { phase: 'idle', x: 0, attacks: 0, health: 100, stamina: 80, enemyPressure: 100, objective: 'reach-extraction', ticks: 0 };
      const objective = document.querySelector('[data-testid="runtime-objective"]');
      const hud = document.querySelector('[data-testid="runtime-hud"]');
      const telemetry = document.querySelector('[data-testid="runtime-telemetry"]');
      const json = document.querySelector('[data-testid="runtime-state-json"]');
      function render() {
        objective.textContent = state.objective === 'complete' ? 'Extraction complete.' : 'Objective: Reach extraction checkpoint.';
        hud.textContent = 'health=' + state.health + '; stamina=' + state.stamina + '; ammo=12; enemyPressure=' + state.enemyPressure + '; subtitles=on; colorblind-safe=on';
        telemetry.textContent = 'phase=' + state.phase + '; x=' + state.x + '; attacks=' + state.attacks + '; objective=' + state.objective;
        json.textContent = JSON.stringify(state);
      }
      document.querySelector('[data-player-action="start-run"]').addEventListener('click', () => { state.phase = 'running'; render(); });
      document.querySelector('[data-player-action="attack"]').addEventListener('click', () => { state.attacks += 1; state.enemyPressure -= 10; render(); });
      document.querySelector('[data-player-action="extract"]').addEventListener('click', () => { state.phase = 'complete'; state.objective = 'complete'; render(); });
      window.addEventListener('keydown', (event) => {
        if (event.code === 'ArrowRight' || event.code === 'KeyD') {
          state.x += 1;
          state.stamina -= 1;
          render();
        }
      });
      window.addEventListener('touchstart', () => { state.phase = 'running'; render(); });
      function gameLoop() {
        state.ticks += 1;
        requestAnimationFrame(gameLoop);
      }
      render();
      gameLoop();
    </script>
  </body>
</html>`;
}
