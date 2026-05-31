import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const STORAGE_KEY = 'ai-game-design-studio:config';

const GAME_ART_BIBLES = [
  {
    id: 'sci-fi-tactical',
    title: 'Sci-Fi Tactical',
    category: 'Game Art Direction',
    summary: 'Readable tactical HUD framework for squad combat.',
    swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
  },
  {
    id: 'horror-noir',
    title: 'Horror Noir',
    category: 'Game Art Direction',
    summary: 'High-contrast survival-horror lighting language with readable interactables.',
    swatches: ['#111111', '#F6EFE6', '#C44536', '#F2C14E'],
  },
  {
    id: 'live-ops-console',
    title: 'Live-Ops Console',
    category: 'Game Control Center',
    summary: 'Calm telemetry system for balance and retention boards.',
    swatches: ['#EAF4F4', '#5EAAA8', '#05668D', '#0B132B'],
  },
];

const TAB_SKILLS = [
  skillSummary('playable-concept-skill', 'Playable Concept Skill', 'prototype', 'web', ['prototype']),
  skillSummary('live-ops-board', 'Live Ops Board', 'prototype', 'web', []),
  skillSummary('gdd-deck-skill', 'GDD Deck Skill', 'deck', 'web', ['deck']),
  skillSummary('key-art-image-skill', 'Key Art Image Skill', 'image', 'image', ['image']),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        gameArtBibleId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          gameArtBibleId: null,
          agentModels: {},
          agentCliEnv: {},
        },
      },
    });
  });

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });

  await routeGameArtBibles(page);
});

test('new project tabs switch visible form sections and preserve drafts', async ({ page }) => {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: TAB_SKILLS } });
  });
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: {} } });
  });

  await page.goto('/');
  await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New playable game prototype');
  await expect(page.getByTestId('game-art-bible-trigger')).toBeVisible();
  await expect(page.getByText('Fidelity', { exact: true })).toBeVisible();
  await page.getByTestId('new-project-name').fill('Playable concept draft survives');

  await page.getByTestId('new-project-tab-live-artifact').click();
  await expect(page.getByTestId('new-project-tab-live-artifact')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New game live-ops control center');
  await expect(page.locator('.newproj-title')).toContainText('Beta');
  await expect(page.getByTestId('game-art-bible-picker')).toHaveCount(0);
  await expect(page.getByTestId('new-project-connectors')).toBeVisible();
  await expect(page.getByTestId('create-project')).toContainText('Create live-ops center');

  await page.getByTestId('new-project-tab-deck').click();
  await expect(page.getByTestId('new-project-tab-deck')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New game pitch / GDD deck');
  await expect(page.getByTestId('game-art-bible-trigger')).toBeVisible();
  await expect(page.getByText('Use pitch notes')).toBeVisible();
  await expect(page.getByTestId('new-project-connectors')).toHaveCount(0);

  await page.getByTestId('new-project-tab-prototype').click();
  await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New playable game prototype');
  await expect(page.getByTestId('new-project-name')).toHaveValue('Playable concept draft survives');

  await page.getByRole('button', { name: 'Scroll project types right' }).click();
  await page.getByTestId('new-project-tab-image').click();
  await expect(page.getByTestId('new-project-tab-image')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New game asset image');
  await expect(page.getByTestId('game-art-bible-picker')).toHaveCount(0);
  await expect(page.getByText('Model', { exact: true })).toBeVisible();
  await expect(page.getByText('Aspect', { exact: true })).toBeVisible();
});

test('game art bible multi-select stores primary and inspiration metadata', async ({ page }) => {
  await routeGameArtBibles(page);

  await page.goto('/');
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Game art bible multi select metadata');
  await expect(page.getByTestId('game-art-bible-trigger')).toContainText('Sci-Fi Tactical');

  await page.getByTestId('game-art-bible-trigger').click();
  const multiTab = page.getByRole('tab', { name: /multi/i });
  await multiTab.click();
  await expect(multiTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: /Horror Noir/i }).click();
  await page.getByRole('option', { name: /Live-Ops Console/i }).click();

  await expect(page.getByTestId('game-art-bible-trigger')).toContainText('Sci-Fi Tactical');
  await expect(page.getByTestId('game-art-bible-trigger')).toContainText('+2');
  await page.keyboard.press('Escape');
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const project = await fetchCurrentProject(page);
  expect(project.gameArtBibleId).toBe('sci-fi-tactical');
  expect(project.metadata?.inspirationGameArtBibleIds).toEqual([
    'horror-noir',
    'live-ops-console',
  ]);
});

