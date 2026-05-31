import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const STORAGE_KEY = 'ai-game-design-studio:config';

const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    provider: 'composio',
    category: 'Developer tools',
    description: 'Read repository issues and pull requests.',
    status: 'available',
    auth: { provider: 'composio', configured: true },
    tools: [
      {
        name: 'list_issues',
        title: 'List issues',
        description: 'List recent issues from a repository.',
        safety: {
          sideEffect: 'read',
          approval: 'auto',
          reason: 'Read-only issue lookup.',
        },
        refreshEligible: true,
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    provider: 'composio',
    category: 'Communication',
    description: 'Search channels and messages.',
    status: 'connected',
    accountLabel: 'game-studio-team',
    auth: { provider: 'composio', configured: true },
    tools: [],
  },
];

const IMAGE_TEMPLATE = {
  id: 'game-key-art-poster',
  surface: 'image',
  title: 'Game Key Art Poster',
  summary: 'A punchy key art poster for a boss encounter reveal.',
  category: 'Game Key Art',
  tags: ['key art', 'boss', 'poster'],
  model: 'gpt-image-1',
  aspect: '4:5',
  source: {
    repo: 'ai-game-design-studio/test-prompts',
    license: 'MIT',
    author: 'AI Game Design Studio QA',
  },
};

async function readSavedConfig(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

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
});

test('prompt template retry preserves the edited body in project metadata', async ({ page }) => {
  await routeDefaultAppConfig(page);
  await routeNewProjectDefaults(page);

  let detailRequests = 0;
  await page.route('**/api/prompt-templates', async (route) => {
    await route.fulfill({ json: { promptTemplates: [IMAGE_TEMPLATE] } });
  });
  await page.route('**/api/prompt-templates/image/game-key-art-poster', async (route) => {
    detailRequests += 1;
    if (detailRequests === 1) {
      await route.fulfill({ status: 500, body: 'template unavailable' });
      return;
    }
    await route.fulfill({
      json: {
        promptTemplate: {
          ...IMAGE_TEMPLATE,
          prompt: 'Original key art prompt with dramatic lighting and boss silhouette.',
        },
      },
    });
  });

  await gotoEntryHome(page);
  await page.getByTestId('new-project-tab-image').click();
  await page.getByTestId('new-project-name').fill('Prompt template retry metadata');

  await page.getByTestId('prompt-template-trigger').click();
  await page.getByTestId('prompt-template-search').fill('poster');
  await page.getByRole('option', { name: /Game Key Art Poster/i }).click();

  await expect(page.getByTestId('prompt-template-error')).toBeVisible();
  await page.getByTestId('prompt-template-retry').click();
  await expect(page.getByTestId('prompt-template-error')).toHaveCount(0);
  await expect(page.getByTestId('prompt-template-body')).toContainText('Original key art prompt');

  await page.getByTestId('prompt-template-body').fill('');
  await expect(page.getByTestId('prompt-template-empty-hint')).toBeVisible();
  await page.getByTestId('prompt-template-body').fill(
    'Edited QA prompt: bold key art poster, one boss silhouette, crisp game title.',
  );
  await page.getByTestId('create-project').click();

  const project = await fetchCurrentProject(page);
  expect(project.metadata?.promptTemplate).toMatchObject({
    id: 'game-key-art-poster',
    surface: 'image',
    title: 'Game Key Art Poster',
    prompt: 'Edited QA prompt: bold key art poster, one boss silhouette, crisp game title.',
  });
});

test('live game artifact empty connector action opens the gated connector setup path', async ({ page }) => {
  await routeConnectors(page, []);
  await routeComposioConfig(page, { configured: false, apiKeyTail: '' });

  await gotoEntryHome(page);
  await page.getByTestId('new-project-tab-live-artifact').click();
  await expect(page.getByTestId('new-project-connectors')).toBeVisible();

  // The empty action now opens Settings → Connectors directly. The Composio API
  // key field sits at the top of the section; the catalog (and its gate)
  // sits below it.
  await page.getByTestId('new-project-connectors-empty').click();
  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  await expect(
    settingsDialog.getByRole('heading', { level: 3, name: 'Connectors' }),
  ).toBeVisible();
  await expect(settingsDialog.getByPlaceholder('Paste Composio API key')).toBeVisible();
  await expect(settingsDialog.getByTestId('connector-gate')).toBeVisible();
  await expect(settingsDialog.getByTestId('connectors-search-input')).toBeDisabled();
});

test('connectors search supports empty results and keyboard-closeable details', async ({ page }) => {
  await routeConnectors(page, CONNECTORS);
  await routeComposioConfig(page, { configured: true, apiKeyTail: '1234' });
  await page.addInitScript((key) => {
    const next = {
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: 'mock',
      skillId: null,
      gameArtBibleId: null,
      onboardingCompleted: true,
      agentModels: {},
      composio: {
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: '1234',
      },
    };
    window.localStorage.setItem(key, JSON.stringify(next));
  }, STORAGE_KEY);

  await page.goto('/');
  // Connector cards + search now live under Settings → Connectors. Open the
  // settings dialog via the entry sidebar's "Configure execution mode" pill
  // and switch to the Connectors section before exercising the
  // search/empty/details flow.
  await page.getByRole('button', { name: 'Configure execution mode' }).click();
  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: /^Connectors\b/ }).click();
  await expect(settingsDialog.getByTestId('connector-grid-wrap')).toBeVisible();

  const search = settingsDialog.getByTestId('connectors-search-input');
  await search.fill('git');
  await expect(connectorCard(settingsDialog, 'github')).toBeVisible();
  await expect(connectorCard(settingsDialog, 'slack')).toHaveCount(0);

  await search.fill('missing connector');
  await expect(settingsDialog.getByTestId('connectors-empty')).toBeVisible();
  await settingsDialog.getByTestId('connectors-search-clear').click();
  await expect(settingsDialog.getByTestId('connectors-empty')).toHaveCount(0);
  await expect(connectorCard(settingsDialog, 'github')).toBeVisible();
  await expect(connectorCard(settingsDialog, 'slack')).toBeVisible();

  await connectorCard(settingsDialog, 'github').focus();
  await connectorCard(settingsDialog, 'github').press('Enter');
  await expect(page.getByTestId('connector-drawer')).toBeVisible();
  await expect(page.getByTestId('connector-drawer')).toContainText('List issues');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('connector-drawer')).toHaveCount(0);
});

