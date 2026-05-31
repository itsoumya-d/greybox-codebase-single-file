// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildPrivacyGovernanceReport,
  privacyGovernanceFromEnv,
} from '../src/enterprise/privacyGovernance.js';
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

test('privacy governance report maps ROPA, DPIA, and DPO evidence to GDPR articles', () => {
  const report = buildPrivacyGovernanceReport({ now: new Date('2026-05-17T00:00:00.000Z') });

  assert.match(report.disclaimer, /readiness evidence/u);
  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.ok(report.articleReferences.some((reference) => reference.id === 'gdpr-article-30'));
  assert.ok(report.articleReferences.some((reference) => reference.id === 'gdpr-article-35'));
  assert.ok(report.articleReferences.some((reference) => reference.id === 'gdpr-article-37'));
  assert.ok(report.summary.ropaRecordCount >= 7);
  assert.ok(report.summary.dpiaAssessmentCount >= 3);
  assert.equal(report.summary.dpoAppointed, false);
  assert.ok(report.ropaRecords.some((record) => record.id === 'greybox-native-training-opt-in' && record.legalBases.includes('consent')));
  assert.ok(report.dpiaAssessments.some((assessment) => assessment.id === 'dpia-managed-inference' && assessment.highRisk));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN|anthropic-configured/u);
});

test('privacy governance supports deployment DPO evidence and JSON overrides', () => {
  const override = privacyGovernanceFromEnv({
    GREYBOX_PRIVACY_GOVERNANCE_JSON: JSON.stringify({
      ropaRecords: [{
        id: 'custom-support',
        name: 'Customer support',
        role: 'controller',
        owner: 'Support',
        purposes: ['support'],
        legalBases: ['contract'],
        dataSubjects: ['admins'],
        personalDataCategories: ['email'],
        specialCategoryDataCategories: [],
        recipients: ['support staff'],
        subprocessorIds: [],
        regions: ['eu'],
        internationalTransfers: ['same-region'],
        retentionPolicy: 'Support records follow the support retention schedule.',
        securityMeasures: ['least privilege'],
        systems: ['support desk'],
        lastReviewedAt: '2026-05-17T00:00:00.000Z',
      }],
      dpiaAssessments: [],
    }),
  });
  assert.equal(override?.ropaRecords?.[0]?.id, 'custom-support');
  assert.deepEqual(override?.dpiaAssessments, []);

  const report = buildPrivacyGovernanceReport({
    env: {
      GREYBOX_DPO_NAME: 'Greybox Privacy Lead',
      GREYBOX_DPO_EMAIL: 'Privacy@Greybox.Studio',
      GREYBOX_DPO_REGION: 'EU',
      GREYBOX_DPO_APPOINTED_AT: '2026-05-17',
      GREYBOX_DPO_SUPERVISORY_AUTHORITY_NOTIFIED: 'true',
    },
  });

  assert.equal(report.dpo.appointed, true);
  assert.equal(report.dpo.email, 'privacy@greybox.studio');
  assert.equal(report.dpo.region, 'EU');
  assert.equal(report.dpo.supervisoryAuthorityNotified, true);
});

test('privacy governance endpoint is admin protected and exposes scoped views', async () => {
  await withServer({
    auditAdminToken: 'privacy-admin-0123456789abcdef',
    privacyGovernanceEnv: {
      GREYBOX_DPO_NAME: 'Greybox Privacy Lead',
      GREYBOX_DPO_EMAIL: 'privacy@greybox.studio',
      GREYBOX_DPO_REGION: 'global',
      GREYBOX_DPO_APPOINTED_AT: '2026-05-17T00:00:00.000Z',
    },
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/privacy-governance`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'privacy_admin_required' });

    const full = await fetch(`${baseUrl}/v1/enterprise/privacy-governance`, {
      headers: { authorization: 'Bearer privacy-admin-0123456789abcdef' },
    });
    assert.equal(full.status, 200);
    const report = await full.json() as {
      summary: { dpoAppointed: boolean; ropaRecordCount: number };
      dpo: { appointed: boolean; email?: string };
    };
    assert.equal(report.summary.dpoAppointed, true);
    assert.equal(report.dpo.email, 'privacy@greybox.studio');
    assert.ok(report.summary.ropaRecordCount >= 7);

    const ropa = await fetch(`${baseUrl}/v1/enterprise/privacy-governance/ropa`, {
      headers: { authorization: 'Bearer privacy-admin-0123456789abcdef' },
    });
    assert.equal(ropa.status, 200);
    const ropaBody = await ropa.json() as { records: Array<{ id: string }> };
    assert.ok(ropaBody.records.some((record) => record.id === 'managed-inference-routing'));

    const dpia = await fetch(`${baseUrl}/v1/enterprise/privacy-governance/dpia`, {
      headers: { authorization: 'Bearer privacy-admin-0123456789abcdef' },
    });
    assert.equal(dpia.status, 200);
    const dpiaBody = await dpia.json() as { assessments: Array<{ id: string; highRisk: boolean }> };
    assert.ok(dpiaBody.assessments.some((assessment) => assessment.highRisk));

    const dpo = await fetch(`${baseUrl}/v1/enterprise/privacy-governance/dpo`, {
      headers: { authorization: 'Bearer privacy-admin-0123456789abcdef' },
    });
    assert.equal(dpo.status, 200);
    const dpoBody = await dpo.json() as { dpo: { appointed: boolean } };
    assert.equal(dpoBody.dpo.appointed, true);
  });
});
