#!/usr/bin/env tsx
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

/**
 * Greybox Cloud pre-launch health check script.
 *
 * Checks:
 *  1. GET /healthz — basic liveness
 *  2. GET /readyz  — subsystem readiness
 *  3. Critical env vars are set for production mode
 *
 * Exit codes:
 *  0 — all checks pass
 *  1 — one or more critical checks failed
 *
 * Usage:
 *   npx tsx scripts/health-check.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/health-check.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isProduction = NODE_ENV === 'production';

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];
let exitCode = 0;

function pass(name: string, detail?: string): void {
  results.push({ name, passed: true, detail });
}

function fail(name: string, detail?: string): void {
  results.push({ name, passed: false, detail });
  exitCode = 1;
}

// ---------------------------------------------------------------------------
// 1. ENV var audit
// ---------------------------------------------------------------------------

/** Required in all environments */
const coreEnvVars: string[] = [
  'PORT',
  'GREYBOX_CLOUD_ALLOWED_ORIGINS',
];

/** Required for production */
const productionEnvVars: string[] = [
  'STRIPE_API_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GREYBOX_AUDIT_SEAL_KEY',
  'GREYBOX_SCIM_TOKEN',
  'GREYBOX_BILLING_ADMIN_TOKEN',
  'GREYBOX_CLOUD_ADMIN_TOKEN',
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
];

/** All 5 must be set together for Postgres mode */
const pgEnvVars: Record<string, string> = {
  tenant: 'GREYBOX_TENANT_STORE_PG_URL',
  audit: 'GREYBOX_AUDIT_LOG_PG_URL',
  billing: 'GREYBOX_BILLING_LEDGER_PG_URL',
  scim: 'GREYBOX_SCIM_PG_URL',
  characters: 'GREYBOX_CHARACTER_JOBS_PG_URL',
};

for (const varName of coreEnvVars) {
  if (process.env[varName]) {
    pass(`env:${varName}`);
  } else {
    fail(`env:${varName}`, `${varName} is not set`);
  }
}

if (isProduction) {
  for (const varName of productionEnvVars) {
    if (process.env[varName]) {
      pass(`env:${varName}`);
    } else {
      fail(`env:${varName}`, `${varName} is not set (required in production)`);
    }
  }

  const pgConfigured = Object.entries(pgEnvVars).filter(([, v]) => process.env[v]);
  const pgMissing = Object.entries(pgEnvVars).filter(([, v]) => !process.env[v]);
  if (pgMissing.length === 0) {
    pass('env:postgres-urls', 'All 5 Postgres URLs configured');
  } else if (pgConfigured.length === 0) {
    fail('env:postgres-urls', 'No Postgres URLs configured — production should use Postgres for all stores');
  } else {
    fail(
      'env:postgres-urls',
      `Partial Postgres config — missing: ${pgMissing.map(([k]) => k).join(', ')}`,
    );
  }

  const stripeKey = process.env.STRIPE_API_KEY ?? '';
  if (stripeKey.startsWith('sk_live_')) {
    pass('env:stripe-live-key', 'STRIPE_API_KEY is a live key');
  } else if (stripeKey) {
    fail('env:stripe-live-key', 'STRIPE_API_KEY is set but is not a live key (sk_live_*) — billing will run in dry-run mode');
  }
}

// ---------------------------------------------------------------------------
// 2. HTTP liveness probe
// ---------------------------------------------------------------------------

async function checkHealthz(): Promise<void> {
  const url = `${BASE_URL}/healthz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.status !== 200) {
      fail('http:/healthz', `returned HTTP ${res.status}`);
      return;
    }
    const body = await res.json() as { ok?: boolean; service?: string; postgres?: string; uptime?: number };
    if (body.ok !== true) {
      fail('http:/healthz', `ok=${String(body.ok)}`);
      return;
    }
    pass('http:/healthz', `service=${body.service ?? '?'} postgres=${body.postgres ?? '?'} uptime=${body.uptime?.toFixed(1) ?? '?'}s`);
  } catch (err) {
    fail('http:/healthz', `fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// 3. HTTP readiness probe
// ---------------------------------------------------------------------------

async function checkReadyz(): Promise<void> {
  const url = `${BASE_URL}/readyz`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await res.json() as {
      ok?: boolean;
      degraded?: boolean;
      checks?: Record<string, { ok?: boolean; configured?: boolean; detail?: string }>;
    };
    if (res.status === 503) {
      fail('http:/readyz', `structural failure — status 503`);
    } else if (body.degraded) {
      const unconfigured = Object.entries(body.checks ?? {})
        .filter(([, v]) => v.configured === false)
        .map(([k, v]) => `${k}(${v.detail ?? 'unconfigured'})`)
        .join(', ');
      // Degraded is a warning, not a hard failure — load balancers still serve it.
      console.warn(`  [WARN] /readyz degraded: ${unconfigured}`);
      pass('http:/readyz', `degraded but 200 — unconfigured: ${unconfigured}`);
    } else {
      pass('http:/readyz', 'all checks configured');
    }
  } catch (err) {
    fail('http:/readyz', `fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

await checkHealthz();
await checkReadyz();

// Print summary
const pad = 40;
console.log('\n=== Greybox Cloud Health Check ===');
for (const r of results) {
  const icon = r.passed ? '  ' : 'FAIL';
  const label = r.name.padEnd(pad);
  const detail = r.detail ? `  ${r.detail}` : '';
  console.log(`${icon}  ${label}${detail}`);
}
console.log('');
if (exitCode === 0) {
  console.log('All checks passed.');
} else {
  const failed = results.filter((r) => !r.passed).length;
  console.error(`${failed} check(s) failed.`);
}

process.exit(exitCode);
