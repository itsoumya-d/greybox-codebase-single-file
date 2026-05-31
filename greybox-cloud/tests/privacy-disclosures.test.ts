// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildPrivacyDisclosureReport,
  privacyDisclosuresFromEnv,
} from '../src/enterprise/privacyDisclosures.js';
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

test('privacy disclosures cover CCPA, COPPA, and India DPDPA without secret leakage', () => {
  const report = buildPrivacyDisclosureReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
  });

  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.match(report.disclaimer, /readiness evidence/u);
  assert.ok(report.sources.some((source) => source.id === 'ca-oag-ccpa-required-notices'));
  assert.ok(report.sources.some((source) => source.id === 'ftc-coppa-faq'));
  assert.ok(report.sources.some((source) => source.id === 'meity-dpdpa-2023'));
  assert.ok(report.disclosures.some((disclosure) => disclosure.jurisdiction === 'ccpa-cpra'));
  assert.ok(report.disclosures.some((disclosure) => disclosure.jurisdiction === 'coppa'));
  assert.ok(report.disclosures.some((disclosure) => disclosure.jurisdiction === 'india-dpdpa'));
  assert.equal(report.policySettings.sellsOrSharesPersonalInformation, false);
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN|anthropic-configured/u);
});

test('privacy disclosures reflect launch flags for sale/share and child data collection', () => {
  const report = buildPrivacyDisclosureReport({
    env: {
      GREYBOX_CCPA_SELLS_OR_SHARES_PERSONAL_INFORMATION: 'true',
      GREYBOX_COLLECTS_CHILD_PERSONAL_INFORMATION: 'true',
      GREYBOX_SUPPORTS_SCHOOL_USE: 'true',
      GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@example.com',
      GREYBOX_GRIEVANCE_EMAIL: 'grievance@example.com',
    },
  });

  const ccpa = report.disclosures.find((disclosure) => disclosure.id === 'california-required-notices');
  assert.equal(ccpa?.requirements.find((requirement) => requirement.id === 'do-not-sell-share')?.status, 'needs-counsel');
  const coppa = report.disclosures.find((disclosure) => disclosure.id === 'coppa-parent-notice-consent');
  assert.equal(coppa?.status, 'needs-counsel');
  assert.equal(coppa?.requirements.find((requirement) => requirement.id === 'direct-parent-notice')?.status, 'needs-counsel');
  assert.equal(coppa?.requirements.find((requirement) => requirement.id === 'school-authorization')?.status, 'needs-counsel');
  assert.equal(report.policySettings.grievanceEmail, 'grievance@example.com');
});

test('privacy disclosures can be overridden from deployment JSON', () => {
  const disclosures = privacyDisclosuresFromEnv({
    GREYBOX_PRIVACY_DISCLOSURES_JSON: JSON.stringify([{
      id: 'custom-ccpa',
      jurisdiction: 'ccpa-cpra',
      label: 'Custom California disclosure',
      audience: 'California consumers',
      routeHint: '/privacy#ca',
      status: 'ready',
      owner: 'Privacy',
      lastReviewedAt: '2026-05-17T00:00:00.000Z',
      requirements: [{
        id: 'custom-notice',
        label: 'Custom notice',
        sourceIds: ['cppa-ccpa-regulations-2026'],
        status: 'ready',
        implementation: 'Counsel-approved notice text is published.',
      }],
    }]),
  });

  assert.equal(disclosures?.length, 1);
  assert.equal(disclosures?.[0]?.id, 'custom-ccpa');
  assert.equal(disclosures?.[0]?.status, 'ready');
});

test('privacy disclosures endpoint is public and filterable by jurisdiction', async () => {
  await withServer({
    privacyDisclosureEnv: {
      GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
      GREYBOX_GRIEVANCE_EMAIL: 'grievance@greybox.studio',
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/privacy/disclosures`);
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { disclosures: number };
      disclosures: Array<{ jurisdiction: string }>;
    };
    assert.equal(report.summary.disclosures, 3);

    const filtered = await fetch(`${baseUrl}/v1/privacy/disclosures?jurisdiction=coppa`);
    assert.equal(filtered.status, 200);
    const filteredReport = await filtered.json() as {
      summary: { disclosures: number };
      disclosures: Array<{ jurisdiction: string }>;
    };
    assert.equal(filteredReport.summary.disclosures, 1);
    assert.equal(filteredReport.disclosures[0]?.jurisdiction, 'coppa');
    assert.doesNotMatch(JSON.stringify(filteredReport), /API_KEY|SECRET|TOKEN/u);
  });
});
