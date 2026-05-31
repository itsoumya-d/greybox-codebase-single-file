// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildCodingAgentPartnershipReport,
  codingAgentPartnershipRecordsFromEnv,
  formatCodingAgentPartnershipMarkdown,
  type CodingAgentPartnershipRecordInput,
} from '../src/enterprise/codingAgentPartnerships.js';
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

function readyPartnerships(): CodingAgentPartnershipRecordInput[] {
  return [
    partnership('claude-code-unity-mcp', 'Anthropic', 'live', true, true, 'announcement-url', 'https://partners.example.com/anthropic/greybox'),
    partnership('codex-openai-compatible', 'OpenAI', 'scheduled', false, true, 'webinar-page', 'https://partners.example.com/openai/webinar'),
    partnership('cursor-game-dev-expansion', 'Cursor', 'proposal', false, true, 'integration-doc', 'https://partners.example.com/cursor/integration'),
  ];
}

function partnership(
  campaignSlug: string,
  partner: CodingAgentPartnershipRecordInput['partner'],
  stage: CodingAgentPartnershipRecordInput['stage'],
  coMarketingPublic: boolean,
  mcpBridgeValidated: boolean,
  evidenceType: NonNullable<CodingAgentPartnershipRecordInput['evidence']>[number]['type'],
  sourceUrl: string,
): CodingAgentPartnershipRecordInput {
  return {
    campaignSlug,
    partner,
    stage,
    integrationStatus: 'validated',
    mcpBridgeValidated,
    coMarketingPublic,
    initiatedAt: '2026-03-01T00:00:00.000Z',
    lastActivityAt: '2026-05-05T00:00:00.000Z',
    ...(stage === 'announced' || stage === 'live' ? { announcedAt: '2026-05-01T00:00:00.000Z' } : {}),
    evidence: [{
      type: evidenceType,
      capturedAt: '2026-05-06T00:00:00.000Z',
      sourceHash: partnerHashDigit(partner).repeat(64),
      sourceUrl,
    }],
  };
}

function partnerHashDigit(partner: CodingAgentPartnershipRecordInput['partner']): string {
  switch (partner) {
    case 'Anthropic': return 'a';
    case 'OpenAI': return 'b';
    case 'Cursor': return 'c';
    case 'Cognition': return 'd';
    case 'Google': return 'e';
    default: return 'f';
  }
}

test('coding-agent partnership report proves anchor co-marketing and CLI pipeline', () => {
  const report = buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: readyPartnerships(),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.anchorCoMarketingAnnouncements, 1);
  assert.equal(report.summary.partnerPipeline, 3);
  assert.equal(report.summary.priorityPartnersActive, 3);
  assert.equal(report.summary.validatedCliIntegrations, 3);
  assert.equal(report.summary.mcpBridgeValidatedPartners, 3);
  assert.equal(report.summary.distributionRequirementMet, true);
  assert.equal(report.summary.acquisitionChannelReady, true);
  assert.ok(report.partnerships.some((item) => item.publicHosts.includes('partners.example.com')));
  assert.doesNotMatch(JSON.stringify(report), /sourceHash|SECRET|TOKEN|@|transcript|contact/u);
});

test('coding-agent partnership report fails closed without public anchor announcement', () => {
  const report = buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [
      partnership('openai-intro', 'OpenAI', 'intro', false, true, 'intro-digest', 'https://partners.example.com/openai/intro'),
      partnership('cursor-proposal', 'Cursor', 'proposal', false, true, 'integration-doc', 'https://partners.example.com/cursor/integration'),
    ],
  });

  assert.equal(report.summary.status, 'warn');
  assert.equal(report.summary.anchorCoMarketingAnnouncements, 0);
  assert.equal(report.summary.partnerPipeline, 2);
  assert.equal(report.summary.distributionRequirementMet, false);
  assert.equal(report.summary.acquisitionChannelReady, false);
  assert.ok(report.checks.some((check) => check.id === 'anchor-co-marketing' && check.status === 'warn'));
  assert.ok(report.checks.some((check) => check.id === 'cli-partner-pipeline' && check.status === 'warn'));
});

