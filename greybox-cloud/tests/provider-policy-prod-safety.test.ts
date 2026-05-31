// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import type http from 'node:http';
import test from 'node:test';
import {
  HostedProductionProviderPolicyError,
  assertHostedProductionProviderPolicy,
  unverifiedProviderPolicyExplicitlyAllowed,
} from '../src/security/providerPolicyProdSafety.js';
import { createGreyboxCloudServer } from '../src/server.js';

async function withServer<T>(
  options: Parameters<typeof createGreyboxCloudServer>[0],
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server: http.Server = createGreyboxCloudServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function readyHostedEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
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
        },
      },
    }),
    GREYBOX_PROVIDER_DPA_JSON: JSON.stringify({
      bedrock: {
        status: 'signed',
        regions: ['us', 'eu', 'in'],
        transferBasis: 'customer-configured',
        effectiveAt: '2026-05-20T00:00:00.000Z',
      },
    }),
  };
}

function validBreakGlassEnv(): Record<string, string> {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_REASON: 'Incident INC-1234 provider policy evidence outage',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_EXPIRES_AT: '2026-05-23T12:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_NOW: '2026-05-23T00:00:00.000Z',
  };
}

test('hosted production provider policy guard accepts verified provider routing', () => {
  assert.doesNotThrow(() => assertHostedProductionProviderPolicy({
    env: readyHostedEnv(),
    now: new Date('2026-05-20T00:00:00.000Z'),
  }));
});

test('hosted production provider policy guard rejects missing policy and DPA evidence', () => {
  assert.throws(
    () => assertHostedProductionProviderPolicy({ env: { NODE_ENV: 'production' } }),
    (error) => {
      assert.ok(error instanceof HostedProductionProviderPolicyError);
      assert.equal(error.code, 'hosted_production_provider_policy_not_verified');
      assert.equal(error.report.summary.status, 'fail');
      assert.deepEqual(error.unsafeChecks.map((check) => check.id), [
        'provider-policy-configured',
        'region-provider-policy',
        'provider-dpa-coverage',
        'tenant-provider-overrides',
      ]);
      assert.match(error.message, /provider-policy-configured=warn/u);
      assert.match(error.message, /provider-dpa-coverage=fail/u);
      assert.doesNotMatch(error.message, /GREYBOX_PROVIDER_DPA_JSON=\{/u);
      return true;
    },
  );
});

test('hosted production provider policy guard rejects partial region coverage', () => {
  assert.throws(
    () => assertHostedProductionProviderPolicy({
      env: {
        NODE_ENV: 'production',
        GREYBOX_PROVIDER_POLICY_JSON: JSON.stringify({
          allowedProviders: ['openai'],
          regionAllowedProviders: { us: ['openai'] },
        }),
        GREYBOX_PROVIDER_DPA_JSON: JSON.stringify({
          openai: {
            status: 'signed',
            regions: ['us'],
            transferBasis: 'dpa',
          },
        }),
      },
    }),
    (error) => {
      assert.ok(error instanceof HostedProductionProviderPolicyError);
      assert.equal(error.report.summary.status, 'fail');
      assert.ok(error.unsafeChecks.some((check) => check.id === 'region-provider-policy'));
      assert.ok(error.unsafeChecks.some((check) => check.id === 'provider-dpa-coverage'));
      return true;
    },
  );
});

test('hosted production provider policy guard is disabled for local, on-prem, and explicit break-glass', () => {
  assert.doesNotThrow(() => assertHostedProductionProviderPolicy({
    env: { NODE_ENV: 'development' },
  }));
  assert.doesNotThrow(() => assertHostedProductionProviderPolicy({
    env: { NODE_ENV: 'production', GREYBOX_DEPLOYMENT_MODE: 'on-prem' },
  }));
  assert.doesNotThrow(() => assertHostedProductionProviderPolicy({
    env: {
      NODE_ENV: 'production',
      ...validBreakGlassEnv(),
    },
  }));
});

test('provider policy break-glass must be exact, reasoned, and time-bound', () => {
  assert.equal(unverifiedProviderPolicyExplicitlyAllowed(validBreakGlassEnv()), true);
  assert.equal(unverifiedProviderPolicyExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY: '1' }), false);
  assert.equal(unverifiedProviderPolicyExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY: 'true' }), false);
  assert.equal(unverifiedProviderPolicyExplicitlyAllowed({ GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY: ' 1 ' }), false);
  assert.equal(unverifiedProviderPolicyExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_REASON: 'test',
  }), false);
  assert.equal(unverifiedProviderPolicyExplicitlyAllowed({
    ...validBreakGlassEnv(),
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_PROVIDER_POLICY_EXPIRES_AT: '2026-05-25T00:00:00.000Z',
  }), false);
});

test('server boot wires the hosted production provider policy guard', () => {
  assert.throws(
    () => createGreyboxCloudServer({
      providerPolicyEnv: { NODE_ENV: 'production' },
    }),
    HostedProductionProviderPolicyError,
  );
  const server = createGreyboxCloudServer({
    providerPolicyEnv: readyHostedEnv(),
  });
  assert.ok(server);
});

test('server default inference service enforces injected provider policy env at runtime', async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  let providerFetchCalls = 0;
  process.env.OPENAI_API_KEY = 'sk-test-provider-policy-runtime';
  globalThis.fetch = async () => {
    providerFetchCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'OpenAI should be blocked by injected policy.' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await withServer({
      providerPolicyEnv: {
        GREYBOX_PROVIDER_POLICY_JSON: JSON.stringify({
          allowedProviders: ['bedrock'],
          regionAllowedProviders: {
            us: ['bedrock'],
            eu: ['bedrock'],
            in: ['bedrock'],
          },
        }),
      },
    }, async (baseUrl) => {
      const response = await originalFetch(`${baseUrl}/v1/inference`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-greybox-tenant': 'tenant-provider-policy-runtime',
          'x-greybox-tier': 'studio',
        },
        body: JSON.stringify({
          projectId: 'project-provider-policy-runtime',
          task: 'cheap-chat',
          messages: [{ role: 'user', content: 'Draft a compact save-game confirmation.' }],
        }),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Managed inference is not available for this tenant' });
      assert.equal(providerFetchCalls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
});
