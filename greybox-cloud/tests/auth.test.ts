// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, type JsonWebKey } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileAuditLog, type AuditLogEntry } from '../src/enterprise/auditLog.js';
import { FileBillingLedger } from '../src/metering/billingLedger.js';
import { authenticateRequest } from '../src/routers/auth.js';
import { TenantStore, type TenantSnapshot } from '../src/routers/tenants.js';
import { WorkOsJwtVerifier, type WorkOsClaims } from '../src/routers/workos-auth.js';
import { createGreyboxCloudServer } from '../src/server.js';
import type { AuthContext, InferenceRequest, InferenceResult } from '../src/types.js';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;
jwk.kid = 'workos-test-key';
jwk.alg = 'RS256';
jwk.use = 'sig';

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signWorkOsJwt(claims: Partial<WorkOsClaims> = {}): string {
  const header = b64url({ alg: 'RS256', typ: 'JWT', kid: jwk.kid });
  const payload = b64url({
    iss: 'https://api.workos.test',
    aud: 'greybox-cloud',
    sub: 'user_123',
    email: 'designer@example.com',
    org_id: 'org_game_studio',
    roles: ['designer', 'admin'],
    permissions: ['inference:write'],
    exp: 1_893_456_000,
    ...claims,
  });
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .end()
    .sign(privateKey)
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifier(): WorkOsJwtVerifier {
  return new WorkOsJwtVerifier({
    jwks: { keys: [jwk] },
    issuer: 'https://api.workos.test',
    audience: 'greybox-cloud',
    now: () => Date.parse('2026-05-15T12:00:00.000Z'),
  });
}

function validAuthBreakGlassEnv() {
  return {
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH: '1',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_REASON: 'temporary hosted auth cutover rehearsal',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_NOW: '2026-05-25T00:00:00.000Z',
    GREYBOX_CLOUD_ALLOW_UNVERIFIED_AUTH_EXPIRES_AT: '2026-05-25T08:00:00.000Z',
  };
}

const hostedScimToken = 'scim-hosted-token-0123456789abcdef';

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

test('verifies WorkOS-style RS256 JWT claims', async () => {
  const claims = await verifier().verify(signWorkOsJwt());
  assert.equal(claims.sub, 'user_123');
  assert.equal(claims.org_id, 'org_game_studio');
  assert.deepEqual(claims.roles, ['designer', 'admin']);
});

test('rejects WorkOS JWTs with wrong audience', async () => {
  await assert.rejects(
    () => verifier().verify(signWorkOsJwt({ aud: 'other-service' })),
    /audience mismatch/u,
  );
});

test('maps WorkOS organization to tenant and ignores spoofed tenant headers', async () => {
  const headers = new Headers({
    authorization: `Bearer ${signWorkOsJwt({
      tier: 'enterprise',
      'https://greybox.studio/data-region': 'india',
    })}`,
    'x-greybox-tenant': 'spoofed-tenant',
    'x-greybox-tier': 'free',
    'x-greybox-region': 'eu',
  });
  const tenantStore = new TenantStore();
  const context = await authenticateRequest(headers, {
    workosVerifier: verifier(),
    tenantStore,
  });

  assert.equal(context.authProvider, 'workos');
  assert.equal(context.tenantId, 'workos:org_game_studio');
  assert.equal(context.organizationId, 'org_game_studio');
  assert.equal(context.tier, 'enterprise');
  assert.equal(context.dataResidencyRegion, 'in');
  assert.deepEqual(context.roles, ['designer', 'admin', 'inference:write']);
  assert.equal(tenantStore.get('workos:org_game_studio')?.ssoEnabled, true);
  assert.equal(tenantStore.get('workos:org_game_studio')?.region, 'in');
});

test('WorkOS auth refreshes durable tenant snapshots before mapping organization claims', async () => {
  let refreshed = false;
  const snapshot: TenantSnapshot = {
    version: 1,
    tenants: [{
      id: 'workos:org_game_studio',
      organizationId: 'org_game_studio',
      tier: 'enterprise',
      region: 'eu',
      ssoEnabled: true,
      monthlyInputTokensIncluded: 50_000_000,
      monthlyOutputTokensIncluded: 10_000_000,
    }],
    organizationTenantIds: [['org_game_studio', 'workos:org_game_studio']],
  };
  const tenantStore = new TenantStore({
    persister: {
      loadSync: () => refreshed ? snapshot : undefined,
      saveSync: () => undefined,
      refresh: async () => {
        refreshed = true;
      },
    },
  });
  const context = await authenticateRequest(new Headers({
    authorization: `Bearer ${signWorkOsJwt()}`,
  }), {
    workosVerifier: verifier(),
    tenantStore,
  });

  assert.equal(refreshed, true);
  assert.equal(context.tenantId, 'workos:org_game_studio');
  assert.equal(context.tier, 'enterprise');
  assert.equal(tenantStore.get('workos:org_game_studio')?.region, 'eu');
});

test('managed-token auth maps explicit data residency headers', async () => {
  const context = await authenticateRequest(new Headers({
    authorization: 'Bearer gb_live_test',
    'x-greybox-tenant': 'tenant-eu',
    'x-greybox-region': 'european-union',
  }));

  assert.equal(context.authProvider, 'managed-token');
  assert.equal(context.tenantId, 'tenant-eu');
  assert.equal(context.dataResidencyRegion, 'eu');
});

test('maps WorkOS groups to Greybox roles and scopes', async () => {
  const headers = new Headers({
    authorization: `Bearer ${signWorkOsJwt({
      roles: [],
      permissions: [],
      groups: [
        { id: 'grp_1', name: 'Design Leads', slug: 'design-leads' },
        'Greybox Billing Admins',
      ],
      'https://greybox.studio/groups': ['External Reviewers'],
    })}`,
  });

  const context = await authenticateRequest(headers, {
    workosVerifier: verifier(),
    tenantStore: new TenantStore(),
    workosGroupRoleMap: {
      'Design Leads': { roles: ['admin', 'designer'], scopes: ['audit:read', 'inference:write'] },
      'External Reviewers': { roles: ['viewer'], scopes: ['project:read'] },
    },
  });

  assert.deepEqual(context.roles, ['admin', 'designer', 'billing-admin', 'viewer']);
  assert.deepEqual(context.scopes, ['audit:read', 'inference:write', 'billing:read', 'billing:write', 'project:read']);
});

test('session endpoint returns public WorkOS tenant context', async () => {
  await withServer(
    { workosVerifier: verifier(), tenantStore: new TenantStore() },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/auth/session`, {
        headers: { authorization: `Bearer ${signWorkOsJwt()}` },
      });
      assert.equal(response.status, 200);
      const json = await response.json() as {
        auth: { tenantId: string; userId: string; tokenHash?: string; email: string };
        tenant: { id: string; organizationId: string; ssoEnabled: boolean };
      };
      assert.equal(json.auth.tenantId, 'workos:org_game_studio');
      assert.equal(json.auth.userId, 'user_123');
      assert.equal(json.auth.email, 'designer@example.com');
      assert.equal(json.auth.tokenHash, undefined);
      assert.equal(json.tenant.id, 'workos:org_game_studio');
      assert.equal(json.tenant.organizationId, 'org_game_studio');
      assert.equal(json.tenant.ssoEnabled, true);
    },
  );
});

test('data residency endpoint reports the tenant region', async () => {
  await withServer(
    { workosVerifier: verifier(), tenantStore: new TenantStore() },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/enterprise/data-residency`, {
        headers: {
          authorization: `Bearer ${signWorkOsJwt({
            'https://greybox.studio/data-region': 'eu',
          })}`,
        },
      });
      assert.equal(response.status, 200);
      const json = await response.json() as {
        tenantId: string;
        dataResidencyRegion: string;
        requestedRegion: string;
        supportedRegions: string[];
      };
      assert.equal(json.tenantId, 'workos:org_game_studio');
      assert.equal(json.dataResidencyRegion, 'eu');
      assert.equal(json.requestedRegion, 'eu');
      assert.deepEqual(json.supportedRegions, ['us', 'eu', 'in']);
    },
  );
});

