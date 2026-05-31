// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  buildProviderPolicyReadinessReport,
  providerDpaEvidenceFromEnv,
} from '../src/enterprise/providerPolicyReadiness.js';
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
    GREYBOX_PROVIDER_POLICY_JSON: JSON.stringify({
      allowedProviders: ['bedrock'],
      regionAllowedProviders: {
        us: ['bedrock'],
        eu: ['bedrock'],
        in: ['bedrock'],
      },
      tenants: {
        'tenant-acme': {
          allowedProviders: ['bedrock'],
          blockedProviders: ['openai'],
        },
      },
    }),
    GREYBOX_PROVIDER_DPA_JSON: JSON.stringify({
      bedrock: {
        status: 'signed',
        regions: ['us', 'eu', 'in'],
        transferBasis: 'customer-configured',
        effectiveAt: '2026-05-18T00:00:00.000Z',
      },
    }),
  };
}

test('provider policy readiness passes with region allowlists and signed DPA evidence', () => {
  const report = buildProviderPolicyReadinessReport({
    env: readyEnv(),
    now: new Date('2026-05-18T00:00:00.000Z'),
  });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.summary.policyConfigured, true);
  assert.equal(report.summary.regionsWithExplicitProviderPolicy, 3);
  assert.deepEqual(report.summary.allowedProviders, ['bedrock']);
  assert.deepEqual(report.summary.providersWithSignedDpa, ['bedrock']);
  assert.equal(report.summary.tenantPolicies, 1);
  assert.equal(report.regions.every((region) => region.providersMissingDpa.length === 0), true);
});

test('provider policy readiness fails closed on invalid policy or missing DPA coverage', () => {
  const invalid = buildProviderPolicyReadinessReport({
    env: {
      GREYBOX_PROVIDER_POLICY_JSON: '{nope',
      GREYBOX_PROVIDER_DPA_JSON: '{}',
    },
  });
  assert.equal(invalid.summary.status, 'fail');
  assert.equal(invalid.checks.find((check) => check.id === 'provider-policy-configured')?.status, 'fail');

  const missingDpa = buildProviderPolicyReadinessReport({
    env: {
      GREYBOX_PROVIDER_POLICY_JSON: JSON.stringify({
        allowedProviders: ['openai'],
        regionAllowedProviders: { us: ['openai'], eu: ['openai'], in: ['openai'] },
        tenants: { 'tenant-acme': { allowedProviders: ['openai'] } },
      }),
      GREYBOX_PROVIDER_DPA_JSON: JSON.stringify({
        openai: { status: 'planned', regions: ['us'], transferBasis: 'dpa' },
      }),
    },
  });
  assert.equal(missingDpa.summary.status, 'fail');
  assert.deepEqual(missingDpa.summary.providersMissingDpa, ['openai']);
  assert.match(missingDpa.checks.find((check) => check.id === 'provider-dpa-coverage')?.detail ?? '', /openai/u);

  const missingRegion = buildProviderPolicyReadinessReport({
    env: {
      GREYBOX_PROVIDER_POLICY_JSON: JSON.stringify({
        allowedProviders: ['bedrock'],
        regionAllowedProviders: { us: ['bedrock'], eu: ['bedrock'], in: ['bedrock'] },
        tenants: { 'tenant-acme': { allowedProviders: ['bedrock'] } },
      }),
      GREYBOX_PROVIDER_DPA_JSON: JSON.stringify({
        bedrock: {
          status: 'signed',
          regions: ['us'],
          transferBasis: 'customer-configured',
        },
      }),
    },
  });
  assert.equal(missingRegion.summary.status, 'fail');
  assert.deepEqual(missingRegion.summary.providersMissingDpa, ['bedrock']);
  assert.match(
    missingRegion.checks.find((check) => check.id === 'provider-dpa-coverage')?.detail ?? '',
    /bedrock in eu\/in/u,
  );
});

test('provider DPA env parser returns sanitized provider evidence only', () => {
  assert.deepEqual(providerDpaEvidenceFromEnv({ GREYBOX_PROVIDER_DPA_JSON: 'nope' }), []);
  assert.deepEqual(providerDpaEvidenceFromEnv({
    GREYBOX_PROVIDER_DPA_JSON: JSON.stringify({
      openai: {
        status: 'signed',
        regions: ['eu', 'unknown'],
        transferBasis: 'sccs',
        effectiveAt: '2026-05-18T00:00:00.000Z',
        secret: 'do-not-return',
      },
    }),
  }), [{
    provider: 'openai',
    status: 'signed',
    regions: ['eu'],
    transferBasis: 'sccs',
    effectiveAt: '2026-05-18T00:00:00.000Z',
  }]);
});

test('provider policy readiness endpoint is admin protected and sanitized', async () => {
  await withServer({
    auditAdminToken: 'admin-secret',
    providerPolicyEnv: readyEnv(),
  }, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/v1/enterprise/provider-policy/readiness`);
    assert.equal(denied.status, 401);

    const response = await fetch(`${baseUrl}/v1/enterprise/provider-policy/readiness`, {
      headers: { authorization: 'Bearer admin-secret' },
    });
    assert.equal(response.status, 200);
    const report = await response.json() as { summary: { status: string }; dpaEvidence: unknown[] };
    assert.equal(report.summary.status, 'pass');
    assert.doesNotMatch(JSON.stringify(report), /admin-secret|do-not-return/u);
    assert.equal(report.dpaEvidence.length, 1);
  });
});
