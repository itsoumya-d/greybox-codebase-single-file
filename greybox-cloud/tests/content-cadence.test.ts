// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildContentCadenceReport,
  contentCadenceRecordsFromEnv,
  formatContentCadenceMarkdown,
  type ContentCadenceRecordInput,
} from '../src/enterprise/contentCadence.js';
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

async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw lastError;
}

function readyContent(): ContentCadenceRecordInput[] {
  return [
    record('unity-round-trip-tutorial', 'tutorial', 'published', 'Unity', '2026-05-18T09:00:00.000Z', 80, 'public-url', 'https://blog.example.com/unity-round-trip'),
    record('unity-mcp-thread', 'social', 'published', 'Unity', '2026-05-19T12:00:00.000Z', 35, 'public-url', 'https://social.example.com/unity-mcp'),
    record('godot-goodwill-thread', 'social', 'published', 'Godot', '2026-05-20T12:00:00.000Z', 30, 'public-url', 'https://social.example.com/godot-goodwill'),
    record('build-in-public-live', 'livestream', 'published', 'Multi', '2026-05-21T18:00:00.000Z', 55, 'stream-archive', 'https://video.example.com/build-in-public'),
    record('greybox-weekly-newsletter', 'newsletter', 'published', 'Multi', '2026-05-22T10:00:00.000Z', 45, 'newsletter-archive', 'https://newsletter.example.com/greybox-weekly'),
    record('week-01-changelog', 'changelog', 'published', 'Multi', '2026-05-22T16:00:00.000Z', 20, 'public-url', 'https://changelog.example.com/week-01'),
    record('gdc-round-trip-talk', 'gdc-talk', 'submitted', 'Unity', '2026-05-01T00:00:00.000Z', 0, 'submission-receipt', 'https://events.example.com/gdc-round-trip'),
    record('global-game-jam-sponsor', 'jam-sponsorship', 'active', 'Multi', '2026-04-15T00:00:00.000Z', 0, 'sponsorship-invoice', 'https://events.example.com/global-game-jam'),
    record('gmtk-jam-sponsor', 'jam-sponsorship', 'active', 'Multi', '2026-04-16T00:00:00.000Z', 0, 'sponsorship-invoice', 'https://events.example.com/gmtk-jam'),
  ];
}

function record(
  contentSlug: string,
  channel: ContentCadenceRecordInput['channel'],
  status: ContentCadenceRecordInput['status'],
  engineFocus: ContentCadenceRecordInput['engineFocus'],
  publishedAt: string,
  organicSignupsAttributed: number,
  evidenceType: NonNullable<ContentCadenceRecordInput['evidence']>[number]['type'],
  sourceUrl: string,
): ContentCadenceRecordInput {
  return {
    contentSlug,
    channel,
    status,
    engineFocus,
    publishedAt,
    organicSignupsAttributed,
    evidence: [{
      type: evidenceType,
      capturedAt: publishedAt,
      sourceHash: hashDigit(contentSlug).repeat(64),
      sourceUrl,
    }],
  };
}

function hashDigit(value: string): string {
  const digits = 'abcdef0123456789';
  return digits[value.length % digits.length] ?? 'a';
}

test('content cadence report proves weekly GTM output and organic signup attribution', () => {
  const report = buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: readyContent(),
  });

  assert.equal(report.week.startsAt, '2026-05-18T00:00:00.000Z');
  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.tutorialsThisWeek, 1);
  assert.equal(report.summary.socialPostsThisWeek, 2);
  assert.equal(report.summary.livestreamsThisWeek, 1);
  assert.equal(report.summary.newslettersThisWeek, 1);
  assert.equal(report.summary.changelogPostsThisWeek, 1);
  assert.equal(report.summary.organicSignupsAttributed, 265);
  assert.equal(report.summary.weeklyCadenceComplete, true);
  assert.equal(report.summary.organicSignupTargetMet, true);
  assert.equal(report.summary.eventDistributionReady, true);
  assert.equal(report.summary.contentEngineReady, true);
  assert.ok(report.records.some((item) => item.publicHosts.includes('blog.example.com')));
  assert.doesNotMatch(JSON.stringify(report), /sourceHash|SECRET|TOKEN|@|raw post|private draft/u);
});

test('content cadence report fails closed when cadence and archives are weak', () => {
  const report = buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: [
      {
        ...record('single-tutorial', 'tutorial', 'published', 'Unity', '2026-05-18T09:00:00.000Z', 30, 'cms-entry', 'https://blog.example.com/single-tutorial'),
        evidence: [],
      },
      record('gdc-only', 'gdc-talk', 'submitted', 'Unity', '2026-05-01T00:00:00.000Z', 0, 'submission-receipt', 'https://events.example.com/gdc-only'),
    ],
  });

  assert.equal(report.summary.status, 'fail');
  assert.equal(report.summary.weeklyCadenceComplete, false);
  assert.equal(report.summary.organicSignupTargetMet, false);
  assert.equal(report.summary.eventDistributionReady, false);
  assert.ok(report.checks.some((check) => check.id === 'weekly-content-cadence' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'organic-signup-attribution' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'public-archive-evidence' && check.status === 'fail'));
});

