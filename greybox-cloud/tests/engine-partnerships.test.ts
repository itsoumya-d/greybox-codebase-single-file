// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEnginePartnershipReport,
  enginePartnershipRecordsFromEnv,
  formatEnginePartnershipMarkdown,
  type EnginePartnershipRecordInput,
} from '../src/enterprise/enginePartnerships.js';
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

function readyPartnerships(): EnginePartnershipRecordInput[] {
  return [
    {
      partner: 'Unity',
      program: 'unity-verified-solution',
      stage: 'approved',
      submittedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-05-01T00:00:00.000Z',
      evidence: [
        evidence('application-receipt', 'a', 'https://partners.example.com/unity/application'),
        evidence('approval-notice', 'b', 'https://partners.example.com/unity/verified'),
        evidence('public-listing', 'c', 'https://unity.example.com/verified/greybox'),
      ],
    },
    {
      partner: 'Epic',
      program: 'epic-megagrant',
      stage: 'approved',
      submittedAt: '2026-03-05T00:00:00.000Z',
      lastActivityAt: '2026-04-25T00:00:00.000Z',
      evidence: [
        evidence('application-receipt', 'd', 'https://partners.example.com/epic/application'),
        evidence('award-notice', 'e', 'https://partners.example.com/epic/award'),
      ],
    },
    {
      partner: 'Godot',
      program: 'godot-sponsorship',
      stage: 'active',
      submittedAt: '2026-02-15T00:00:00.000Z',
      lastActivityAt: '2026-05-05T00:00:00.000Z',
      expiresAt: '2027-02-15T00:00:00.000Z',
      evidence: [
        evidence('sponsorship-invoice', 'f', 'https://partners.example.com/godot/invoice'),
        evidence('payment-receipt', '0', 'https://partners.example.com/godot/receipt'),
        evidence('public-listing', '1', 'https://godot.example.com/sponsors/greybox'),
      ],
    },
  ];
}

function evidence(
  type: NonNullable<EnginePartnershipRecordInput['evidence']>[number]['type'],
  digit: string,
  sourceUrl: string,
) {
  return {
    type,
    capturedAt: '2026-05-06T00:00:00.000Z',
    sourceHash: digit.repeat(64),
    sourceUrl,
  };
}

test('engine partnership report proves Unity, Epic, and Godot strategic signals', () => {
  const report = buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: readyPartnerships(),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.appliedPrograms, 3);
  assert.equal(report.summary.achievedPrograms, 3);
  assert.equal(report.summary.activePrograms, 1);
  assert.equal(report.summary.unityVerifiedApplied, true);
  assert.equal(report.summary.unityVerifiedAchieved, true);
  assert.equal(report.summary.epicMegaGrantApplied, true);
  assert.equal(report.summary.epicMegaGrantLanded, true);
  assert.equal(report.summary.godotSponsorshipActive, true);
  assert.equal(report.summary.engineVendorStrategicInterest, true);
  assert.ok(report.programs.some((program) => program.publicHosts.includes('unity.example.com')));
  assert.doesNotMatch(JSON.stringify(report), /sourceHash|SECRET|TOKEN|@|portal token/u);
});

test('engine partnership report fails closed without evidenced engine-vendor wins', () => {
  const report = buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [
      {
        partner: 'Unity',
        program: 'unity-verified-solution',
        stage: 'applied',
        submittedAt: '2026-01-01T00:00:00.000Z',
        lastActivityAt: '2026-02-01T00:00:00.000Z',
        evidence: [evidence('application-receipt', '2', 'https://partners.example.com/unity/application')],
      },
      {
        partner: 'Epic',
        program: 'epic-megagrant',
        stage: 'under-review',
        submittedAt: '2026-04-01T00:00:00.000Z',
        lastActivityAt: '2026-04-02T00:00:00.000Z',
      },
    ],
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.appliedPrograms, 2);
  assert.equal(report.summary.achievedPrograms, 0);
  assert.equal(report.summary.engineVendorStrategicInterest, false);
  assert.ok(report.checks.some((check) => check.id === 'program-coverage' && check.status === 'warn'));
  assert.ok(report.checks.some((check) => check.id === 'engine-vendor-wins' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'evidence-per-program' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'review-freshness' && check.status === 'warn'));
});

