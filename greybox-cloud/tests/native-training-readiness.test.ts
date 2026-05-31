// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildNativeTrainingReadinessReport,
  formatNativeTrainingReadinessMarkdown,
  nativeTrainingCandidatesFromEnv,
} from '../src/enterprise/nativeTrainingReadiness.js';
import { FileModelTrainingConsentStore } from '../src/enterprise/modelTrainingConsent.js';
import { createGreyboxCloudServer } from '../src/server.js';
import type { AuthContext } from '../src/types.js';

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

const authContext: AuthContext = {
  tenantId: 'tenant-native',
  userId: 'designer-1',
  tier: 'studio',
  tokenHash: 'token-hash',
  roles: [],
};

test('Native training readiness admits only opted-in high-quality hashed artifacts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-native-readiness-'));
  try {
    const consentStore = new FileModelTrainingConsentStore(dir);
    await consentStore.create({
      projectId: 'project-alpha',
      artifactId: 'artifact-hud',
      status: 'opted-in',
      source: 'artifact-rating',
      separateCheckboxAccepted: true,
      consentText: 'I explicitly allow Greybox Native model training on this project.',
      allowedUses: ['greybox-native-training'],
      dataCategories: ['rated artifact'],
    }, authContext, new Date('2026-05-18T00:00:00.000Z'));
    await consentStore.create({
      projectId: 'project-revoked',
      status: 'opted-in',
      separateCheckboxAccepted: true,
      consentText: 'I explicitly allow Greybox Native model training on this project.',
      allowedUses: ['greybox-native-training'],
    }, authContext, new Date('2026-05-18T00:01:00.000Z'));
    await consentStore.create({
      projectId: 'project-revoked',
      status: 'revoked',
      source: 'settings-checkbox',
    }, authContext, new Date('2026-05-18T00:02:00.000Z'));

    const report = await buildNativeTrainingReadinessReport({
      consentStore,
      targetConsentedProjects: 1,
      targetEligibleArtifacts: 1,
      now: new Date('2026-05-18T00:03:00.000Z'),
      candidates: [
        {
          tenantId: 'tenant-native',
          projectId: 'project-alpha',
          artifactId: 'artifact-hud',
          artifactType: 'hud-html',
          contentSha256: 'a'.repeat(64),
          qualityScore: 4.7,
          humanReviewed: true,
          piiDetected: false,
          dataCategories: ['rated artifact'],
        },
      ],
    });

    assert.equal(report.summary.status, 'pass');
    assert.equal(report.summary.readyForTrainingExport, true);
    assert.equal(report.summary.eligibleArtifacts, 1);
    assert.equal(report.summary.consentedProjects, 1);
    assert.equal(report.summary.revokedOrOptedOutProjects, 1);
    assert.deepEqual(report.excludedSamples, []);
    assert.equal(report.artifactTypes.find((item) => item.artifactType === 'hud-html')?.eligible, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Native training readiness fails closed on raw payloads and PII', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-native-readiness-fail-'));
  try {
    const consentStore = new FileModelTrainingConsentStore(dir);
    await consentStore.create({
      projectId: 'project-secret',
      status: 'opted-in',
      separateCheckboxAccepted: true,
      consentText: 'I explicitly allow Greybox Native model training on this project.',
      allowedUses: ['greybox-native-training'],
    }, authContext, new Date('2026-05-18T00:00:00.000Z'));
    const report = await buildNativeTrainingReadinessReport({
      consentStore,
      targetConsentedProjects: 1,
      targetEligibleArtifacts: 1,
      candidates: [
        {
          projectId: 'project-secret',
          artifactType: 'design-md',
          contentSha256: 'c'.repeat(64),
          qualityScore: 5,
          humanReviewed: true,
          piiDetected: true,
          dataCategories: ['personal data'],
          // Unknown raw fields are intentionally detected but never echoed.
          ...{ markdown: 'boss arena secret for alex@example.com' },
        },
      ],
    });
    const markdown = formatNativeTrainingReadinessMarkdown(report);

    assert.equal(report.summary.status, 'fail');
    assert.equal(report.summary.rawPayloadBlockedArtifacts, 1);
    assert.equal(report.summary.piiBlockedArtifacts, 1);
    assert.deepEqual(report.excludedSamples[0]?.reasons, ['raw_payload_present', 'pii_detected']);
    assert.doesNotMatch(JSON.stringify(report), /alex@example\.com|boss arena secret/u);
    assert.doesNotMatch(markdown, /alex@example\.com|boss arena secret/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Native training readiness route is admin-protected and sanitized', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-native-readiness-route-'));
  try {
    const consentStore = new FileModelTrainingConsentStore(dir);
    await consentStore.create({
      projectId: 'project-route',
      status: 'opted-in',
      separateCheckboxAccepted: true,
      consentText: 'I explicitly allow Greybox Native model training on this project.',
      allowedUses: ['greybox-native-training'],
    }, authContext);
    await withServer({
      auditAdminToken: 'admin-secret',
      modelTrainingConsentStore: consentStore,
      nativeTrainingCandidates: [{
        projectId: 'project-route',
        artifactType: 'gameview',
        contentSha256: 'd'.repeat(64),
        qualityScore: 4.4,
        humanReviewed: true,
      }],
    }, async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/v1/model-training/native-readiness`);
      assert.equal(denied.status, 401);
      assert.deepEqual(await denied.json(), { error: 'model_training_admin_required' });

      const response = await fetch(`${baseUrl}/v1/model-training/native-readiness?format=markdown`, {
        headers: { authorization: 'Bearer admin-secret' },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'text/markdown; charset=utf-8');
      const text = await response.text();
      assert.match(text, /Greybox Native Training Readiness/u);
      assert.match(text, /Ready for training export: no/u);
      assert.doesNotMatch(text, /admin-secret|I explicitly allow/u);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Native training candidate env parser ignores malformed payloads', () => {
  assert.deepEqual(nativeTrainingCandidatesFromEnv({ GREYBOX_NATIVE_TRAINING_CANDIDATES_JSON: 'nope' }), []);
  assert.deepEqual(
    nativeTrainingCandidatesFromEnv({
      GREYBOX_NATIVE_TRAINING_CANDIDATES_JSON: JSON.stringify([{ projectId: 'project-env' }, null, 'raw']),
    }),
    [{ projectId: 'project-env' }],
  );
});
