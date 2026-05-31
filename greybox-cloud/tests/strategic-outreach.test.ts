// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';

import {
  buildStrategicOutreachReport,
  formatStrategicOutreachMarkdown,
  strategicOutreachRecordsFromEnv,
  type StrategicOutreachRecordInput,
} from '../src/enterprise/strategicOutreach.js';
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

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

function readyRecords(): StrategicOutreachRecordInput[] {
  return [
    {
      acquirer: 'Unity',
      stage: 'diligence',
      initiatedAt: '2026-04-25T12:00:00.000Z',
      lastActivityAt: '2026-05-17T12:00:00.000Z',
      evidence: [
        { type: 'partner-channel', capturedAt: '2026-04-25T12:00:00.000Z', sourceHash: hashA },
        { type: 'diligence-request', capturedAt: '2026-05-17T12:00:00.000Z', sourceHash: hashB },
      ],
    },
    {
      acquirer: 'Epic',
      stage: 'intro-completed',
      initiatedAt: '2026-05-01T12:00:00.000Z',
      lastActivityAt: '2026-05-12T12:00:00.000Z',
      evidence: [
        { type: 'founder-intro', capturedAt: '2026-05-01T12:00:00.000Z', sourceHash: hashC },
      ],
    },
  ];
}

test('strategic outreach report proves two target buyer conversations without leaking contacts', () => {
  const report = buildStrategicOutreachReport({
    records: readyRecords(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.conversationRequirementMet, true);
  assert.equal(report.summary.exitOutcomeEvidence, false);
  assert.equal(report.summary.initiatedTargetConversations, 2);
  assert.equal(report.summary.advancedConversations, 1);
  assert.equal(report.summary.evidenceItems, 3);
  assert.deepEqual(report.conversations.map((conversation) => [conversation.acquirer, conversation.stage, conversation.evidenceItems]), [
    ['Epic', 'intro-completed', 1],
    ['Unity', 'diligence', 2],
  ]);
  assert.ok(report.checks.some((check) => check.id === 'target-conversations' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.id === 'valuation-event' && check.status === 'warn'));
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /founder@example\.com|buyer@example\.com|deal-room|raw meeting note|token|secret/iu);
});

test('strategic outreach report fails closed without two evidenced target conversations', () => {
  const report = buildStrategicOutreachReport({
    records: [
      {
        acquirer: 'Unity',
        stage: 'warm-intro',
        initiatedAt: '2026-05-01T00:00:00.000Z',
        lastActivityAt: '2026-05-02T00:00:00.000Z',
        evidence: [],
      },
    ],
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.conversationRequirementMet, false);
  assert.ok(report.checks.some((check) => check.id === 'target-conversations' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'evidence-per-conversation' && check.status === 'fail'));
});

test('strategic outreach report marks stale conversations and term-sheet outcome evidence', () => {
  const report = buildStrategicOutreachReport({
    records: [
      ...readyRecords(),
      {
        acquirer: 'Roblox',
        stage: 'term-sheet',
        initiatedAt: '2026-01-01T00:00:00.000Z',
        lastActivityAt: '2026-02-01T00:00:00.000Z',
        valuationUsd: 240_000_000,
        evidence: [
          { type: 'term-sheet', capturedAt: '2026-02-01T00:00:00.000Z', sourceHash: 'd'.repeat(64) },
        ],
      },
    ],
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.exitOutcomeEvidence, true);
  assert.equal(report.summary.highestValuationUsd, 240_000_000);
  assert.ok(report.conversations.some((conversation) => conversation.acquirer === 'Roblox' && conversation.valuationBand === '$200M+'));
  assert.ok(report.checks.some((check) => check.id === 'freshness' && check.status === 'warn'));
  assert.ok(report.checks.some((check) => check.id === 'valuation-event' && check.status === 'pass'));
});

test('strategic outreach env parser keeps sanitized known fields only', () => {
  assert.deepEqual(strategicOutreachRecordsFromEnv({ GREYBOX_STRATEGIC_OUTREACH_JSON: 'nope' }), []);
  const records = strategicOutreachRecordsFromEnv({
    GREYBOX_STRATEGIC_OUTREACH_JSON: JSON.stringify([
      {
        acquirer: 'Unity',
        stage: 'intro-completed',
        initiatedAt: '2026-05-01T00:00:00.000Z',
        lastActivityAt: '2026-05-02T00:00:00.000Z',
        contactEmail: 'buyer@example.com',
        rawNotes: 'deal-room password should not survive',
        evidence: [
          {
            type: 'founder-intro',
            capturedAt: '2026-05-01T00:00:00.000Z',
            sourceHash: hashA,
            meetingUrl: 'https://secret.example.com',
          },
        ],
      },
      {
        acquirer: 'NotTarget',
        stage: 'intro-completed',
        initiatedAt: '2026-05-01T00:00:00.000Z',
        lastActivityAt: '2026-05-02T00:00:00.000Z',
      },
    ]),
  });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    acquirer: 'Unity',
    stage: 'intro-completed',
    initiatedAt: '2026-05-01T00:00:00.000Z',
    lastActivityAt: '2026-05-02T00:00:00.000Z',
    evidence: [
      {
        type: 'founder-intro',
        capturedAt: '2026-05-01T00:00:00.000Z',
        sourceHash: hashA,
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(records), /buyer@example|deal-room|meetingUrl/u);
});

test('strategic outreach markdown and endpoint are admin protected and safe', async () => {
  const markdown = formatStrategicOutreachMarkdown(buildStrategicOutreachReport({
    records: readyRecords(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  }));
  assert.match(markdown, /Greybox Strategic Outreach Readiness/u);
  assert.match(markdown, /Conversation requirement met: yes/u);
  assert.match(markdown, /\| Unity \| diligence \| 2/u);
  assert.doesNotMatch(markdown, /@|deal-room|SECRET|TOKEN/u);

  await withServer({
    auditAdminToken: 'strategy-admin-0123456789abcdef',
    strategicOutreachRecords: readyRecords(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/strategic-outreach`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/strategic-outreach`, {
      headers: { authorization: 'Bearer strategy-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as { summary: { conversationRequirementMet: boolean } };
    assert.equal(report.summary.conversationRequirementMet, true);
    assert.doesNotMatch(JSON.stringify(report), /strategy-admin|@|deal-room/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/strategic-outreach?format=markdown`, {
      headers: { authorization: 'Bearer strategy-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Strategic Outreach/u);
  });
});

test('strategic outreach rejects unsupported valuation and malformed evidence', () => {
  assert.throws(() => buildStrategicOutreachReport({
    records: [
      {
        acquirer: 'Unity',
        stage: 'diligence',
        initiatedAt: '2026-05-01T00:00:00.000Z',
        lastActivityAt: '2026-05-02T00:00:00.000Z',
        valuationUsd: 200_000_000,
        evidence: [{ type: 'diligence-request', capturedAt: '2026-05-02T00:00:00.000Z' }],
      },
    ],
  }), /valuationUsd requires term-sheet/u);

  assert.throws(() => buildStrategicOutreachReport({
    records: [
      {
        acquirer: 'Epic',
        stage: 'intro-completed',
        initiatedAt: '2026-05-02T00:00:00.000Z',
        lastActivityAt: '2026-05-01T00:00:00.000Z',
        evidence: [{ type: 'founder-intro', capturedAt: '2026-05-02T00:00:00.000Z', sourceHash: 'not-a-hash' }],
      },
    ],
  }), /lastActivityAt/u);
});
