// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { startPlaytestServer } from '../src/index.js';
import { createSeededPlatformerSample } from '../src/index.js';
import { redactPlaytestJson } from '../src/privacy/redaction.js';
import type { PlaytestBenchmarkReport, PlaytestRegressionReport, SafePlaytestReport } from '../src/index.js';

const AUTH_TOKEN = 'test-playtest-token';

interface ApiResult<T> {
  status: number;
  body: T;
}

async function closeServer(server: { close(callback: (err?: Error) => void): void }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function api<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: await response.json() as T,
  };
}

function authed(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: {
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...init.headers,
    },
  };
}

test('playtest API exposes health and protects playtest execution with bearer auth', async () => {
  const started = await startPlaytestServer({ authToken: AUTH_TOKEN });
  try {
    const health = await api<{ ok: boolean; service: string }>(started.url, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.service, 'greybox-playtest');

    const denied = await api<{ error: { code: string } }>(started.url, '/v1/playtest/run', {
      method: 'POST',
      body: JSON.stringify({ sample: '2d-platformer' }),
    });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.error.code, 'UNAUTHORIZED');
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API accepts local token headers without echoing rejected secrets', async () => {
  const started = await startPlaytestServer({
    authToken: AUTH_TOKEN,
    clock: { now: () => 1_800_000_000_000 },
  });
  try {
    const accepted = await api<{ report: SafePlaytestReport }>(
      started.url,
      '/v1/playtest/run',
      {
        method: 'POST',
        headers: { 'x-greybox-playtest-token': AUTH_TOKEN },
        body: JSON.stringify({
          sample: '2d-platformer',
          personas: ['casual'],
          durationMs: 1_000,
        }),
      },
    );
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.report.personasRun, 1);

    const unsafeToken = 'qa@example.com 10.0.0.42 sk_live_playtest_secret Bearer playtest-admin-0123456789abcdef';
    const rejected = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/playtest/run',
      {
        method: 'POST',
        headers: { 'x-greybox-playtest-token': unsafeToken },
        body: JSON.stringify({ sample: '2d-platformer' }),
      },
    );
    assert.equal(rejected.status, 401);
    assert.equal(rejected.body.error.code, 'UNAUTHORIZED');
    assert.doesNotMatch(JSON.stringify(rejected.body), /qa@example\.com|10\.0\.0\.42|sk_live_playtest_secret|playtest-admin/u);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API runs the seeded sample and returns a privacy-safe report summary', async () => {
  const started = await startPlaytestServer({
    authToken: AUTH_TOKEN,
    clock: { now: () => 1_800_000_000_000 },
  });
  try {
    const result = await api<{ report: SafePlaytestReport }>(
      started.url,
      '/v1/playtest/run',
      authed({
        method: 'POST',
        body: JSON.stringify({
          sample: '2d-platformer',
          personas: ['speedrunner', 'completionist', 'casual', 'explorer', 'achievement-chaser'],
          durationMs: 10 * 60 * 1_000,
          concurrency: 2,
        }),
      }),
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.report.personasRun, 5);
    assert.equal(result.body.report.runSummaries.length, 5);
    assert.ok(result.body.report.completedRuns >= 5);
    assert.ok(result.body.report.issues.length >= 3);
    assert.ok(result.body.report.suggestions.length >= 1);
    const serialized = JSON.stringify(result.body);
    assert.equal(serialized.includes('"runs"'), false);
    assert.equal(serialized.includes('<!doctype html>'), false);
    assert.equal(serialized.includes('greybox:playtest:event'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API builds benchmark proof with redacted human acceptance evidence', async () => {
  const started = await startPlaytestServer({
    authToken: AUTH_TOKEN,
    clock: { now: () => 1_800_000_000_000 },
  });
  try {
    const result = await api<{
      report: SafePlaytestReport;
      benchmark: PlaytestBenchmarkReport;
    }>(
      started.url,
      '/v1/playtest/benchmark',
      authed({
        method: 'POST',
        body: JSON.stringify({
          sample: '2d-platformer',
          personas: 'alpha',
          durationMs: 10 * 60 * 1_000,
          humanAcceptance: {
            studyId: 'platformer-api-study-01',
            participantExternalId: 'human.playtester@example.com',
            participantRole: 'human-playtester',
            decision: 'accepted',
            consentConfirmed: true,
            notes: 'Accepted after replay. Call +1 (555) 123-4567 from lab 10.0.0.42.',
          },
        }),
      }),
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.benchmark.ready, true);
    assert.equal(result.body.benchmark.summary.personasRun, 10);
    assert.ok(result.body.benchmark.summary.completedRuns >= 5);
    assert.ok(result.body.benchmark.summary.seededBugsIdentified >= 3);
    assert.equal(result.body.benchmark.summary.humanAcceptedSuggestions, 1);
    assert.equal(result.body.report.runSummaries.length, 10);
    const serialized = JSON.stringify(result.body);
    assert.doesNotMatch(serialized, /human\.playtester@example\.com|\+1 \(555\) 123-4567|10\.0\.0\.42/u);
    assert.doesNotMatch(serialized, /Accepted after replay/u);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API redacts PII from echoed artifact metadata without masking timestamps', async () => {
  const started = await startPlaytestServer({
    authToken: AUTH_TOKEN,
    clock: { now: () => 1_800_000_000_000 },
  });
  try {
    const result = await api<{ report: SafePlaytestReport }>(
      started.url,
      '/v1/playtest/run',
      authed({
        method: 'POST',
        body: JSON.stringify({
          artifact: {
            id: 'pii-artifact',
            title: 'QA qa@example.com +1 (555) 123-4567 10.0.0.42 sk_live_api_secret 4242 4242 4242 4242 pi_live_api',
            engine: 'html-canvas',
            durationTargetMs: 1_000,
            contentIds: ['spawn-room'],
            seededBugs: [],
          },
          personas: ['casual'],
          durationMs: 1_000,
        }),
      }),
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.report.id, 'playtest-pii-artifact-1800000000000');
    assert.equal(
      result.body.report.artifactTitle,
      'QA [redacted-email] [redacted-phone] [redacted-ip] [redacted-secret] [redacted-card] [redacted-stripe-id]',
    );
    const serialized = JSON.stringify(result.body);
    assert.doesNotMatch(serialized, /qa@example\.com|\+1 \(555\) 123-4567|10\.0\.0\.42|sk_live_api_secret|4242 4242|pi_live_api/u);
    assert.doesNotMatch(result.body.report.id, /\[redacted-phone\]/u);
    assert.doesNotMatch(result.body.report.id, /\[redacted-card\]/u);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest JSON redactor sanitizes object keys without collapsing evidence', () => {
  const redacted = redactPlaytestJson({
    'qa@example.com': 'first',
    'ops@example.com': 'second',
    nested: {
      '10.0.0.42 sk_live_key pi_live_key': 'unsafe key and qa@example.com value',
    },
  });
  const serialized = JSON.stringify(redacted);

  assert.doesNotMatch(serialized, /qa@example\.com|ops@example\.com|10\.0\.0\.42|sk_live_key|pi_live_key/u);
  assert.match(serialized, /\[redacted-email\]#[a-f0-9]{8}/u);
  assert.match(serialized, /\[redacted-ip\] \[redacted-secret\] \[redacted-stripe-id\]#[a-f0-9]{8}/u);
  assert.equal(Object.keys(redacted as Record<string, unknown>).length, 3);
});

test('playtest API rejects malformed custom seeded bug definitions', async () => {
  const started = await startPlaytestServer({ authToken: AUTH_TOKEN });
  try {
    const result = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/playtest/run',
      authed({
        method: 'POST',
        body: JSON.stringify({
          artifact: {
            id: 'bad-seeded-bug',
            title: 'Bad Seeded Bug',
            engine: 'html-canvas',
            durationTargetMs: 10_000,
            contentIds: ['spawn-room'],
            seededBugs: [{
              id: 'bug-bad',
              label: 'Bad detector shape',
              kind: 'collision',
              severity: 'catastrophic',
              targetId: 'spawn-room',
              triggerAtMs: 2_000,
              detectorHints: ['bad'],
              suggestedFix: 'Use a supported severity.',
            }],
          },
          personas: ['casual'],
          durationMs: 1_000,
        }),
      }),
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'BAD_REQUEST');
    assert.match(result.body.error.message, /severity is not supported/u);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API builds regression proof for accepted tuner reruns', async () => {
  const artifact = createSeededPlatformerSample();
  const afterArtifact = {
    ...artifact,
    seededBugs: artifact.seededBugs.slice(1),
  };
  const started = await startPlaytestServer({
    authToken: AUTH_TOKEN,
    clock: { now: () => 1_800_000_000_000 },
  });
  try {
    const result = await api<{
      before: SafePlaytestReport;
      after: SafePlaytestReport;
      regression: PlaytestRegressionReport;
    }>(
      started.url,
      '/v1/playtest/regression',
      authed({
        method: 'POST',
        body: JSON.stringify({
          before: {
            artifact,
            personas: 'alpha',
            durationMs: 10 * 60 * 1_000,
          },
          after: {
            artifact: afterArtifact,
            personas: 'alpha',
            durationMs: 10 * 60 * 1_000,
          },
          acceptedSuggestionIds: ['accepted-api-rerun'],
        }),
      }),
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.before.id, 'playtest-sample-2d-platformer-1800000000000');
    assert.equal(result.body.after.id, 'playtest-sample-2d-platformer-1800000000001');
    assert.equal(result.body.regression.generatedAt, 1_800_000_000_002);
    assert.equal(result.body.regression.readyForRepeatLoop, true);
    assert.equal(result.body.regression.summary.resolvedSeededBugs, 1);
    assert.equal(result.body.regression.summary.acceptedSuggestionsApplied, 1);
    assert.deepEqual(result.body.regression.acceptedSuggestionIds, ['accepted-api-rerun']);
    assert.equal(JSON.stringify(result.body).includes('"runs"'), false);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API rejects malformed regression requests', async () => {
  const started = await startPlaytestServer({ authToken: AUTH_TOKEN });
  try {
    const result = await api<{ error: { code: string; message: string } }>(
      started.url,
      '/v1/playtest/regression',
      authed({
        method: 'POST',
        body: JSON.stringify({
          before: { sample: '2d-platformer' },
          after: { sample: '2d-platformer' },
          targets: { minResolvedSeededBugs: -1 },
        }),
      }),
    );
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'BAD_REQUEST');
    assert.match(result.body.error.message, /targets\.minResolvedSeededBugs must be a non-negative integer/u);
  } finally {
    await closeServer(started.server);
  }
});

test('playtest API fails closed when auth is missing or payloads exceed the bound', async () => {
  const missingAuth = await startPlaytestServer({ clock: { now: () => 1 } });
  try {
    const result = await api<{ error: { code: string } }>(
      missingAuth.url,
      '/v1/playtest/run',
      {
        method: 'POST',
        body: JSON.stringify({ sample: '2d-platformer' }),
      },
    );
    assert.equal(result.status, 503);
    assert.equal(result.body.error.code, 'PLAYTEST_AUTH_TOKEN_MISSING');
  } finally {
    await closeServer(missingAuth.server);
  }

  const bounded = await startPlaytestServer({ authToken: AUTH_TOKEN, maxBodyBytes: 32 });
  try {
    const result = await api<{ error: { code: string } }>(
      bounded.url,
      '/v1/playtest/run',
      authed({
        method: 'POST',
        body: JSON.stringify({ sample: '2d-platformer', padding: 'x'.repeat(128) }),
      }),
    );
    assert.equal(result.status, 413);
    assert.equal(result.body.error.code, 'PAYLOAD_TOO_LARGE');
  } finally {
    await closeServer(bounded.server);
  }
});