test('managed inference uses WorkOS tenant context over caller headers', async () => {
  const observed: { context?: AuthContext; request?: InferenceRequest } = {};
  const result: InferenceResult = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    text: 'ok',
    usage: { inputTokens: 1, outputTokens: 1 },
    redactedLog: {},
  };
  await withServer(
    {
      workosVerifier: verifier(),
      tenantStore: new TenantStore(),
      service: {
        async run(request, context) {
          observed.request = request;
          observed.context = context;
          return result;
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signWorkOsJwt()}`,
          'content-type': 'application/json',
          'x-greybox-tenant': 'spoofed-tenant',
          'x-greybox-tier': 'free',
        },
        body: JSON.stringify({
          model: 'greybox-design',
          messages: [{ role: 'user', content: 'Prove tenant isolation.' }],
        }),
      });
      assert.equal(response.status, 200);
    },
  );

  assert.equal(observed.context?.tenantId, 'workos:org_game_studio');
  assert.equal(observed.context?.tier, 'studio');
  assert.equal(observed.context?.dataResidencyRegion, 'us');
  assert.equal(observed.request?.projectId, 'managed-workos:org_game_studio');
});

test('hosted production request auth rejects managed-token fallback', async () => {
  await withServer(
    {
      authEnv: { NODE_ENV: 'production' },
      scimToken: hostedScimToken,
      workosVerifier: verifier(),
      tenantStore: new TenantStore(),
    },
    async (baseUrl) => {
      const rejected = await fetch(`${baseUrl}/v1/auth/session`, {
        headers: {
          authorization: 'Bearer managed-token',
          'x-greybox-tenant': 'spoofed-tenant',
          'x-greybox-user': 'spoofed-user',
        },
      });
      assert.equal(rejected.status, 401);
      assert.deepEqual(await rejected.json(), {
        error: 'Verified WorkOS authentication is required',
      });

      const accepted = await fetch(`${baseUrl}/v1/auth/session`, {
        headers: {
          authorization: `Bearer ${signWorkOsJwt()}`,
        },
      });
      assert.equal(accepted.status, 200);
      const json = await accepted.json() as { auth: AuthContext };
      assert.equal(json.auth.authProvider, 'workos');
      assert.equal(json.auth.tenantId, 'workos:org_game_studio');
    },
  );
});

test('hosted production auth break-glass keeps managed-token fallback time-bound', async () => {
  await withServer(
    {
      authEnv: {
        NODE_ENV: 'production',
        ...validAuthBreakGlassEnv(),
      },
      scimToken: hostedScimToken,
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/auth/session`, {
        headers: {
          authorization: 'Bearer managed-token',
          'x-greybox-tenant': 'breakglass-tenant',
          'x-greybox-user': 'breakglass-user',
        },
      });
      assert.equal(response.status, 200);
      const json = await response.json() as { auth: AuthContext };
      assert.equal(json.auth.authProvider, 'managed-token');
      assert.equal(json.auth.tenantId, 'breakglass-tenant');
    },
  );
});

