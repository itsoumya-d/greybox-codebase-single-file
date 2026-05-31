// SPDX-License-Identifier: Apache-2.0

import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildProductAnalyticsDashboard,
  buildProductAnalyticsPostHogDashboardSeed,
  buildProductAnalyticsPostHogPayload,
  buildProductAnalyticsWeeklyReport,
  provisionProductAnalyticsPostHogDashboard,
} from '../src/product-analytics.js';

type StartedServer = { server: http.Server; url: string };
type StartServer = (options: { port: number; returnServer: true }) => Promise<StartedServer>;

let startServer: StartServer;
let dataDir = '';
let previousDataDir: string | undefined;
let previousSlackWebhookUrl: string | undefined;
let previousPostHogHost: string | undefined;
let previousPostHogProjectToken: string | undefined;
let previousPostHogDistinctId: string | undefined;
let previousPostHogEnvironmentId: string | undefined;
let previousPostHogPersonalApiKey: string | undefined;
let server: http.Server | undefined;
let baseUrl = '';

beforeAll(async () => {
  previousDataDir = process.env.AGDS_DATA_DIR;
  previousSlackWebhookUrl = process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL;
  previousPostHogHost = process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST;
  previousPostHogProjectToken = process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN;
  previousPostHogDistinctId = process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID;
  previousPostHogEnvironmentId = process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_ENVIRONMENT_ID;
  previousPostHogPersonalApiKey = process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PERSONAL_API_KEY;
  dataDir = await mkdtemp(path.join(tmpdir(), 'agds-product-analytics-'));
  process.env.AGDS_DATA_DIR = dataDir;
  delete process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL;
  delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST;
  delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN;
  delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID;
  delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_ENVIRONMENT_ID;
  delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PERSONAL_API_KEY;
  const serverModule = await import('../src/server.js');
  startServer = serverModule.startServer as StartServer;
}, 120_000);

afterAll(async () => {
  if (previousDataDir === undefined) delete process.env.AGDS_DATA_DIR;
  else process.env.AGDS_DATA_DIR = previousDataDir;
  if (previousSlackWebhookUrl === undefined) delete process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL;
  else process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL = previousSlackWebhookUrl;
  if (previousPostHogHost === undefined) delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST;
  else process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST = previousPostHogHost;
  if (previousPostHogProjectToken === undefined) delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN;
  else process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN = previousPostHogProjectToken;
  if (previousPostHogDistinctId === undefined) delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID;
  else process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID = previousPostHogDistinctId;
  if (previousPostHogEnvironmentId === undefined) delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_ENVIRONMENT_ID;
  else process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_ENVIRONMENT_ID = previousPostHogEnvironmentId;
  if (previousPostHogPersonalApiKey === undefined) delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PERSONAL_API_KEY;
  else process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PERSONAL_API_KEY = previousPostHogPersonalApiKey;
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const started = await startServer({ port: 0, returnServer: true });
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
});

async function createProject(projectId: string, extra: Record<string, unknown> = {}): Promise<void> {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: `Product analytics ${projectId}`, ...extra }),
  });
  expect(response.status).toBe(200);
}

async function writeProjectTextFile(projectId: string, name: string, content: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content }),
  });
  expect(response.status).toBe(200);
}

async function enableMetricsTelemetry(installationId = 'designer-local'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/app-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installationId,
      telemetry: { metrics: true },
    }),
  });
  expect(response.status).toBe(200);
}

