// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildCommercialCreditReport,
  commercialCreditRecordsFromEnv,
  formatCommercialCreditMarkdown,
  type CommercialGameCreditRecordInput,
} from '../src/enterprise/commercialCredits.js';
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

function commercialCredits(): CommercialGameCreditRecordInput[] {
  return [
    credit('ember-road', 'Ember Road', 'Aster Signal', 'Unity', 'Steam', 'case-study'),
    credit('orbit-miners', 'Orbit Miners', 'Latch Labs', 'Unreal', 'Epic Games Store', 'credits-page'),
    credit('tiny-keepers', 'Tiny Keepers', 'North Tile', 'Godot', 'itch.io', 'credits-screenshot'),
    credit('hex-runner', 'Hex Runner', 'Mossline', 'Unity', 'App Store', 'customer-approval'),
    credit('night-market', 'Night Market', 'Pixel Grove', 'Unreal', 'Google Play', 'credits-page'),
  ];
}

function credit(
  gameSlug: string,
  title: string,
  studioName: string,
  engine: CommercialGameCreditRecordInput['engine'],
  store: CommercialGameCreditRecordInput['store'],
  creditEvidence: NonNullable<CommercialGameCreditRecordInput['evidence']>[number]['type'],
): CommercialGameCreditRecordInput {
  return {
    gameSlug,
    title,
    studioName,
    engine,
    store,
    shippedAt: '2026-04-15T00:00:00.000Z',
    commercialRelease: true,
    greyboxCredited: true,
    humanDesignerCredited: true,
    generatorMetaTag: true,
    evidence: [
      {
        type: 'store-page',
        capturedAt: '2026-04-16T00:00:00.000Z',
        sourceHash: 'a'.repeat(64),
        sourceUrl: `https://store.example.com/${gameSlug}`,
      },
      {
        type: creditEvidence,
        capturedAt: '2026-04-17T00:00:00.000Z',
        sourceHash: 'b'.repeat(64),
        sourceUrl: `https://credits.example.com/${gameSlug}`,
        approvedForPublicUse: creditEvidence === 'case-study',
      },
    ],
  };
}

test('commercial credit report proves five shipped games without leaking source material', () => {
  const report = buildCommercialCreditReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: commercialCredits(),
  });

  assert.equal(report.generatedAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.verifiedCommercialCredits, 5);
  assert.equal(report.summary.enginesRepresented, 3);
  assert.equal(report.summary.approvedCaseStudies, 1);
  assert.equal(report.summary.humanDesignerCredits, 5);
  assert.equal(report.summary.generatorMetaTags, 5);
  assert.equal(report.summary.requirementMet, true);
  assert.equal(report.summary.acquisitionNarrativeReady, true);
  assert.ok(report.games.every((game) => game.verified));
  assert.deepEqual(report.games[0]?.publicEvidenceHosts, ['credits.example.com', 'store.example.com']);
  assert.doesNotMatch(JSON.stringify(report), /sourceHash|store\.example\.com\/ember-road|SECRET|TOKEN|@/u);
});

test('commercial credit report fails closed on weak shipped-game proof', () => {
  const report = buildCommercialCreditReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [
      credit('single-credit', 'Single Credit', 'Small Studio', 'Unity', 'Steam', 'credits-page'),
      {
        ...credit('uncredited', 'Uncredited', 'Small Studio', 'Unity', 'Steam', 'credits-page'),
        greyboxCredited: false,
      },
    ],
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.verifiedCommercialCredits, 1);
  assert.equal(report.summary.requirementMet, false);
  assert.equal(report.summary.acquisitionNarrativeReady, false);
  assert.ok(report.checks.some((check) => check.id === 'verified-commercial-credits' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'human-credit-hygiene' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.id === 'engine-spread' && check.status === 'warn'));
});