test('managed inference writes project-scoped audit entries without prompt content', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-inference-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    const result: InferenceResult = {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      text: 'ok',
      usage: { inputTokens: 17, outputTokens: 9 },
      redactedLog: {
        pii: {
          redacted: true,
          types: ['email'],
          counts: { email: 1, phone: 0, ip: 0, card: 0 },
        },
      },
    };
    await withServer(
      {
        auditLog,
        workosVerifier: verifier(),
        tenantStore: new TenantStore(),
        service: {
          async run() {
            return result;
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/inference`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${signWorkOsJwt({
              tier: 'enterprise',
              permissions: ['inference:write', 'audit:read'],
            })}`,
            'content-type': 'application/json',
            'user-agent': 'enterprise-test-client',
          },
          body: JSON.stringify({
            projectId: 'project-sensitive',
            task: 'design',
            messages: [{ role: 'user', content: 'Secret boss pitch: never log this prompt.' }],
          }),
        });
        assert.equal(response.status, 200);
      },
    );

    const entries = await auditLog.readEntries({
      tenantId: 'workos:org_game_studio',
      action: 'inference.completed',
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.actorId, 'user_123');
    assert.equal(entries[0]?.targetType, 'project');
    assert.equal(entries[0]?.targetId, 'project-sensitive');
    assert.equal(entries[0]?.projectId, 'project-sensitive');
    const metadata = entries[0]?.metadata as Record<string, unknown>;
    assert.match(String(metadata.requestId ?? ''), /^req_[0-9a-f]{16}$/u);
    const metadataWithoutRequestId = { ...metadata };
    delete metadataWithoutRequestId.requestId;
    assert.deepEqual(metadataWithoutRequestId, {
      route: '/v1/inference',
      task: 'design',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputTokens: 17,
      outputTokens: 9,
      stream: false,
      tier: 'enterprise',
      authProvider: 'workos',
      dataResidencyRegion: 'us',
      pii: {
        redacted: true,
        types: ['email'],
        counts: { email: 1, phone: 0, ip: 0, card: 0 },
      },
    });
    assert.equal(JSON.stringify(entries).includes('Secret boss pitch'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('managed inference error responses redact provider-originated PII', async () => {
  await withServer(
    {
      workosVerifier: verifier(),
      tenantStore: new TenantStore(),
      service: {
        async run() {
          throw new Error('Provider failed while handling lead@example.com from +1 (415) 555-0100.');
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/inference`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signWorkOsJwt({
            tier: 'enterprise',
            permissions: ['inference:write'],
          })}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          projectId: 'project-safe-errors',
          messages: [{ role: 'user', content: 'Run the failed provider path.' }],
        }),
      });
      assert.equal(response.status, 400);
      const body = await response.json() as { error: string };
      assert.equal(body.error.includes('lead@example.com'), false);
      assert.equal(body.error.includes('+1 (415) 555-0100'), false);
      assert.match(body.error, /\[REDACTED_EMAIL\]/u);
      assert.match(body.error, /\[REDACTED_PHONE\]/u);
    },
  );
});

test('OpenAI-compatible managed inference writes an audit entry for the resolved managed project', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-openai-inference-audit-'));
  try {
    const auditLog = new FileAuditLog(dir);
    await withServer(
      {
        auditLog,
        workosVerifier: verifier(),
        tenantStore: new TenantStore(),
        service: {
          async run(_request, _context) {
            return {
              provider: 'anthropic',
              model: 'claude-sonnet-4.5',
              text: 'ok',
              usage: { inputTokens: 3, outputTokens: 2 },
              redactedLog: {},
            };
          },
        },
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${signWorkOsJwt()}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'greybox-design',
            messages: [{ role: 'user', content: 'Audit this through the OpenAI-compatible route.' }],
          }),
        });
        assert.equal(response.status, 200);
      },
    );

    const [entry] = await auditLog.readEntries({ action: 'inference.completed' });
    assert.equal(entry?.metadata?.route, '/v1/chat/completions');
    assert.equal(entry?.targetId, 'managed-workos:org_game_studio');
    assert.equal(entry?.projectId, 'managed-workos:org_game_studio');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('billing admin job accepts WorkOS users with billing scope', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-workos-billing-admin-'));
  try {
    const ledger = new FileBillingLedger(dir);
    const auditLog = new FileAuditLog(dir, 'audit.jsonl');
    await withServer(
      {
        billingLedger: ledger,
        auditLog,
        workosVerifier: verifier(),
        tenantStore: new TenantStore(),
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${signWorkOsJwt({
              roles: [],
              permissions: [],
              groups: ['Greybox Billing Admins'],
            })}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            tenantId: 'tenant-workos-billing',
            tier: 'indie',
            period: {
              start: '2026-05-01T00:00:00.000Z',
              end: '2026-06-01T00:00:00.000Z',
            },
          }),
        });
        assert.equal(response.status, 200);
      },
    );

    const entries = await auditLog.readEntries({ tenantId: 'tenant-workos-billing' });
    assert.equal(entries[0]?.actorId, 'user_123');
    assert.equal(entries[0]?.actorType, 'user');
    assert.equal(entries[0]?.action, 'billing.invoice_job_run');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('hosted production billing admin rejects raw token and accepts WorkOS scope', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-hosted-admin-auth-'));
  try {
    const ledger = new FileBillingLedger(dir);
    await withServer(
      {
        authEnv: { NODE_ENV: 'production' },
        scimToken: hostedScimToken,
        billingLedger: ledger,
        billingAdminToken: 'secret-admin',
        workosVerifier: verifier(),
        tenantStore: new TenantStore(),
      },
      async (baseUrl) => {
        const body = {
          tenantId: 'tenant-hosted-admin',
          tier: 'indie',
          period: {
            start: '2026-05-01T00:00:00.000Z',
            end: '2026-06-01T00:00:00.000Z',
          },
        };
        const rawToken = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret-admin',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        assert.equal(rawToken.status, 401);
        assert.deepEqual(await rawToken.json(), { error: 'billing_admin_required' });

        const workos = await fetch(`${baseUrl}/v1/billing/jobs/invoice`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${signWorkOsJwt({
              roles: [],
              permissions: [],
              groups: ['Greybox Billing Admins'],
            })}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        assert.equal(workos.status, 200);
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audit export enforces WorkOS audit scope', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-workos-audit-admin-'));
  try {
    const auditLog = new FileAuditLog(dir);
    const auditEntry: AuditLogEntry = {
      id: 'audit-rbac',
      tenantId: 'tenant-sec',
      actorId: 'system',
      actorType: 'system',
      action: 'scim.user_created',
      targetType: 'user',
      targetId: 'user-sec',
      createdAt: '2026-05-15T12:00:00.000Z',
    };
    await auditLog.append(auditEntry);
    await withServer(
      { auditLog, workosVerifier: verifier(), tenantStore: new TenantStore() },
      async (baseUrl) => {
        const viewer = await fetch(`${baseUrl}/v1/audit-log/export?tenantId=tenant-sec`, {
          headers: {
            authorization: `Bearer ${signWorkOsJwt({
              roles: [],
              permissions: [],
              groups: ['Greybox Viewers'],
            })}`,
          },
        });
        assert.equal(viewer.status, 401);

        const admin = await fetch(`${baseUrl}/v1/audit-log/export?tenantId=tenant-sec`, {
          headers: {
            authorization: `Bearer ${signWorkOsJwt({
              roles: [],
              permissions: [],
              groups: ['Greybox Admins'],
            })}`,
          },
        });
        assert.equal(admin.status, 200);
        assert.match(await admin.text(), /audit-rbac/u);
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
