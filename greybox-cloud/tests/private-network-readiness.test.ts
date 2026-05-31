// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildPrivateNetworkReadinessReport,
  privateNetworkProfilesFromEnv,
} from '../src/enterprise/privateNetworkReadiness.js';
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

function readyEnv(): Record<string, string> {
  return {
    GREYBOX_AWS_VPC_PROFILE_ID: 'aws-titanforge',
    GREYBOX_AWS_VPC_CUSTOMER_NAME: 'Titanforge Games',
    GREYBOX_AWS_VPC_REGION: 'us-east-1',
    GREYBOX_AWS_VPC_PEERING_ID: 'pcx-abc123def456',
    GREYBOX_AWS_VPC_CUSTOMER_NETWORK_ID: 'vpc-aaa111bbb222',
    GREYBOX_AWS_VPC_GREYBOX_NETWORK_ID: 'vpc-ccc333ddd444',
    GREYBOX_AWS_VPC_CUSTOMER_CIDR: '10.10.0.0/16',
    GREYBOX_AWS_VPC_GREYBOX_CIDR: '10.60.0.0/16',
    GREYBOX_AWS_VPC_CIDR_NON_OVERLAP: 'true',
    GREYBOX_AWS_VPC_ROUTES_UPDATED: 'true',
    GREYBOX_AWS_VPC_SECURITY_RULES_SCOPED: 'true',
    GREYBOX_AWS_VPC_DNS_ENABLED: 'true',
    GREYBOX_AWS_VPC_LAST_VALIDATED_AT: '2026-05-17T00:00:00.000Z',
    GREYBOX_AZURE_VNET_PROFILE_ID: 'azure-lumencart',
    GREYBOX_AZURE_VNET_CUSTOMER_NAME: 'Lumencart Studio',
    GREYBOX_AZURE_VNET_REGION: 'eastus',
    GREYBOX_AZURE_VNET_PEERING_ID: 'gbx-to-lumencart',
    GREYBOX_AZURE_VNET_CUSTOMER_NETWORK_ID: '/subscriptions/customer/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/customer-vnet',
    GREYBOX_AZURE_VNET_GREYBOX_NETWORK_ID: '/subscriptions/greybox/resourceGroups/rg/providers/Microsoft.Network/virtualNetworks/greybox-vnet',
    GREYBOX_AZURE_VNET_CUSTOMER_CIDR: '10.20.0.0/16',
    GREYBOX_AZURE_VNET_GREYBOX_CIDR: '10.70.0.0/16',
    GREYBOX_AZURE_VNET_CIDR_NON_OVERLAP: 'true',
    GREYBOX_AZURE_VNET_BIDIRECTIONAL_CONNECTED: 'true',
    GREYBOX_AZURE_VNET_NSG_RULES_SCOPED: 'true',
    GREYBOX_AZURE_VNET_PRIVATE_DNS_CONFIGURED: 'true',
    GREYBOX_AZURE_VNET_LAST_VALIDATED_AT: '2026-05-17T00:00:00.000Z',
  };
}

test('private network readiness reports no profiles until enterprise peering is configured', () => {
  const report = buildPrivateNetworkReadinessReport({
    now: new Date('2026-05-17T00:00:00.000Z'),
    env: {},
  });

  assert.equal(report.generatedAt, '2026-05-17T00:00:00.000Z');
  assert.equal(report.summary.profiles, 0);
  assert.equal(report.summary.failed, 0);
  assert.ok(report.sourceReferences.some((source) => source.id === 'aws-vpc-peering'));
  assert.ok(report.sourceReferences.some((source) => source.id === 'azure-vnet-peering'));
});

test('private network readiness passes complete AWS and Azure profiles', () => {
  const report = buildPrivateNetworkReadinessReport({ env: readyEnv() });

  assert.equal(report.summary.profiles, 2);
  assert.equal(report.summary.passed, 2);
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.summary.failed, 0);
  assert.ok(report.profiles.every((profile) => profile.status === 'pass'));
  assert.ok(report.profiles.some((profile) => profile.provider === 'aws' && profile.connectionId === 'pcx-abc123def456'));
  assert.ok(report.profiles.some((profile) => profile.provider === 'azure' && profile.connectionId === 'gbx-to-lumencart'));
  assert.doesNotMatch(JSON.stringify(report), /API_KEY|SECRET|TOKEN/u);
});

test('private network readiness fails malformed ids and incomplete route/security checks', () => {
  const env = readyEnv();
  env.GREYBOX_AWS_VPC_PEERING_ID = 'bad-peering';
  env.GREYBOX_AWS_VPC_ROUTES_UPDATED = 'false';
  env.GREYBOX_AZURE_VNET_BIDIRECTIONAL_CONNECTED = 'false';
  const report = buildPrivateNetworkReadinessReport({ env });

  assert.equal(report.summary.failed, 2);
  assert.equal(report.profiles.find((profile) => profile.provider === 'aws')?.status, 'fail');
  assert.equal(report.profiles.find((profile) => profile.provider === 'azure')?.status, 'fail');
});

test('private network profiles can be overridden from deployment JSON', () => {
  const profiles = privateNetworkProfilesFromEnv({
    GREYBOX_PRIVATE_NETWORKS_JSON: JSON.stringify([{
      id: 'aws-custom',
      provider: 'aws',
      customerName: 'Custom Studio',
      region: 'us-west-2',
      status: 'pass',
      connectionId: 'pcx-custom123',
      checks: [{
        id: 'route-tables',
        label: 'Route tables updated',
        status: 'pass',
        detail: 'Customer-approved route tables are updated.',
      }],
    }]),
  });

  assert.equal(profiles?.length, 1);
  assert.equal(profiles?.[0]?.id, 'aws-custom');
  assert.equal(profiles?.[0]?.status, 'pass');
});

test('private network readiness endpoint is admin protected and filterable', async () => {
  await withServer({
    auditAdminToken: 'network-admin-0123456789abcdef',
    privateNetworkEnv: readyEnv(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/private-network/readiness`);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'audit_admin_required' });

    const response = await fetch(`${baseUrl}/v1/enterprise/private-network/readiness?provider=aws`, {
      headers: { authorization: 'Bearer network-admin-0123456789abcdef' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as {
      summary: { profiles: number; passed: number };
      profiles: Array<{ provider: string; status: string }>;
    };
    assert.equal(report.summary.profiles, 1);
    assert.equal(report.summary.passed, 1);
    assert.equal(report.profiles[0]?.provider, 'aws');
    assert.equal(report.profiles[0]?.status, 'pass');
  });
});