test('engine partnership env parser keeps sanitized evidence only', () => {
  assert.deepEqual(enginePartnershipRecordsFromEnv({ GREYBOX_ENGINE_PARTNERSHIPS_JSON: 'nope' }), []);
  const records = enginePartnershipRecordsFromEnv({
    GREYBOX_ENGINE_PARTNERSHIPS_JSON: JSON.stringify([
      {
        partner: 'Unity',
        program: 'unity-verified-solution',
        stage: 'applied',
        submittedAt: '2026-03-01',
        lastActivityAt: '2026-03-05',
        partnerContactEmail: 'do-not-return@example.com',
        privatePortalNotes: 'do not return',
        evidence: [
          {
            type: 'application-receipt',
            capturedAt: '2026-03-05',
            sourceHash: '3'.repeat(64),
            sourceUrl: 'https://partners.example.com/unity/application#secret',
            portalToken: 'do-not-return',
          },
          {
            type: 'portal-status',
            capturedAt: '2026-03-06',
            sourceUrl: 'https://partners.example.com/unity/status',
          },
        ],
      },
      {
        partner: 'Unity',
        program: 'epic-megagrant',
        stage: 'applied',
        submittedAt: '2026-03-01',
        lastActivityAt: '2026-03-05',
      },
    ]),
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.partner, 'Unity');
  assert.equal(records[0]?.evidence?.length, 1);
  assert.equal(records[0]?.evidence?.[0]?.sourceUrl, 'https://partners.example.com/unity/application');
  assert.doesNotMatch(JSON.stringify(records), /do-not-return|privatePortalNotes|portalToken|status/u);
});

test('engine partnership markdown and endpoint are admin protected and safe', async () => {
  const markdown = formatEnginePartnershipMarkdown(buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: readyPartnerships(),
  }));
  assert.match(markdown, /Greybox Engine Partnership Readiness/u);
  assert.match(markdown, /Engine-vendor strategic interest: yes/u);
  assert.match(markdown, /\| Engine vendor wins \| pass/u);
  assert.doesNotMatch(markdown, /sourceHash|TOKEN|SECRET|@/u);

  await withServer({
    auditAdminToken: 'engine-partners-admin-0123456789abcdef',
    enginePartnershipRecords: readyPartnerships(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/engine-partnerships`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/engine-partnerships`, {
      headers: { authorization: 'Bearer engine-partners-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { engineVendorStrategicInterest: boolean; achievedPrograms: number };
      programs: Array<{ publicHosts: string[] }>;
    };
    assert.equal(report.summary.engineVendorStrategicInterest, true);
    assert.equal(report.summary.achievedPrograms, 3);
    assert.ok(report.programs.some((program) => program.publicHosts.includes('godot.example.com')));
    assert.doesNotMatch(JSON.stringify(report), /engine-partners-admin|sourceHash/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/engine-partnerships?format=markdown`, {
      headers: { authorization: 'Bearer engine-partners-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Engine Partnership Readiness/u);
  });
});

test('engine partnership report rejects mismatched programs, malformed hashes, and private URLs', () => {
  assert.throws(() => buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      partner: 'Unity',
      program: 'epic-megagrant',
      stage: 'applied',
      submittedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
    }],
  }), /program does not match partner/u);

  assert.throws(() => buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      partner: 'Epic',
      program: 'epic-megagrant',
      stage: 'applied',
      submittedAt: '2026-06-01T00:00:00.000Z',
      lastActivityAt: '2026-06-02T00:00:00.000Z',
    }],
  }), /submittedAt cannot be in the future/u);

  assert.throws(() => buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      partner: 'Godot',
      program: 'godot-sponsorship',
      stage: 'active',
      submittedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
      evidence: [{
        type: 'sponsorship-invoice',
        capturedAt: '2026-03-02T00:00:00.000Z',
        sourceHash: 'not-a-hash',
      }],
    }],
  }), /sourceHash must be a SHA-256/u);

  assert.throws(() => buildEnginePartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      partner: 'Godot',
      program: 'godot-sponsorship',
      stage: 'active',
      submittedAt: '2026-03-01T00:00:00.000Z',
      lastActivityAt: '2026-03-02T00:00:00.000Z',
      evidence: [{
        type: 'sponsorship-invoice',
        capturedAt: '2026-03-02T00:00:00.000Z',
        sourceHash: '4'.repeat(64),
        sourceUrl: 'http://localhost/invoice',
      }],
    }],
  }), /sourceUrl must be a public HTTPS URL/u);
});
