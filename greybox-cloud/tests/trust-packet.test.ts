// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildEnterpriseTrustPacket,
  formatEnterpriseTrustPacketMarkdown,
} from '../src/enterprise/trustPacket.js';
import type { TrustControlReport } from '../src/enterprise/trustControls.js';
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

function injectedTrustControlReport(): TrustControlReport {
  const controls = [
    'GBX-SEC-001',
    'GBX-SEC-002',
    'GBX-AI-001',
  ].map((id) => ({
    id,
    title: `${id} injected control`,
    frameworks: ['SOC 2 Security'],
    owner: 'Security Engineering',
    status: 'implemented' as const,
    description: 'Injected trust-packet route evidence.',
    evidence: [{
      id: `${id}-evidence`,
      label: `${id} route evidence`,
      status: 'implemented' as const,
      detail: 'Implemented in injected packet.',
    }],
  }));
  return {
    generatedAt: '2026-05-17T00:00:00.000Z',
    disclaimer: 'Injected trust-control evidence only.',
    summary: { implemented: controls.length, partial: 0, missing: 0 },
    controls,
  };
}

test('enterprise trust packet assembles diligence evidence without claiming certification', async () => {
  const packet = await buildEnterpriseTrustPacket({
    now: new Date('2026-05-17T00:00:00.000Z'),
    privacyGovernanceEnv,
    privacyDisclosureEnv: {
      GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
      GREYBOX_GRIEVANCE_EMAIL: 'privacy@greybox.studio',
    },
  });

  assert.match(packet.disclaimer, /not a SOC 2 report/u);
  assert.equal(packet.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.ok(packet.summary.documentCount >= 8);
  assert.ok(packet.summary.subprocessorCount >= 8);
  assert.equal(packet.summary.dpoAppointed, true);
  assert.equal(packet.summary.dataResidencyReadyRegions, 0);
  assert.equal(packet.summary.privateNetworkProfiles, 0);
  assert.ok(packet.summary.disclosuresNeedingCounsel >= 1);
  assert.ok(packet.summary.pendingDpiaReviews >= 1);
  assert.ok(packet.documents.some((document) => document.path === 'legal/DPA_TEMPLATE.md'));
  assert.ok(packet.risks.some((risk) => risk.id === 'pending-dpia-reviews'));
  assert.ok(packet.risks.some((risk) => risk.id === 'data-residency-regions-not-ready'));
  assert.ok(packet.risks.some((risk) => risk.id === 'private-network-not-configured'));
  assert.doesNotMatch(JSON.stringify(packet), /API_KEY|SECRET|TOKEN|anthropic-configured/u);
});

test('enterprise trust packet markdown is buyer-readable and sanitized', async () => {
  const packet = await buildEnterpriseTrustPacket({
    now: new Date('2026-05-17T00:00:00.000Z'),
    privacyGovernanceEnv,
    privacyDisclosureEnv: {
      GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
      GREYBOX_GRIEVANCE_EMAIL: 'privacy@greybox.studio',
    },
  });
  const markdown = formatEnterpriseTrustPacketMarkdown(packet);

  assert.match(markdown, /# Greybox Enterprise Trust Packet/u);
  assert.match(markdown, /## Summary/u);
  assert.match(markdown, /## Open Risks/u);
  assert.match(markdown, /## Document Index/u);
  assert.match(markdown, /legal\/DPA_TEMPLATE\.md/u);
  assert.match(markdown, /Data residency ready regions: 0\/3/u);
  assert.match(markdown, /not a SOC 2 report/u);
  assert.doesNotMatch(markdown, /API_KEY|SECRET|TOKEN|anthropic-configured|trust-packet-admin/u);
});

test('enterprise trust packet endpoint is admin protected', async () => {
  await withServer({ auditAdminToken: 'trust-packet-admin-0123456789abcdef' }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/trust-packet`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });
  });
});

test('enterprise trust packet endpoint returns the combined packet for admins', async () => {
  await withServer({
    auditAdminToken: 'trust-packet-admin-0123456789abcdef',
    trustControlReport: injectedTrustControlReport(),
    privacyGovernanceEnv,
    privacyDisclosureEnv: {
      GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
      GREYBOX_GRIEVANCE_EMAIL: 'privacy@greybox.studio',
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/trust-packet`, {
      headers: { authorization: 'Bearer trust-packet-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const packet = await response.json() as {
      summary: { documentCount: number; dpoAppointed: boolean; controlsImplemented: number };
      trustControls: { controls: Array<{ id: string; status: string }> };
      privacyDisclosures: { disclosures: Array<{ jurisdiction: string }> };
      privacyGovernance: { dpo: { appointed: boolean } };
      dataResidencyReadiness: { supportedRegions: string[] };
      privateNetworkReadiness: { summary: { profiles: number } };
    };
    assert.ok(packet.summary.documentCount >= 8);
    assert.equal(packet.summary.dpoAppointed, true);
    assert.equal(packet.summary.controlsImplemented, 3);
    assert.ok(packet.trustControls.controls.some((control) => control.id === 'GBX-SEC-001' && control.status === 'implemented'));
    assert.ok(packet.privacyDisclosures.disclosures.some((disclosure) => disclosure.jurisdiction === 'india-dpdpa'));
    assert.equal(packet.privacyGovernance.dpo.appointed, true);
    assert.deepEqual(packet.dataResidencyReadiness.supportedRegions, ['us', 'eu', 'in']);
    assert.equal(packet.privateNetworkReadiness.summary.profiles, 0);
  });
});

test('enterprise trust packet endpoint supports markdown export', async () => {
  await withServer({
    auditAdminToken: 'trust-packet-admin-0123456789abcdef',
    privacyGovernanceEnv,
    privacyDisclosureEnv: {
      GREYBOX_PRIVACY_CONTACT_EMAIL: 'privacy@greybox.studio',
      GREYBOX_GRIEVANCE_EMAIL: 'privacy@greybox.studio',
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/enterprise/trust-packet?format=markdown`, {
      headers: { authorization: 'Bearer trust-packet-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/markdown/u);
    const markdown = await response.text();
    assert.match(markdown, /Greybox Enterprise Trust Packet/u);
    assert.match(markdown, /Subprocessors/u);
    assert.doesNotMatch(markdown, /trust-packet-admin-0123456789abcdef/u);
  });
});