test('saving a Composio key from Settings unlocks the connectors gate immediately', async ({ page }) => {
  const { accountLabel: _unusedAccountLabel, ...slackConnector } = CONNECTORS[1]!;
  await routeConnectors(page, [
    {
      ...CONNECTORS[0]!,
      status: 'available',
      auth: { provider: 'composio', configured: false },
    },
    {
      ...slackConnector,
      status: 'available',
      auth: { provider: 'composio', configured: false },
    },
  ]);

  let savedComposioBody: unknown = null;
  await page.route('**/api/connectors/composio/config', async (route) => {
    savedComposioBody = route.request().postDataJSON();
    await route.fulfill({ status: 200, body: '{}' });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: { config: null } });
      return;
    }
    await route.fulfill({ status: 200, body: '{}' });
  });

  await gotoEntryHome(page);
  await page.getByRole('button', { name: 'Configure execution mode' }).click();
  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  await settingsDialog.getByRole('button', { name: /^Connectors\b/ }).click();
  await expect(settingsDialog.getByTestId('connectors-search-input')).toBeDisabled();

  await settingsDialog.getByPlaceholder('Paste Composio API key').fill('cmp-secret-1234');
  await settingsDialog.getByRole('button', { name: 'Save key', exact: true }).click();

  expect(savedComposioBody).toEqual({ apiKey: 'cmp-secret-1234' });
  await expect(settingsDialog.getByTestId('connectors-search-input')).toBeEnabled();
  await expect(connectorCard(settingsDialog, 'github')).toBeVisible();

  await expect.poll(async () => readSavedConfig(page)).toMatchObject({
    composio: {
      apiKey: '',
      apiKeyConfigured: true,
      apiKeyTail: '1234',
    },
  });
  const savedConfig = await readSavedConfig(page);
  expect(savedConfig?.composio).toMatchObject({
    apiKey: '',
    apiKeyConfigured: true,
    apiKeyTail: '1234',
  });
});

async function routeConnectors(page: Page, connectors: typeof CONNECTORS) {
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    const statuses = Object.fromEntries(
      connectors.map((connector) => [
        connector.id,
        {
          status: connector.status,
          accountLabel: connector.accountLabel,
        },
      ]),
    );
    await route.fulfill({ json: { statuses } });
  });
  await page.route('**/api/connectors/discovery*', async (route) => {
    await route.fulfill({
      json: {
        connectors,
        meta: { provider: 'composio' },
      },
    });
  });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function routeDefaultAppConfig(page: Page) {
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          config: {
            onboardingCompleted: true,
            agentId: 'mock',
            skillId: null,
            gameSkillId: null,
            gameArtBibleId: null,
            disabledGameArtBibles: [],
            agentModels: {},
            agentCliEnv: {},
          },
        },
      });
      return;
    }
    await route.fulfill({ status: 200, body: '{}' });
  });
}

async function routeNewProjectDefaults(page: Page) {
  const gameArtBibles = [
    {
      id: 'sci-fi-tactical',
      title: 'Sci-Fi Tactical',
      category: 'Game Art Direction',
      summary: 'Readable tactical HUD framework for squad combat.',
      swatches: ['#7DF9FF', '#0B132B', '#F9D65C', '#EF476F'],
    },
  ];
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({
      json: {
        skills: [
          {
            id: 'playable-game-prototype',
            name: 'Playable Game Prototype',
            description: 'Create a playable gameplay scene with HUD and encounter notes.',
            triggers: [],
            mode: 'prototype',
            surface: 'web',
            platform: 'desktop',
            scenario: 'gameplay',
            previewType: 'html',
            gameArtBibleRequired: false,
            defaultFor: ['prototype'],
            upstream: null,
            featured: null,
            fidelity: 'high-fidelity',
            speakerNotes: null,
            animations: null,
            hasBody: true,
            examplePrompt: 'Create a small tactical encounter.',
          },
        ],
      },
    });
  });
  await page.route('**/api/game-art-bibles', async (route) => {
    await route.fulfill({ json: { gameArtBibles } });
  });
}

async function routeComposioConfig(
  page: Page,
  config: { configured: boolean; apiKeyTail?: string },
) {
  await page.route('**/api/connectors/composio/config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: config });
      return;
    }

    await route.fulfill({ json: { ok: true } });
  });
}

function connectorCard(scope: Page | Locator, id: string) {
  return scope.locator(`article.connector-card[data-connector-id="${id}"]`);
}

async function fetchCurrentProject(page: Page) {
  await expect(page).toHaveURL(/\/projects\/[^/]+/);
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  expect(projectId).toBeTruthy();

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      metadata?: {
        promptTemplate?: {
          id: string;
          surface: string;
          title: string;
          prompt: string;
        };
      };
    };
  };
  return body.project;
}
