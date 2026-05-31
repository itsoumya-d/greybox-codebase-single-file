// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';

import {
  buildNorthStarReport,
  formatNorthStarMarkdown,
  northStarEventsFromEnv,
  type AnalyticsEventName,
  type EngineTarget,
  type ProductAnalyticsEvent,
} from '../src/analytics/northStar.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string, server: http.Server) => Promise<T>,
): Promise<T> {
  const server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`, server);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function event(input: {
  id: string;
  name: AnalyticsEventName;
  designerId: string;
  engine?: EngineTarget;
  projectId?: string;
  artifactId?: string;
  occurredAt?: number;
  telemetryOptIn?: boolean;
}): ProductAnalyticsEvent {
  return {
    id: input.id,
    name: input.name,
    designerId: input.designerId,
    occurredAt: input.occurredAt ?? Date.UTC(2026, 4, 18, 12),
    telemetryOptIn: input.telemetryOptIn ?? true,
    ...(input.engine ? { engine: input.engine } : {}),
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
  };
}

function funnelEvents(designerId: string, prefix: string): ProductAnalyticsEvent[] {
  return [
    event({ id: `${prefix}-signup`, name: 'signup', designerId }),
    event({ id: `${prefix}-project`, name: 'project-created', designerId, projectId: `${prefix}-project` }),
    event({ id: `${prefix}-artifact`, name: 'artifact-created', designerId, projectId: `${prefix}-project`, artifactId: `${prefix}-artifact` }),
    event({ id: `${prefix}-save`, name: 'artifact-saved', designerId, projectId: `${prefix}-project`, artifactId: `${prefix}-artifact` }),
  ];
}

test('North Star report counts opt-in designers shipping artifacts to all engines without leaking ids', () => {
  const events = [
    ...funnelEvents('designer-a@example.com', 'unity'),
    event({
      id: 'unity-export',
      name: 'engine-export',
      designerId: 'designer-a@example.com',
      engine: 'unity',
      projectId: 'project-unity',
      artifactId: 'artifact-unity',
    }),
    ...funnelEvents('designer-b@example.com', 'unreal'),
    event({
      id: 'unreal-export',
      name: 'engine-export',
      designerId: 'designer-b@example.com',
      engine: 'unreal',
      projectId: 'project-unreal',
      artifactId: 'artifact-unreal',
    }),
    ...funnelEvents('designer-c@example.com', 'godot'),
    event({
      id: 'godot-export',
      name: 'engine-export',
      designerId: 'designer-c@example.com',
      engine: 'godot',
      projectId: 'project-godot',
      artifactId: 'artifact-godot',
    }),
    event({
      id: 'unity-second-export',
      name: 'engine-export',
      designerId: 'designer-a@example.com',
      engine: 'unity',
      projectId: 'project-unity',
      artifactId: 'artifact-unity-v2',
    }),
  ];

  const report = buildNorthStarReport({
    events,
    generatedAt: new Date(Date.UTC(2026, 4, 18, 12)),
    targets: {
      weeklyActiveDesignersShippingToEngines: 3,
      minActivationToExportRateBps: 10_000,
    },
  });

  assert.equal(report.ready, true);
  assert.equal(report.period.label, '2026-05-18..2026-05-24');
  assert.deepEqual(report.summary, {
    scopedEvents: 16,
    optedInEvents: 16,
    ignoredNoConsentEvents: 0,
    ignoredDuplicateEvents: 0,
    telemetryOptInEventRateBps: 10_000,
    weeklyActiveDesignersShippingToEngines: 3,
    activationToExportRateBps: 10_000,
    projectsWithEngineExports: 3,
    artifactsExportedToEngines: 4,
  });
  assert.equal(report.engines.unity.exportingDesigners, 1);
  assert.equal(report.engines.unity.exportedArtifacts, 2);
  assert.equal(report.engines.unreal.exportingDesigners, 1);
  assert.equal(report.engines.godot.exportingDesigners, 1);
  assert.deepEqual(report.shortfalls, []);
  assert.match(formatNorthStarMarkdown(report), /Weekly active designers shipping to engines: 3\/3/u);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes('designer-a@example.com'), false);
  assert.equal(serialized.includes('project-unity'), false);
  assert.equal(serialized.includes('artifact-unity'), false);
});

test('North Star report dedupes event replays and requires ordered activation funnel progress', () => {
  const base = Date.UTC(2026, 4, 18, 12);
  const events = [
    ...funnelEvents('designer-a', 'ordered').map((item, index) => ({
      ...item,
      occurredAt: base + index,
    })),
    event({
      id: 'ordered-export',
      name: 'engine-export',
      designerId: 'designer-a',
      engine: 'unity',
      projectId: 'project-a',
      artifactId: 'artifact-a',
      occurredAt: base + 4,
    }),
    event({
      id: 'ordered-export',
      name: 'engine-export',
      designerId: 'designer-a',
      engine: 'unity',
      projectId: 'project-a',
      artifactId: 'artifact-a',
      occurredAt: base + 5,
    }),
    event({ id: 'early-signup', name: 'signup', designerId: 'designer-b', occurredAt: base }),
    event({
      id: 'early-export',
      name: 'engine-export',
      designerId: 'designer-b',
      engine: 'unreal',
      projectId: 'project-b',
      artifactId: 'artifact-b',
      occurredAt: base + 1,
    }),
    event({ id: 'early-project', name: 'project-created', designerId: 'designer-b', projectId: 'project-b', occurredAt: base + 2 }),
    event({ id: 'early-artifact', name: 'artifact-created', designerId: 'designer-b', projectId: 'project-b', artifactId: 'artifact-b', occurredAt: base + 3 }),
    event({ id: 'early-save', name: 'artifact-saved', designerId: 'designer-b', projectId: 'project-b', artifactId: 'artifact-b', occurredAt: base + 4 }),
  ];

  const report = buildNorthStarReport({
    events,
    generatedAt: new Date(base),
    targets: {
      weeklyActiveDesignersShippingToEngines: 2,
      minActivationToExportRateBps: 5_000,
      minGodotExportingDesigners: 0,
    },
  });

  assert.equal(report.summary.scopedEvents, 10);
  assert.equal(report.summary.ignoredDuplicateEvents, 1);
  assert.equal(report.summary.weeklyActiveDesignersShippingToEngines, 2);
  assert.equal(report.summary.artifactsExportedToEngines, 2);
  assert.deepEqual(report.activationFunnel.map((step) => [step.id, step.designers]), [
    ['signup', 2],
    ['project-created', 2],
    ['artifact-created', 2],
    ['artifact-saved', 2],
    ['engine-export', 1],
  ]);
  assert.equal(report.summary.activationToExportRateBps, 5_000);
});

test('North Star report fails below targets and ignores events without opt-in consent', () => {
  const report = buildNorthStarReport({
    events: [
      ...funnelEvents('designer-a', 'consented'),
      event({
        id: 'consented-export',
        name: 'engine-export',
        designerId: 'designer-a',
        engine: 'unity',
        projectId: 'project-a',
        artifactId: 'artifact-a',
      }),
      event({
        id: 'not-consented-export',
        name: 'engine-export',
        designerId: 'designer-b',
        engine: 'unreal',
        projectId: 'project-b',
        artifactId: 'artifact-b',
        telemetryOptIn: false,
      }),
    ],
    generatedAt: new Date(Date.UTC(2026, 4, 18, 12)),
    targets: {
      weeklyActiveDesignersShippingToEngines: 3,
      minActivationToExportRateBps: 10_000,
      minTelemetryOptInEventRateBps: 9_000,
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.summary.weeklyActiveDesignersShippingToEngines, 1);
  assert.equal(report.summary.ignoredNoConsentEvents, 1);
  assert.deepEqual(report.shortfalls.map((shortfall) => shortfall.code).sort(), [
    'godot_export_shortfall',
    'north_star_shortfall',
    'telemetry_opt_in_shortfall',
    'unreal_export_shortfall',
  ]);
});

test('North Star report scopes to the current UTC week and dedupes designers', () => {
  const report = buildNorthStarReport({
    events: [
      event({
        id: 'last-week',
        name: 'engine-export',
        designerId: 'designer-old',
        engine: 'godot',
        projectId: 'project-old',
        artifactId: 'artifact-old',
        occurredAt: Date.UTC(2026, 4, 17, 23, 59),
      }),
      event({
        id: 'current-a',
        name: 'engine-export',
        designerId: 'designer-a',
        engine: 'unity',
        projectId: 'project-a',
        artifactId: 'artifact-a',
      }),
      event({
        id: 'current-b',
        name: 'engine-export',
        designerId: 'designer-a',
        engine: 'unreal',
        projectId: 'project-b',
        artifactId: 'artifact-b',
      }),
    ],
    generatedAt: new Date(Date.UTC(2026, 4, 18, 12)),
    targets: {
      weeklyActiveDesignersShippingToEngines: 1,
      minActivationToExportRateBps: 0,
      minGodotExportingDesigners: 0,
    },
  });

  assert.equal(report.summary.weeklyActiveDesignersShippingToEngines, 1);
  assert.equal(report.summary.projectsWithEngineExports, 2);
  assert.equal(report.engines.unity.exportingDesigners, 1);
  assert.equal(report.engines.unreal.exportingDesigners, 1);
  assert.equal(report.engines.godot.exportingDesigners, 0);
});

test('North Star report rejects malformed events and targets', () => {
  assert.throws(() => buildNorthStarReport({
    events: [
      event({
        id: 'bad-export',
        name: 'engine-export',
        designerId: 'designer-a',
        projectId: 'project-a',
        artifactId: 'artifact-a',
      }),
    ],
  }), /valid engine/u);

  assert.throws(() => buildNorthStarReport({
    events: [],
    targets: { minActivationToExportRateBps: 10_001 },
  }), /minActivationToExportRateBps/u);
});

test('North Star env parser accepts known opt-in analytics fields only', () => {
  assert.deepEqual(northStarEventsFromEnv({ GREYBOX_NORTH_STAR_EVENTS_JSON: 'not-json' }), []);
  const events = northStarEventsFromEnv({
    GREYBOX_NORTH_STAR_EVENTS_JSON: JSON.stringify([
      {
        id: 'event-1',
        name: 'engine-export',
        designerId: 'designer-a@example.com',
        occurredAt: Date.UTC(2026, 4, 18, 12),
        telemetryOptIn: true,
        engine: 'unity',
        projectId: 'project-a',
        artifactId: 'artifact-a',
        rawPrompt: 'must-not-survive-parser',
      },
      {
        id: 'event-2',
        name: 'engine-export',
        designerId: 'designer-b@example.com',
        occurredAt: Date.UTC(2026, 4, 18, 12),
        telemetryOptIn: true,
        engine: 'unknown-engine',
        projectId: 'project-b',
        artifactId: 'artifact-b',
      },
      { id: 'bad-event', name: 'engine-export' },
    ]),
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.telemetryOptIn, true);
  assert.equal(events[0]?.engine, 'unity');
  assert.equal('rawPrompt' in (events[0] as unknown as Record<string, unknown>), false);
});

test('North Star endpoint is admin protected and supports markdown', async () => {
  await withServer({
    auditAdminToken: 'north-star-admin-0123456789abcdef',
    northStarGeneratedAt: new Date(Date.UTC(2026, 4, 18, 12)),
    northStarEvents: [
      ...funnelEvents('designer-a', 'unity-route'),
      event({
        id: 'unity-route-export',
        name: 'engine-export',
        designerId: 'designer-a',
        engine: 'unity',
        projectId: 'project-a',
        artifactId: 'artifact-a',
      }),
      ...funnelEvents('designer-b', 'unreal-route'),
      event({
        id: 'unreal-route-export',
        name: 'engine-export',
        designerId: 'designer-b',
        engine: 'unreal',
        projectId: 'project-b',
        artifactId: 'artifact-b',
      }),
      ...funnelEvents('designer-c', 'godot-route'),
      event({
        id: 'godot-route-export',
        name: 'engine-export',
        designerId: 'designer-c',
        engine: 'godot',
        projectId: 'project-c',
        artifactId: 'artifact-c',
      }),
    ],
  }, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/v1/strategy/north-star`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/v1/strategy/north-star?format=markdown`, {
      headers: { authorization: 'Bearer north-star-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/markdown/u);
    const body = await response.text();
    assert.match(body, /Greybox North Star/u);
    assert.match(body, /Unity: 1 designer/u);
    assert.doesNotMatch(body, /designer-a|project-a|artifact-a/u);
  });
});