async function waitForDashboard(predicate: (dashboard: any) => boolean, now = Date.UTC(2026, 4, 16)): Promise<any> {
  const deadline = Date.now() + 3_000;
  let lastDashboard: any = null;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/product-analytics/dashboard?weeks=2&now=${now}`);
    expect(response.status).toBe(200);
    lastDashboard = await response.json();
    if (predicate(lastDashboard)) return lastDashboard;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`dashboard predicate did not pass; last=${JSON.stringify(lastDashboard)}`);
}

async function startWebhookStub(): Promise<{
  baseUrl: string;
  url: string;
  requests: Array<{ method: string; url: string; body: any }>;
  close: () => Promise<void>;
}> {
  const requests: Array<{ method: string; url: string; body: any }> = [];
  const webhook = http.createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        body: raw ? JSON.parse(raw) : null,
      });
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  await new Promise<void>((resolve, reject) => {
    webhook.listen(0, '127.0.0.1', () => resolve());
    webhook.once('error', reject);
  });
  const address = webhook.address();
  if (!address || typeof address === 'string') throw new Error('webhook stub did not bind to a TCP port');
  const baseWebhookUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl: baseWebhookUrl,
    url: `${baseWebhookUrl}/slack`,
    requests,
    close: () => new Promise<void>((resolve, reject) => webhook.close((error) => (error ? reject(error) : resolve()))),
  };
}

it('builds a PostHog dashboard seed and aggregate-only usage properties', async () => {
  const now = Date.UTC(2026, 8, 8, 12);
  const dashboard = buildProductAnalyticsDashboard({
    engineShipments: [{
      id: 'ship-1',
      type: 'engine_shipment',
      projectId: 'project-1',
      engine: 'unity',
      designerId: 'designer-private',
      shippedAt: now,
      receivedAt: now,
      artifactId: 'private-artifact-id',
      fileName: 'private-artifact.gameview.json',
    }],
    activationEvents: [{
      id: 'activation-1',
      type: 'activation_funnel',
      step: 'first_engine_export',
      designerId: 'designer-private',
      occurredAt: now,
      receivedAt: now,
    }],
    productUsageEvents: [
      {
        id: 'skill-1',
        type: 'product_usage',
        kind: 'skill',
        itemId: 'soulslike-combat-pack',
        designerId: 'designer-private',
        occurredAt: now,
        receivedAt: now,
      },
      {
        id: 'art-bible-1',
        type: 'product_usage',
        kind: 'game_art_bible',
        itemId: 'neon-arena-bible',
        designerId: 'designer-private',
        occurredAt: now,
        receivedAt: now,
      },
      {
        id: 'persona-1',
        type: 'product_usage',
        kind: 'playtest_persona',
        itemId: 'speedrunner',
        outcome: 'attempted',
        designerId: 'designer-private',
        occurredAt: now,
        receivedAt: now,
      },
      {
        id: 'persona-2',
        type: 'product_usage',
        kind: 'playtest_persona',
        itemId: 'speedrunner',
        outcome: 'completed',
        designerId: 'designer-private',
        occurredAt: now,
        receivedAt: now,
      },
    ],
    revenueRetentionEvents: [{
      id: 'nrr-1',
      type: 'revenue_retention',
      accountId: 'account-private',
      signupMonth: '2026-09',
      periodMonth: '2026-10',
      startingMrrCents: 10_000,
      currentMrrCents: 12_000,
      receivedAt: now,
    }],
  }, { now, weeks: 2 });
  const report = buildProductAnalyticsWeeklyReport(dashboard);
  const payload = buildProductAnalyticsPostHogPayload(report, {
    apiKey: 'phc_test_project_token',
    distinctId: 'greybox-installation:test',
  });
  const seed = buildProductAnalyticsPostHogDashboardSeed({
    appHost: 'https://posthog.example',
    environmentId: '123',
    generatedAt: '2026-05-17T00:00:00.000Z',
  });

  expect(payload.properties).toMatchObject({
    signup_designers: 0,
    first_project_designers: 0,
    first_artifact_designers: 0,
    first_save_designers: 0,
    first_engine_export_designers: 1,
    top_skill_id: 'soulslike-combat-pack',
    top_skill_events: 1,
    top_game_art_bible_id: 'neon-arena-bible',
    top_game_art_bible_events: 1,
    top_playtest_persona_id: 'speedrunner',
    top_playtest_persona_completion_rate: 1,
    nrr: 1.2,
    privacy_scope: 'aggregate_only_no_artifact_content_designer_names_or_game_ip',
    $process_person_profile: false,
  });
  expect(JSON.stringify(payload)).not.toContain('private-artifact');
  expect(JSON.stringify(payload)).not.toContain('designer-private');
  expect(seed.api).toMatchObject({
    dashboardEndpoint: 'https://posthog.example/api/environments/123/dashboards/',
    insightEndpoint: 'https://posthog.example/api/environments/123/insights/',
    requiredScopes: ['dashboard:write', 'insight:write'],
  });
  expect(seed.insights.map((insight) => insight.key)).toEqual([
    'north-star-weekly-active-designers',
    'activation-funnel',
    'engine-export-volume',
    'retention-cohort-rates',
    'nrr-by-signup-month',
    'skill-usage',
    'game-art-bible-usage',
    'playtest-persona-completion',
  ]);
});

it('provisions PostHog dashboard and insights through scoped API calls', async () => {
  const calls: Array<{ url: string; body: any; authorization: string | null }> = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      authorization: init?.headers instanceof Headers
        ? init.headers.get('authorization')
        : (init?.headers as Record<string, string> | undefined)?.authorization ?? null,
    });
    const id = calls.length === 1 ? 42 : `insight-${calls.length - 1}`;
    return new Response(JSON.stringify({ id }), {
      status: calls.length === 1 ? 201 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await provisionProductAnalyticsPostHogDashboard({
    appHost: 'https://posthog.example',
    environmentId: '777',
    personalApiKey: 'phx_personal_secret',
    fetchImpl,
    generatedAt: '2026-05-17T00:00:00.000Z',
  });

  expect(result.dryRun).toBe(false);
  expect(result.dashboard).toMatchObject({
    id: 42,
    url: 'https://posthog.example/project/777/dashboard/42',
  });
  expect(result.insights).toHaveLength(8);
  expect(calls[0]).toMatchObject({
    url: 'https://posthog.example/api/environments/777/dashboards/',
    authorization: 'Bearer phx_personal_secret',
    body: expect.objectContaining({ name: 'Greybox North Star', pinned: true }),
  });
  expect(calls.slice(1).every((call) => call.url === 'https://posthog.example/api/environments/777/insights/')).toBe(true);
  expect(calls.slice(1).every((call) => call.body.dashboards[0] === 42)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('phx_personal_secret');
});

describe('product analytics routes', () => {
  it('requires explicit metrics opt-in before recording or viewing engine shipment analytics', async () => {
    const projectId = `analytics-gated-${Date.now()}`;
    await createProject(projectId);

    const record = await fetch(`${baseUrl}/api/projects/${projectId}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unity',
        artifactId: 'artifact-1',
        shippedAt: Date.UTC(2026, 4, 13),
      }),
    });
    expect(record.status).toBe(403);
    await expect(record.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const northStar = await fetch(`${baseUrl}/api/product-analytics/north-star`);
    expect(northStar.status).toBe(403);
    await expect(northStar.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const dashboard = await fetch(`${baseUrl}/api/product-analytics/dashboard`);
    expect(dashboard.status).toBe(403);
    await expect(dashboard.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const weeklyReport = await fetch(`${baseUrl}/api/product-analytics/weekly-report`);
    expect(weeklyReport.status).toBe(403);
    await expect(weeklyReport.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const slackDelivery = await fetch(`${baseUrl}/api/product-analytics/weekly-report/slack`, { method: 'POST' });
    expect(slackDelivery.status).toBe(403);
    await expect(slackDelivery.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const scheduledSlackDelivery = await fetch(`${baseUrl}/api/product-analytics/weekly-report/slack/scheduled-run`, {
      method: 'POST',
    });
    expect(scheduledSlackDelivery.status).toBe(403);
    await expect(scheduledSlackDelivery.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const postHogDelivery = await fetch(`${baseUrl}/api/product-analytics/weekly-report/posthog`, {
      method: 'POST',
    });
    expect(postHogDelivery.status).toBe(403);
    await expect(postHogDelivery.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });

    const revenueRetention = await fetch(`${baseUrl}/api/product-analytics/revenue-retention`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: 'studio-a',
        signupMonth: '2026-05',
        periodMonth: '2026-06',
        startingMrrCents: 7900,
        currentMrrCents: 9500,
      }),
    });
    expect(revenueRetention.status).toBe(403);
    await expect(revenueRetention.json()).resolves.toMatchObject({ error: { code: 'TELEMETRY_OPT_IN_REQUIRED' } });
  });

  it('reports weekly active designers shipping artifacts to Unity Unreal and Godot', async () => {
    const projectA = `analytics-a-${Date.now()}`;
    const projectB = `analytics-b-${Date.now()}`;
    const shippedAt = Date.UTC(2026, 4, 13, 12);
    await enableMetricsTelemetry('designer-local');
    await createProject(projectA);
    await createProject(projectB);
    await writeProjectTextFile(projectA, 'DESIGN.md', '# Arena\n\nAI-assisted artifact save.');

    const first = await fetch(`${baseUrl}/api/projects/${projectA}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unity',
        artifactId: 'hud-v1',
        shippedAt,
        source: 'greybox-unity-plugin',
      }),
    });
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      stored: 1,
      event: {
        projectId: projectA,
        engine: 'unity',
        designerId: 'designer-local',
        artifactId: 'hud-v1',
      },
    });

    const second = await fetch(`${baseUrl}/api/projects/${projectA}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unreal',
        fileName: 'boss-arena.gameview.json',
        designerId: 'designer-local',
        shippedAt,
      }),
    });
    expect(second.status).toBe(200);

    const third = await fetch(`${baseUrl}/api/game-deliverables/${projectB}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'godot',
        artifactId: 'idle-loop',
        designerId: 'designer-b',
        shippedAt,
      }),
    });
    expect(third.status).toBe(200);

    const response = await fetch(`${baseUrl}/api/product-analytics/north-star?weeks=2&now=${Date.UTC(2026, 4, 16)}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body).toMatchObject({
      metric: 'weekly_active_designers_shipping_to_engines',
      currentWeekStart: '2026-05-11',
      currentWeekActiveDesigners: 2,
      previousWeekActiveDesigners: 0,
    });
    expect(body.weeks.at(-1)).toMatchObject({
      weekStart: '2026-05-11',
      activeDesigners: 2,
      shipments: 3,
      projectCount: 2,
      byEngine: { unity: 1, unreal: 1, godot: 1 },
    });

    const dashboardResponse = await fetch(`${baseUrl}/api/product-analytics/dashboard?weeks=2&now=${Date.UTC(2026, 4, 16)}`);
    expect(dashboardResponse.status).toBe(200);
    const dashboard = (await dashboardResponse.json()) as any;
    expect(dashboard.northStar).toMatchObject({
      metric: 'weekly_active_designers_shipping_to_engines',
      currentWeekActiveDesigners: 2,
    });
    expect(dashboard.engineExportVolume.weeks.at(-1)).toMatchObject({
      byEngine: { unity: 1, unreal: 1, godot: 1 },
    });
    expect(dashboard.activationFunnel).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: 'signup', activeDesigners: 1 }),
      expect.objectContaining({ step: 'first_project', activeDesigners: 1 }),
      expect.objectContaining({ step: 'first_artifact', activeDesigners: 1 }),
      expect.objectContaining({ step: 'first_save', activeDesigners: 1 }),
      expect.objectContaining({ step: 'first_engine_export', activeDesigners: 2 }),
    ]));

    const reportResponse = await fetch(`${baseUrl}/api/product-analytics/weekly-report?weeks=2&now=${Date.UTC(2026, 4, 16)}`);
    expect(reportResponse.status).toBe(200);
    const report = (await reportResponse.json()) as any;
    expect(report).toMatchObject({
      weekStart: '2026-05-11',
      metrics: {
        activeDesigners: 2,
        previousWeekActiveDesigners: 0,
        activeDesignerDelta: 2,
        shipments: 3,
        projectCount: 2,
        byEngine: { unity: 1, unreal: 1, godot: 1 },
        firstEngineExportDesigners: 2,
      },
      slack: {
        text: expect.stringContaining('active designers shipping to engines'),
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: 'header' }),
          expect.objectContaining({ type: 'section' }),
          expect.objectContaining({ type: 'context' }),
        ]),
      },
    });
    expect(report.markdown).toContain('Weekly active designers shipping to engines: 2 (+2 WoW)');
    expect(report.markdown).toContain('Engine split: Unity 1, Unreal 1, Godot 1');
    expect(report.markdown).toContain('artifact content, file bodies, designer names, and game IP are excluded');
  });

  it('delivers the sanitized weekly report to a configured Slack webhook only after opt-in', async () => {
    const projectId = `analytics-slack-${Date.now()}`;
    const shippedAt = Date.UTC(2026, 4, 13, 12);
    await enableMetricsTelemetry('designer-slack');
    await createProject(projectId);

    const missingWebhook = await fetch(`${baseUrl}/api/product-analytics/weekly-report/slack?weeks=2&now=${Date.UTC(2026, 4, 16)}`, {
      method: 'POST',
    });
    expect(missingWebhook.status).toBe(400);
    await expect(missingWebhook.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.stringContaining('AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL'),
      },
    });

    const shipment = await fetch(`${baseUrl}/api/projects/${projectId}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unity',
        artifactId: 'private-boss-design',
        fileName: 'secret-boss.gameview.json',
        designerId: 'designer-slack',
        shippedAt,
      }),
    });
    expect(shipment.status).toBe(200);

    const webhook = await startWebhookStub();
    process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL = webhook.url;
    try {
      const delivery = await fetch(`${baseUrl}/api/product-analytics/weekly-report/slack?weeks=2&now=${Date.UTC(2026, 4, 16)}`, {
        method: 'POST',
      });
      expect(delivery.status).toBe(200);
      const body = (await delivery.json()) as any;
      expect(body).toMatchObject({
        delivered: true,
        status: 200,
        report: {
          metrics: {
            activeDesigners: expect.any(Number),
            shipments: expect.any(Number),
            byEngine: expect.objectContaining({ unity: expect.any(Number) }),
          },
        },
      });
      expect(webhook.requests).toHaveLength(1);
      expect(webhook.requests[0]).toMatchObject({
        method: 'POST',
        body: {
          text: expect.stringContaining('Greybox Weekly North Star'),
          blocks: expect.arrayContaining([
            expect.objectContaining({ type: 'header' }),
            expect.objectContaining({ type: 'section' }),
            expect.objectContaining({ type: 'context' }),
          ]),
        },
      });
      const sent = JSON.stringify(webhook.requests[0]?.body);
      expect(sent).toContain('active designers shipping to engines');
      expect(sent).toContain('artifact content');
      expect(sent).not.toContain('private-boss-design');
      expect(sent).not.toContain('secret-boss.gameview.json');
      expect(sent).not.toContain('designer-slack');
    } finally {
      delete process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL;
      await webhook.close();
    }
  });

  it('runs the scheduled weekly Slack report once per North Star week', async () => {
    const projectId = `analytics-scheduled-slack-${Date.now()}`;
    const shippedAt = Date.UTC(2026, 6, 8, 12);
    const scheduledNow = Date.UTC(2026, 6, 10, 9);
    await enableMetricsTelemetry('designer-scheduled-slack');
    await createProject(projectId);

    const shipment = await fetch(`${baseUrl}/api/projects/${projectId}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unity',
        artifactId: 'private-scheduled-artifact',
        fileName: 'private-scheduled.gameview.json',
        designerId: 'designer-scheduled-slack',
        shippedAt,
      }),
    });
    expect(shipment.status).toBe(200);

    const webhook = await startWebhookStub();
    process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL = webhook.url;
    try {
      const first = await fetch(
        `${baseUrl}/api/product-analytics/weekly-report/slack/scheduled-run?weeks=2&now=${scheduledNow}`,
        { method: 'POST' },
      );
      expect(first.status).toBe(200);
      await expect(first.json()).resolves.toMatchObject({
        delivered: true,
        status: 200,
        weekStart: '2026-07-06',
        report: {
          metrics: {
            activeDesigners: 1,
            shipments: 1,
            byEngine: { unity: 1, unreal: 0, godot: 0 },
          },
        },
      });
      expect(webhook.requests).toHaveLength(1);
      const sent = JSON.stringify(webhook.requests[0]?.body);
      expect(sent).toContain('2026-07-06');
      expect(sent).not.toContain('private-scheduled-artifact');
      expect(sent).not.toContain('private-scheduled.gameview.json');
      expect(sent).not.toContain('designer-scheduled-slack');

      const duplicate = await fetch(
        `${baseUrl}/api/product-analytics/weekly-report/slack/scheduled-run?weeks=2&now=${scheduledNow}`,
        { method: 'POST' },
      );
      expect(duplicate.status).toBe(200);
      await expect(duplicate.json()).resolves.toMatchObject({
        delivered: false,
        skipped: 'already_sent',
        weekStart: '2026-07-06',
        lastSentAt: scheduledNow,
      });
      expect(webhook.requests).toHaveLength(1);
    } finally {
      delete process.env.AGDS_PRODUCT_ANALYTICS_SLACK_WEBHOOK_URL;
      await webhook.close();
    }
  });

  it('exports the sanitized weekly aggregate report to PostHog after opt-in', async () => {
    const projectId = `analytics-posthog-${Date.now()}`;
    const shippedAt = Date.UTC(2026, 7, 12, 12);
    const reportNow = Date.UTC(2026, 7, 14, 9);
    await enableMetricsTelemetry('designer-posthog-installation');
    await createProject(projectId);

    const missingConfig = await fetch(
      `${baseUrl}/api/product-analytics/weekly-report/posthog?weeks=2&now=${reportNow}`,
      { method: 'POST' },
    );
    expect(missingConfig.status).toBe(400);
    await expect(missingConfig.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.stringContaining('AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST'),
      },
    });

    const shipment = await fetch(`${baseUrl}/api/projects/${projectId}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unreal',
        artifactId: 'private-posthog-artifact',
        fileName: 'secret-posthog.gameview.json',
        designerId: 'designer-posthog',
        shippedAt,
      }),
    });
    expect(shipment.status).toBe(200);

    const posthog = await startWebhookStub();
    process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST = posthog.baseUrl;
    process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN = 'phc_test_project_token';
    process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID = 'studio-founder@example.com';
    try {
      const delivery = await fetch(
        `${baseUrl}/api/product-analytics/weekly-report/posthog?weeks=2&now=${reportNow}`,
        { method: 'POST' },
      );
      expect(delivery.status).toBe(200);
      await expect(delivery.json()).resolves.toMatchObject({
        delivered: true,
        status: 200,
        endpoint: `${posthog.baseUrl}/i/v0/e/`,
        event: 'greybox_weekly_north_star',
        weekStart: '2026-08-10',
      });
      expect(posthog.requests).toHaveLength(1);
      expect(posthog.requests[0]).toMatchObject({
        method: 'POST',
        url: '/i/v0/e/',
        body: {
          api_key: 'phc_test_project_token',
          event: 'greybox_weekly_north_star',
          distinct_id: expect.stringMatching(/^greybox-installation:[a-f0-9]{24}$/),
          timestamp: new Date(reportNow).toISOString(),
          properties: expect.objectContaining({
            metric: 'weekly_active_designers_shipping_to_engines',
            week_start: '2026-08-10',
            active_designers: 1,
            shipments: 1,
            project_count: 1,
            unity_shipments: 0,
            unreal_shipments: 1,
            godot_shipments: 0,
            first_engine_export_designers: expect.any(Number),
            privacy_scope: 'aggregate_only_no_artifact_content_designer_names_or_game_ip',
            source: 'greybox_daemon_weekly_report',
            $process_person_profile: false,
          }),
        },
      });
      const sent = JSON.stringify(posthog.requests[0]?.body);
      expect(sent).not.toContain('private-posthog-artifact');
      expect(sent).not.toContain('secret-posthog.gameview.json');
      expect(sent).not.toContain('designer-posthog');
      expect(sent).not.toContain('studio-founder@example.com');
    } finally {
      delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_HOST;
      delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_PROJECT_TOKEN;
      delete process.env.AGDS_PRODUCT_ANALYTICS_POSTHOG_DISTINCT_ID;
      await posthog.close();
    }
  });

  it('reports retention cohorts and revenue retention by signup month', async () => {
    const projectId = `analytics-retention-${Date.now()}`;
    const firstSeen = Date.UTC(2026, 4, 1, 10);
    const retainedAt = Date.UTC(2026, 4, 8, 12);
    await enableMetricsTelemetry('designer-retention');
    await createProject(projectId);

    const first = await fetch(`${baseUrl}/api/projects/${projectId}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unity',
        artifactId: 'retention-day-zero',
        designerId: 'designer-retention',
        shippedAt: firstSeen,
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/api/projects/${projectId}/product-analytics/engine-shipment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: 'unity',
        artifactId: 'retention-day-seven',
        designerId: 'designer-retention',
        shippedAt: retainedAt,
      }),
    });
    expect(second.status).toBe(200);

    for (const event of [
      {
        accountId: 'studio-a',
        signupMonth: '2026-05',
        periodMonth: '2026-06',
        startingMrrCents: 10_000,
        currentMrrCents: 14_000,
      },
      {
        accountId: 'studio-b',
        signupMonth: '2026-05',
        periodMonth: '2026-06',
        startingMrrCents: 10_000,
        currentMrrCents: 10_000,
      },
    ]) {
      const response = await fetch(`${baseUrl}/api/product-analytics/revenue-retention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ stored: 1 });
    }

    const dashboardResponse = await fetch(`${baseUrl}/api/product-analytics/dashboard?weeks=2&now=${Date.UTC(2026, 4, 9)}`);
    expect(dashboardResponse.status).toBe(200);
    const dashboard = (await dashboardResponse.json()) as any;
    expect(dashboard.retention.cohorts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cohortStart: '2026-05-01',
        cohortSize: 1,
        periods: expect.arrayContaining([
          expect.objectContaining({ period: 'd1', eligibleDesigners: 1, retainedDesigners: 1, retentionRate: 1 }),
          expect.objectContaining({ period: 'd7', eligibleDesigners: 1, retainedDesigners: 1, retentionRate: 1 }),
        ]),
      }),
    ]));
    expect(dashboard.revenueRetention.cohorts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        signupMonth: '2026-05',
        accountCount: 2,
        startingMrrCents: 20_000,
        currentMrrCents: 24_000,
        expansionMrrCents: 4_000,
        contractionMrrCents: 0,
        churnedAccountCount: 0,
        nrr: 1.2,
      }),
    ]));
  });

  it('records Unity package exports as engine shipments after metrics opt-in', async () => {
    const projectId = `analytics-unity-package-${Date.now()}`;
    await enableMetricsTelemetry('designer-export');
    await createProject(projectId);
    await writeProjectTextFile(projectId, 'DESIGN.md', '# Unity Export\n\nAI-assisted package export smoke.');

    const unityPackage = await fetch(`${baseUrl}/api/projects/${projectId}/unity-package`);
    expect(unityPackage.status).toBe(200);
    expect(unityPackage.headers.get('content-type')).toContain('application/vnd.unity');
    expect(unityPackage.headers.get('x-greybox-engine-shipment-recorded')).toBe('1');

    const response = await fetch(`${baseUrl}/api/product-analytics/north-star?weeks=1&now=${Date.now()}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const week = body.weeks.at(-1);
    expect(week.activeDesigners).toBeGreaterThanOrEqual(1);
    expect(week.shipments).toBeGreaterThanOrEqual(1);
    expect(week.byEngine.unity).toBeGreaterThanOrEqual(1);
  });

  it('records Unreal and Godot engine package downloads as engine shipments after metrics opt-in', async () => {
    const projectId = `analytics-engine-package-${Date.now()}`;
    await enableMetricsTelemetry('designer-engine-package');
    await createProject(projectId);
    await writeProjectTextFile(projectId, 'engine-package.gameview.json', JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Analytics Engine Package',
      objective: 'Track native engine package exports in the North Star metric.',
      entities: [
        { id: 'spawn', name: 'Spawn', type: 'player-spawn', x: 64, y: 96 },
        { id: 'boss', name: 'Metric Boss', type: 'enemy-spawn', x: 420, y: 180 },
      ],
      terrainZones: [
        { id: 'metric-hazard', name: 'Metric Hazard', type: 'blocking-hazard', x: 180, y: 130, w: 160, h: 70 },
      ],
      terrainSculptPatches: [
        { id: 'metric-ridge', name: 'Metric Ridge', type: 'height-sculpt', x: 220, y: 150, radius: 88, height: 1.1 },
      ],
      dynamicEvents: [
        { id: 'metric-shift', name: 'Metric Shift', trigger: 'tick-2', impact: 'Engine package metric changes.' },
      ],
      worldSimulation: {
        weather: 'Metric rain',
        factionTerritory: ['Metrics Gate'],
      },
    }));

    const unrealPackage = await fetch(`${baseUrl}/api/projects/${projectId}/engine-package/unreal?fileName=engine-package.gameview.json`);
    expect(unrealPackage.status).toBe(200);
    expect(unrealPackage.headers.get('content-type')).toContain('application/zip');
    expect(unrealPackage.headers.get('x-greybox-engine')).toBe('unreal');
    expect(unrealPackage.headers.get('x-greybox-engine-shipment-recorded')).toBe('1');
    await unrealPackage.arrayBuffer();

    const godotPackage = await fetch(`${baseUrl}/api/projects/${projectId}/engine-package/godot?fileName=engine-package.gameview.json`);
    expect(godotPackage.status).toBe(200);
    expect(godotPackage.headers.get('content-type')).toContain('application/zip');
    expect(godotPackage.headers.get('x-greybox-engine')).toBe('godot');
    expect(godotPackage.headers.get('x-greybox-engine-shipment-recorded')).toBe('1');
    await godotPackage.arrayBuffer();

    const response = await fetch(`${baseUrl}/api/product-analytics/north-star?weeks=1&now=${Date.now()}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const week = body.weeks.at(-1);
    expect(week.activeDesigners).toBeGreaterThanOrEqual(1);
    expect(week.shipments).toBeGreaterThanOrEqual(2);
    expect(week.byEngine.unreal).toBeGreaterThanOrEqual(1);
    expect(week.byEngine.godot).toBeGreaterThanOrEqual(1);
  });

  it('reports per-skill art-bible and persona playtest usage without artifact content', async () => {
    const projectId = `analytics-usage-${Date.now()}`;
    await enableMetricsTelemetry('designer-usage');
    await createProject(projectId, {
      skillId: 'game-hud-system',
      gameArtBibleId: 'cozy-sim-art-bible',
    });
    await writeProjectTextFile(projectId, 'usage-arena.gameview.json', JSON.stringify({
      version: 1,
      kind: 'game-viewport',
      surface: 'gameplay',
      title: 'Usage Arena',
      entities: [
        { id: 'spawn-a', name: 'Spawn A', type: 'player-spawn', x: 80, y: 120 },
        { id: 'enemy-a', name: 'Enemy A', type: 'enemy-spawn', x: 420, y: 220 },
      ],
      paths: [
        {
          id: 'critical-path',
          name: 'Critical path',
          type: 'objective',
          points: [{ x: 80, y: 120 }, { x: 420, y: 220 }],
        },
      ],
    }));

    const run = await fetch(`${baseUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'missing-agent-for-analytics',
        projectId,
        message: 'Use the project skill and art bible for a tiny HUD pass.',
      }),
    });
    expect(run.status).toBe(202);

    const playtest = await fetch(`${baseUrl}/api/projects/${projectId}/playtest-simulation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'usage-arena.gameview.json',
        personas: ['explorer', 'casual'],
        runs: 2,
      }),
    });
    expect(playtest.status).toBe(200);

    const dashboard = await waitForDashboard((body) =>
      body.skillUsage.top.some((item: any) => item.id === 'game-hud-system')
      && body.gameArtBibleUsage.top.some((item: any) => item.id === 'cozy-sim-art-bible')
      && body.playtestPersonaUsage.top.some((item: any) => item.id === 'explorer' && item.attempts >= 1 && item.completions >= 1),
    );

    expect(dashboard.skillUsage.top).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'game-hud-system', activeDesigners: expect.any(Number), events: expect.any(Number) }),
    ]));
    expect(dashboard.gameArtBibleUsage.top).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cozy-sim-art-bible', activeDesigners: expect.any(Number), events: expect.any(Number) }),
    ]));
    expect(dashboard.playtestPersonaUsage.top).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'explorer', attempts: expect.any(Number), completions: expect.any(Number), completionRate: expect.any(Number) }),
      expect.objectContaining({ id: 'casual', attempts: expect.any(Number), completions: expect.any(Number), completionRate: expect.any(Number) }),
    ]));
  });

  it('serves and dry-runs the PostHog dashboard seed after metrics opt-in', async () => {
    await enableMetricsTelemetry('designer-dashboard-seed-installation');

    const seedResponse = await fetch(
      `${baseUrl}/api/product-analytics/posthog/dashboard-seed?host=https://posthog.example&environmentId=founder-env`,
    );
    expect(seedResponse.status).toBe(200);
    await expect(seedResponse.json()).resolves.toMatchObject({
      version: 1,
      privacyScope: 'aggregate_only_no_artifact_content_designer_names_or_game_ip',
      api: {
        dashboardEndpoint: 'https://posthog.example/api/environments/founder-env/dashboards/',
        insightEndpoint: 'https://posthog.example/api/environments/founder-env/insights/',
        requiredScopes: ['dashboard:write', 'insight:write'],
      },
      dashboard: {
        name: 'Greybox North Star',
        pinned: true,
      },
      insights: expect.arrayContaining([
        expect.objectContaining({ key: 'north-star-weekly-active-designers' }),
        expect.objectContaining({ key: 'activation-funnel' }),
        expect.objectContaining({ key: 'retention-cohort-rates' }),
        expect.objectContaining({ key: 'nrr-by-signup-month' }),
        expect.objectContaining({ key: 'skill-usage' }),
        expect.objectContaining({ key: 'game-art-bible-usage' }),
        expect.objectContaining({ key: 'playtest-persona-completion' }),
      ]),
    });

    const dryRun = await fetch(`${baseUrl}/api/product-analytics/posthog/dashboard-provision`, {
      method: 'POST',
    });
    expect(dryRun.status).toBe(200);
    await expect(dryRun.json()).resolves.toMatchObject({
      dryRun: true,
      seed: {
        dashboard: { name: 'Greybox North Star' },
      },
      insights: expect.arrayContaining([
        { key: 'north-star-weekly-active-designers', status: 'planned' },
      ]),
    });
  });
});