test('content cadence env parser keeps sanitized known fields only', () => {
  assert.deepEqual(contentCadenceRecordsFromEnv({ GREYBOX_CONTENT_CADENCE_JSON: 'nope' }), []);
  const records = contentCadenceRecordsFromEnv({
    GREYBOX_CONTENT_CADENCE_JSON: JSON.stringify([
      {
        contentSlug: 'safe-post',
        channel: 'tutorial',
        status: 'published',
        engineFocus: 'Unity',
        publishedAt: '2026-05-18',
        organicSignupsAttributed: 41,
        authorEmail: 'do-not-return@example.com',
        rawPostBody: 'do not return',
        evidence: [
          {
            type: 'public-url',
            capturedAt: '2026-05-18',
            sourceHash: '1'.repeat(64),
            sourceUrl: 'https://blog.example.com/safe-post#draft',
            privateDraft: 'do not return',
          },
          {
            type: 'analytics-snapshot',
            capturedAt: '2026-05-18',
            sourceUrl: 'https://analytics.example.com/safe-post',
          },
        ],
      },
      {
        contentSlug: 'bad-signups',
        channel: 'tutorial',
        status: 'published',
        engineFocus: 'Unity',
        publishedAt: '2026-05-18',
        organicSignupsAttributed: -1,
      },
    ]),
  });

  assert.equal(records.length, 2);
  assert.equal(records[0]?.contentSlug, 'safe-post');
  assert.equal(records[0]?.evidence?.length, 1);
  assert.equal(records[0]?.evidence?.[0]?.sourceUrl, 'https://blog.example.com/safe-post');
  assert.equal(records[1]?.organicSignupsAttributed, undefined);
  assert.doesNotMatch(JSON.stringify(records), /do-not-return|rawPostBody|privateDraft|analytics\.example|authorEmail/u);
});

test('content cadence markdown and endpoint are admin protected and safe', async () => {
  const markdown = formatContentCadenceMarkdown(buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: readyContent(),
  }));
  assert.match(markdown, /Greybox Content Cadence Readiness/u);
  assert.match(markdown, /Content engine ready: yes/u);
  assert.match(markdown, /\| Weekly content cadence \| pass/u);
  assert.doesNotMatch(markdown, /sourceHash|TOKEN|SECRET|@/u);

  await withServer({
    auditAdminToken: 'content-admin-0123456789abcdef',
    contentCadenceRecords: readyContent(),
    contentCadenceNow: new Date('2026-05-23T00:00:00.000Z'),
  }, async (baseUrl) => {
    const denied = await fetchWithRetry(`${baseUrl}/v1/strategy/content-cadence`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetchWithRetry(`${baseUrl}/v1/strategy/content-cadence`, {
      headers: { authorization: 'Bearer content-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { contentEngineReady: boolean; organicSignupsAttributed: number };
      records: Array<{ publicHosts: string[] }>;
    };
    assert.equal(report.summary.contentEngineReady, true);
    assert.equal(report.summary.organicSignupsAttributed, 265);
    assert.ok(report.records.some((item) => item.publicHosts.includes('video.example.com')));
    assert.doesNotMatch(JSON.stringify(report), /content-admin|sourceHash/u);

    const markdownResponse = await fetchWithRetry(`${baseUrl}/v1/strategy/content-cadence?format=markdown`, {
      headers: { authorization: 'Bearer content-admin-0123456789abcdef' },
    });
    assert.equal(markdownResponse.status, 200);
    assert.match(markdownResponse.headers.get('content-type') ?? '', /text\/markdown/u);
    assert.match(await markdownResponse.text(), /Content Cadence Readiness/u);
  });
});

test('content cadence report rejects future dates, malformed hashes, and private URLs', () => {
  assert.throws(() => buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: [record('future-post', 'tutorial', 'published', 'Unity', '2026-05-24T00:00:00.000Z', 1, 'public-url', 'https://blog.example.com/future')],
  }), /publishedAt cannot be in the future/u);

  assert.throws(() => buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: [{
      ...record('bad-hash', 'tutorial', 'published', 'Unity', '2026-05-18T09:00:00.000Z', 1, 'public-url', 'https://blog.example.com/bad-hash'),
      evidence: [{
        type: 'public-url',
        capturedAt: '2026-05-18T09:00:00.000Z',
        sourceHash: 'not-a-hash',
      }],
    }],
  }), /sourceHash must be a SHA-256/u);

  assert.throws(() => buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: [{
      ...record('private-url', 'tutorial', 'published', 'Unity', '2026-05-18T09:00:00.000Z', 1, 'public-url', 'https://blog.example.com/private-url'),
      evidence: [{
        type: 'public-url',
        capturedAt: '2026-05-18T09:00:00.000Z',
        sourceHash: '2'.repeat(64),
        sourceUrl: 'http://localhost/private',
      }],
    }],
  }), /sourceUrl must be a public HTTPS URL/u);

  assert.throws(() => buildContentCadenceReport({
    now: new Date('2026-05-23T00:00:00.000Z'),
    records: [{
      ...record('bad-signups', 'tutorial', 'published', 'Unity', '2026-05-18T09:00:00.000Z', 1, 'public-url', 'https://blog.example.com/bad-signups'),
      organicSignupsAttributed: 1.5,
    }],
  }), /organicSignupsAttributed must be a non-negative integer/u);
});