test('coding-agent partnership env parser keeps sanitized known fields only', () => {
  assert.deepEqual(codingAgentPartnershipRecordsFromEnv({ GREYBOX_CODING_AGENT_PARTNERSHIPS_JSON: 'nope' }), []);
  const records = codingAgentPartnershipRecordsFromEnv({
    GREYBOX_CODING_AGENT_PARTNERSHIPS_JSON: JSON.stringify([
      {
        campaignSlug: 'safe-partner',
        partner: 'Anthropic',
        stage: 'announced',
        integrationStatus: 'validated',
        mcpBridgeValidated: true,
        coMarketingPublic: true,
        initiatedAt: '2026-03-01',
        lastActivityAt: '2026-05-01',
        announcedAt: '2026-05-01',
        partnerContactEmail: 'do-not-return@example.com',
        rawTranscript: 'do not return',
        evidence: [
          {
            type: 'announcement-url',
            capturedAt: '2026-05-02',
            sourceHash: '1'.repeat(64),
            sourceUrl: 'https://partners.example.com/anthropic/greybox#private',
            privateNotes: 'do not return',
          },
          {
            type: 'webinar-page',
            capturedAt: '2026-05-03',
            sourceUrl: 'https://partners.example.com/anthropic/webinar',
          },
        ],
      },
      {
        campaignSlug: 'unsafe-partner',
        partner: 'Anthropic',
        stage: 'announced',
        integrationStatus: 'validated',
        initiatedAt: '2026-03-01',
        lastActivityAt: '2026-05-01',
        announcedAt: '2026-05-01',
        evidence: [],
        sourceToken: 'do-not-return',
      },
    ]),
  });

  assert.equal(records.length, 2);
  assert.equal(records[0]?.campaignSlug, 'safe-partner');
  assert.equal(records[0]?.evidence?.length, 1);
  assert.equal(records[0]?.evidence?.[0]?.sourceUrl, 'https://partners.example.com/anthropic/greybox');
  assert.doesNotMatch(JSON.stringify(records), /do-not-return|rawTranscript|privateNotes|webinar|sourceToken/u);
});

test('coding-agent partnership markdown and endpoint are admin protected and safe', async () => {
  const markdown = formatCodingAgentPartnershipMarkdown(buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: readyPartnerships(),
  }));
  assert.match(markdown, /Greybox Coding-Agent Partnership Readiness/u);
  assert.match(markdown, /Distribution requirement met: yes/u);
  assert.match(markdown, /Acquisition channel ready: yes/u);
  assert.match(markdown, /\| Anchor co-marketing \| pass/u);
  assert.doesNotMatch(markdown, /sourceHash|TOKEN|SECRET|@/u);

  await withServer({
    auditAdminToken: 'coding-agent-admin-0123456789abcdef',
    codingAgentPartnershipRecords: readyPartnerships(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/coding-agent-partnerships`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/coding-agent-partnerships`, {
      headers: { authorization: 'Bearer coding-agent-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { distributionRequirementMet: boolean; acquisitionChannelReady: boolean };
      partnerships: Array<{ partner: string; publicHosts: string[] }>;
    };
    assert.equal(report.summary.distributionRequirementMet, true);
    assert.equal(report.summary.acquisitionChannelReady, true);
    assert.ok(report.partnerships.some((item) => item.partner === 'Anthropic'));
    assert.doesNotMatch(JSON.stringify(report), /coding-agent-admin|sourceHash/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/coding-agent-partnerships?format=markdown`, {
      headers: { authorization: 'Bearer coding-agent-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Coding-Agent Partnership Readiness/u);
  });
});

test('coding-agent partnership report rejects malformed timing, hashes, and private URLs', () => {
  assert.throws(() => buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...partnership('future-partner', 'Anthropic', 'intro', false, true, 'intro-digest', 'https://partners.example.com/future'),
      initiatedAt: '2026-06-01T00:00:00.000Z',
    }],
  }), /initiatedAt cannot be in the future/u);

  assert.throws(() => buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...partnership('bad-announcement', 'Anthropic', 'proposal', true, true, 'announcement-url', 'https://partners.example.com/bad'),
      announcedAt: '2026-05-01T00:00:00.000Z',
    }],
  }), /announcedAt requires announced or live/u);

  assert.throws(() => buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...partnership('bad-hash', 'OpenAI', 'scheduled', false, true, 'webinar-page', 'https://partners.example.com/bad-hash'),
      evidence: [{
        type: 'webinar-page',
        capturedAt: '2026-05-06T00:00:00.000Z',
        sourceHash: 'not-a-hash',
      }],
    }],
  }), /sourceHash must be a SHA-256/u);

  assert.throws(() => buildCodingAgentPartnershipReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...partnership('private-url', 'Cursor', 'proposal', false, true, 'integration-doc', 'https://partners.example.com/private-url'),
      evidence: [{
        type: 'integration-doc',
        capturedAt: '2026-05-06T00:00:00.000Z',
        sourceHash: '2'.repeat(64),
        sourceUrl: 'http://localhost/private',
      }],
    }],
  }), /sourceUrl must be a public HTTPS URL/u);
});
