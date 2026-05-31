// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildCertificationRoadmapReport,
  type CertificationRoadmapReport,
} from '../src/enterprise/certificationRoadmap.js';
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

const privacyGovernanceEnv = {
  GREYBOX_DPO_NAME: 'Greybox Privacy Lead',
  GREYBOX_DPO_EMAIL: 'privacy@greybox.studio',
  GREYBOX_DPO_REGION: 'global',
  GREYBOX_DPO_APPOINTED_AT: '2026-05-17T00:00:00.000Z',
};

const privacyDisclosureEnv = {
  GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
  GREYBOX_GRIEVANCE_EMAIL: 'privacy@greybox.studio',
};

test('certification roadmap maps brief milestones, costs, and caveats', async () => {
  const report = await buildCertificationRoadmapReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
    startAt: new Date('2026-05-17T00:00:00.000Z'),
    privacyGovernanceEnv,
    privacyDisclosureEnv,
  });

  assert.equal(report.certificationClaims, false);
  assert.match(report.disclaimer, /not a SOC 2 report, ISO 27001 certificate/u);
  assert.equal(report.summary.milestones, 5);
  assert.equal(report.summary.totalApproxCostUsd, 130_000);
  assert.equal(report.summary.monthsElapsed, 0);
  assert.equal(report.milestones.find((milestone) => milestone.id === 'gdpr-readiness')?.targetMonth, 6);
  assert.equal(report.milestones.find((milestone) => milestone.id === 'gdpr-readiness')?.approxCostUsd, 5_000);
  assert.equal(report.milestones.find((milestone) => milestone.id === 'gdpr-readiness')?.dueBy, '2026-11-17T00:00:00.000Z');
  assert.equal(report.milestones.find((milestone) => milestone.id === 'soc2-type-i')?.targetMonth, 12);
  assert.equal(report.milestones.find((milestone) => milestone.id === 'soc2-type-i')?.approxCostUsd, 25_000);
  assert.equal(report.milestones.find((milestone) => milestone.id === 'soc2-type-ii')?.targetMonth, 18);
  assert.equal(report.milestones.find((milestone) => milestone.id === 'iso-27001')?.targetMonth, 24);
  assert.ok(report.issues.some((issue) => issue.milestoneId === 'soc2-type-ii' && /auditor/u.test(issue.detail)));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN/u);
});

test('certification roadmap marks overdue missing evidence as blocked', async () => {
  const report = await buildCertificationRoadmapReport({
    now: new Date('2027-01-17T00:00:00.000Z'),
    startAt: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(report.summary.monthsElapsed, 8);
  const gdpr = report.milestones.find((milestone) => milestone.id === 'gdpr-readiness');
  assert.equal(gdpr?.status, 'blocked');
  assert.ok(gdpr?.blockers.some((blocker) => /DPO appointment/u.test(blocker)));
  assert.ok(report.issues.some((issue) => issue.milestoneId === 'gdpr-readiness' && issue.severity === 'error'));
});

test('certification roadmap endpoint is admin protected', async () => {
  await withServer({ auditAdminToken: 'cert-roadmap-admin-0123456789abcdef' }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/certification-roadmap`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });
  });
});

test('certification roadmap endpoint returns the milestone packet for admins', async () => {
  await withServer({
    auditAdminToken: 'cert-roadmap-admin-0123456789abcdef',
    privacyGovernanceEnv,
    privacyDisclosureEnv,
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/certification-roadmap`, {
      headers: { authorization: 'Bearer cert-roadmap-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as CertificationRoadmapReport;
    assert.equal(report.certificationClaims, false);
    assert.equal(report.summary.totalApproxCostUsd, 130_000);
    assert.deepEqual(report.milestones.map((milestone) => milestone.id), [
      'gdpr-readiness',
      'ccpa-coppa-dpdpa-readiness',
      'soc2-type-i',
      'soc2-type-ii',
      'iso-27001',
    ]);
    assert.ok(report.milestones.every((milestone) => milestone.blockers.length === 0 || milestone.nextAction.length > 0));
  });
});