test('game art bible picker searches and switches the single selected system', async ({ page }) => {
  await routeGameArtBibles(page);

  await page.goto('/');
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Game art bible single switch flow');
  await expect(page.getByTestId('game-art-bible-trigger')).toBeVisible();

  await page.getByTestId('game-art-bible-trigger').click();
  await page.getByTestId('game-art-bible-search').fill('ops');
  await expect(page.getByRole('option', { name: /Live-Ops Console/i })).toBeVisible();
  await expect(page.getByRole('option', { name: /Sci-Fi Tactical/i })).toHaveCount(0);
  await page.getByRole('option', { name: /Live-Ops Console/i }).click();

  await expect(page.getByTestId('game-art-bible-trigger')).toContainText('Live-Ops Console');
  await expect(page.getByTestId('game-art-bible-trigger')).toContainText('Game Control Center');
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const project = await fetchCurrentProject(page);
  expect(project.gameArtBibleId).toBe('live-ops-console');
  expect(project.metadata?.inspirationGameArtBibleIds).toBeUndefined();
});

test('project title rename persists after reload and ignores blank titles', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Original rename title');
  await expectWorkspaceReady(page);

  const title = page.getByTestId('project-title');
  await renameProjectTitle(page, title, 'Renamed persistent title');
  await expect(title).toContainText('Renamed persistent title');

  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('project-title')).toContainText('Renamed persistent title');

  await renameProjectTitle(page, page.getByTestId('project-title'), '   ');
  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('project-title')).toContainText('Renamed persistent title');

  const project = await fetchCurrentProject(page);
  expect(project.name).toBe('Renamed persistent title');
});

test('canceling studio file deletion keeps the file and open tab', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Studio file delete cancel flow');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyPng(page, 'delete-cancel.png');
  const fileTab = tabBySuffix(page, uploadedName);
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('delete-cancel.png');
    await dialog.dismiss();
  });
  await page.getByTestId('game-files-tab').click();
  await rowByFileName(page, uploadedName).hover();
  await menuByFileName(page, uploadedName).click();
  await page.getByTestId(`game-file-delete-${uploadedName}`).click();

  await expect(rowByFileName(page, uploadedName)).toBeVisible();
  await expect(fileTab).toBeVisible();

  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  expect(files.map((file) => file.name)).toContain(uploadedName);
});