test('commercial credit env parser keeps sanitized public proof fields only', () => {
  assert.deepEqual(commercialCreditRecordsFromEnv({ GREYBOX_COMMERCIAL_CREDITS_JSON: 'nope' }), []);
  const records = commercialCreditRecordsFromEnv({
    GREYBOX_COMMERCIAL_CREDITS_JSON: JSON.stringify([
      {
        gameSlug: 'safe-game',
        title: 'Safe Game',
        studioName: 'Safe Studio',
        engine: 'Unity',
        store: 'Steam',
        shippedAt: '2026-04-01',
        commercialRelease: true,
        greyboxCredited: true,
        humanDesignerCredited: true,
        generatorMetaTag: true,
        contactEmail: 'do-not-return@example.com',
        rawGameIp: 'private combat tuning notes',
        evidence: [
          {
            type: 'store-page',
            capturedAt: '2026-04-02',
            sourceHash: 'd'.repeat(64),
            sourceUrl: 'https://store.example.com/safe-game?utm=ok#frag',
            rawScreenshotText: 'do not return',
          },
          {
            type: 'credits-page',
            capturedAt: '2026-04-03',
            sourceUrl: 'https://credits.example.com/safe-game',
          },
        ],
      },
      {
        gameSlug: 'bad-email',
        title: 'owner@example.com',
        studioName: 'Unsafe Studio',
        engine: 'Unity',
        store: 'Steam',
        shippedAt: '2026-04-01',
      },
    ]),
  });

  assert.equal(records.length, 1);
  assert.equal(records[0]?.gameSlug, 'safe-game');
  assert.equal(records[0]?.evidence?.length, 1);
  assert.equal(records[0]?.evidence?.[0]?.sourceUrl, 'https://store.example.com/safe-game?utm=ok');
  assert.doesNotMatch(JSON.stringify(records), /do-not-return|private combat|rawScreenshotText|credits\.example/u);
});

test('commercial credit markdown and endpoint are admin protected and safe', async () => {
  const markdown = formatCommercialCreditMarkdown(buildCommercialCreditReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: commercialCredits(),
  }));
  assert.match(markdown, /Greybox Commercial Credit Readiness/u);
  assert.match(markdown, /Requirement met: yes/u);
  assert.match(markdown, /Acquisition narrative ready: yes/u);
  assert.doesNotMatch(markdown, /sourceHash|TOKEN|SECRET|@/u);

  await withServer({
    auditAdminToken: 'credits-admin-0123456789abcdef',
    commercialCreditRecords: commercialCredits(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/strategy/commercial-credits`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/strategy/commercial-credits`, {
      headers: { authorization: 'Bearer credits-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { requirementMet: boolean; verifiedCommercialCredits: number };
      games: Array<{ title: string; publicEvidenceHosts: string[] }>;
    };
    assert.equal(report.summary.requirementMet, true);
    assert.equal(report.summary.verifiedCommercialCredits, 5);
    assert.deepEqual(report.games[0]?.publicEvidenceHosts, ['credits.example.com', 'store.example.com']);
    assert.doesNotMatch(JSON.stringify(report), /credits-admin|sourceHash/u);

    const markdownResponse = await fetch(`${baseUrl}/v1/strategy/commercial-credits?format=markdown`, {
      headers: { authorization: 'Bearer credits-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Commercial Credit Readiness/u);
  });
});

test('commercial credit report rejects malformed dates, hashes, and private URLs', () => {
  assert.throws(() => buildCommercialCreditReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...credit('future-game', 'Future Game', 'Safe Studio', 'Unity', 'Steam', 'credits-page'),
      shippedAt: '2026-06-01T00:00:00.000Z',
    }],
  }), /shippedAt cannot be in the future/u);

  assert.throws(() => buildCommercialCreditReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...credit('bad-hash', 'Bad Hash', 'Safe Studio', 'Unity', 'Steam', 'credits-page'),
      evidence: [{
        type: 'store-page',
        capturedAt: '2026-04-16T00:00:00.000Z',
        sourceHash: 'not-a-hash',
      }],
    }],
  }), /sourceHash must be a SHA-256/u);

  assert.throws(() => buildCommercialCreditReport({
    now: new Date('2026-05-18T00:00:00.000Z'),
    records: [{
      ...credit('private-url', 'Private URL', 'Safe Studio', 'Unity', 'Steam', 'credits-page'),
      evidence: [{
        type: 'store-page',
        capturedAt: '2026-04-16T00:00:00.000Z',
        sourceHash: 'e'.repeat(64),
        sourceUrl: 'http://localhost/private',
      }],
    }],
  }), /sourceUrl must be a public HTTPS URL/u);
});