test('home game card deletion supports cancel and confirm flows', async ({ page }) => {
  const projectName = `Home delete game flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  const gameProjectCard = homeGameProjectCard(page, projectName);
  await expect(gameProjectCard).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(projectName);
    await dialog.dismiss();
  });
  await gameProjectCard.hover();
  await gameProjectCard.getByRole('button', { name: new RegExp(`delete project ${escapeRegExp(projectName)}`, 'i') }).click();
  await expect(gameProjectCard).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(projectName);
    await dialog.accept();
  });
  await gameProjectCard.hover();
  await gameProjectCard.getByRole('button', { name: new RegExp(`delete project ${escapeRegExp(projectName)}`, 'i') }).click();
  await expect(homeGameProjectCard(page, projectName)).toHaveCount(0);

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.status()).toBe(404);
});

test('home games view toggle switches between grid and kanban and persists', async ({ page }) => {
  const projectName = `Home view toggle flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(homeGameProjectCard(page, projectName)).toBeVisible();
  await expect(page.locator('.game-projects-grid')).toBeVisible();
  await expect(page.locator('.game-projects-kanban-board')).toHaveCount(0);
  await expect(page.getByTestId('game-projects-view-grid')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('game-projects-view-kanban').click();
  await expect(page.locator('.game-projects-kanban-board')).toBeVisible();
  await expect(page.locator('.game-projects-grid')).toHaveCount(0);
  await expect(page.getByTestId('game-projects-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.game-projects-kanban-card', { hasText: projectName })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.locator('.game-projects-kanban-board')).toBeVisible();
  await expect(page.getByTestId('game-projects-view-kanban')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('game-projects-view-grid').click();
  await expect(page.locator('.game-projects-grid')).toBeVisible();
  await expect(homeGameProjectCard(page, projectName)).toBeVisible();
  await expect(page.getByTestId('game-projects-view-grid')).toHaveAttribute('aria-pressed', 'true');
});

test('home games search filters projects and recovers from no results', async ({ page }) => {
  const stamp = Date.now();
  const alphaName = `Home search alpha ${stamp}`;
  const betaName = `Home search beta ${stamp}`;
  await page.goto('/');

  await createProject(page, alphaName);
  await expectWorkspaceReady(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  await createProject(page, betaName);
  await expectWorkspaceReady(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(homeGameProjectCard(page, alphaName)).toBeVisible();
  await expect(homeGameProjectCard(page, betaName)).toBeVisible();

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('alpha');
  await expect(homeGameProjectCard(page, alphaName)).toBeVisible();
  await expect(homeGameProjectCard(page, betaName)).toHaveCount(0);

  await search.fill(`missing-${stamp}`);
  await expect(homeGameProjectCard(page, alphaName)).toHaveCount(0);
  await expect(homeGameProjectCard(page, betaName)).toHaveCount(0);
  await expect(page.locator('.tab-empty')).toBeVisible();

  await search.fill('');
  await expect(homeGameProjectCard(page, alphaName)).toBeVisible();
  await expect(homeGameProjectCard(page, betaName)).toBeVisible();
});

test('change pet opens pet settings and updates the custom companion draft', async ({ page }) => {
  await seedAdoptedPet(page);
  await page.route('**/api/codex-pets', async (route) => {
    await route.fulfill({ json: { pets: [], rootDir: '' } });
  });

  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  await page
    .locator('.entry-side-foot')
    .getByRole('button', { name: /change pet/i })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { level: 3, name: 'Pets' })).toBeVisible();

  await dialog.getByRole('tab', { name: 'Custom' }).click();
  const customPanel = dialog.locator('.pet-custom');
  await expect(customPanel).toBeVisible();

  await customPanel.getByLabel('Name').fill('QA Turtle');
  await customPanel.getByLabel('Glyph').fill('🐢');
  await customPanel.getByLabel('Greeting').fill('Shell yeah, tests are green.');
  await expect(customPanel.getByText('QA Turtle')).toBeVisible();
  await expect(customPanel.getByText('Shell yeah, tests are green.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

async function createProject(
  page: Page,
  projectName: string,
) {
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
}

async function routeGameArtBibles(page: Page) {
  await page.route('**/api/game-art-bibles', async (route) => {
    await route.fulfill({ json: { gameArtBibles: GAME_ART_BIBLES } });
  });
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByText('Design a game')).toBeVisible();
}

async function renameProjectTitle(
  page: Page,
  title: Locator,
  nextName: string,
) {
  await title.click();
  await page.keyboard.press('Meta+A');
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  if (selected.length === 0) {
    await page.keyboard.press('Control+A');
  }
  await page.keyboard.type(nextName);
  await page.keyboard.press('Enter');
}

async function uploadTinyPng(
  page: Page,
  name: string,
): Promise<string> {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByTestId('game-files-upload-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(tabBySuffix(page, name)).toBeVisible();
  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  const uploaded = files.find((file) => file.name.endsWith(name));
  expect(uploaded?.name).toBeTruthy();
  return uploaded!.name;
}

function tabBySuffix(page: Page, name: string): Locator {
  return page.getByRole('tab', { name: new RegExp(`${escapeRegExp(name)}$`, 'i') });
}

function rowByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`game-file-row-${name}`);
}

function menuByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`game-file-menu-${name}`);
}

function homeGameProjectCard(page: Page, name: string): Locator {
  return page.locator('.game-project-card', {
    has: page.locator('.game-project-card-name', { hasText: name }),
  });
}

async function seedAdoptedPet(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        gameArtBibleId: null,
        onboardingCompleted: true,
        agentModels: {},
        pet: {
          adopted: true,
          enabled: true,
          petId: 'custom',
          custom: {
            name: 'Original Buddy',
            glyph: '🦄',
            accent: '#c96442',
            greeting: 'Ready to pair.',
          },
        },
      }),
    );
  }, STORAGE_KEY);
}

async function fetchCurrentProject(page: Page) {
  const { projectId } = getProjectContextFromUrl(page);
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      name: string;
      gameArtBibleId: string | null;
      metadata?: {
        inspirationGameArtBibleIds?: string[];
      };
    };
  };
  return body.project;
}

async function listProjectFiles(page: Page, projectId: string) {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { files: Array<{ name: string }> };
  return body.files;
}

function getProjectContextFromUrl(page: Page) {
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  return { projectId };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skillSummary(
  id: string,
  name: string,
  mode: 'prototype' | 'deck' | 'image',
  surface: 'web' | 'image',
  defaultFor: string[],
) {
  return {
    id,
    name,
    description: `${name} for tab switching coverage.`,
    triggers: [],
    mode,
    surface,
    platform: 'desktop',
    scenario: 'qa',
    previewType: 'html',
    gameArtBibleRequired: mode !== 'image',
    defaultFor,
    upstream: null,
    featured: null,
    fidelity: null,
    speakerNotes: null,
    animations: null,
    hasBody: true,
    examplePrompt: '',
  };
}
