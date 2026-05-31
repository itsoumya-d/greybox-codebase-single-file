// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type OnPremSmokeStatus = 'pass' | 'fail';

export interface OnPremSmokeStep {
  id: string;
  label: string;
  status: OnPremSmokeStatus;
  detail: string;
  statusCode?: number;
}

export interface OnPremSmokeReport {
  ok: boolean;
  generatedAt: string;
  baseUrl: string;
  durationMs: number;
  readinessSummary?: {
    passed: number;
    warnings: number;
    failed: number;
  };
  license?: {
    tenantId: string;
    customerName: string;
    expiresAt: string;
    daysUntilExpiry: number;
  };
  steps: OnPremSmokeStep[];
}

export interface OnPremSmokeOptions {
  baseUrl: string;
  auditAdminToken: string;
  fetchImpl?: SmokeFetch;
  now?: Date;
  secretSamples?: string[];
}

export type SmokeFetch = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

interface SmokeResponse {
  ok: boolean;
  status: number;
  text: string;
  json: unknown;
}

interface ReadinessReportShape {
  ready: boolean;
  mode?: string;
  summary?: {
    passed?: number;
    warnings?: number;
    failed?: number;
  };
  license?: {
    tenantId?: string;
    customerName?: string;
    expiresAt?: string;
    daysUntilExpiry?: number;
  };
}

const sensitiveKeyPattern = /(?:signature|decryptionSecret|rawKey|apiKey|authorization)/u;

export async function runOnPremSmoke(options: OnPremSmokeOptions): Promise<OnPremSmokeReport> {
  const startedAt = Date.now();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch_unavailable');

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const generatedAt = (options.now ?? new Date()).toISOString();
  const steps: OnPremSmokeStep[] = [];
  const secretSamples = [
    options.auditAdminToken,
    ...(options.secretSamples ?? []),
  ]
    .map((sample) => sample.trim())
    .filter((sample) => sample.length >= 8);

  try {
    const offlineLicense = await getJson(fetchImpl, baseUrl, '/v1/enterprise/offline-license');
    const readinessGate = await getJson(fetchImpl, baseUrl, '/v1/enterprise/onprem-readiness');
    const readiness = await getJson(fetchImpl, baseUrl, '/v1/enterprise/onprem-readiness', options.auditAdminToken);
    const readinessReport = readReadinessReport(readiness.json);
    const license = readinessReport?.license;

    steps.push(offlineLicenseStep(offlineLicense));
    steps.push(readinessGateStep(readinessGate));
    steps.push(readinessStep(readiness, readinessReport));
    steps.push(secretLeakStep([offlineLicense, readinessGate, readiness], secretSamples));

    return {
      ok: steps.every((step) => step.status === 'pass'),
      generatedAt,
      baseUrl,
      durationMs: Date.now() - startedAt,
      ...(readinessReport?.summary
        ? {
          readinessSummary: {
            passed: readinessReport.summary.passed ?? 0,
            warnings: readinessReport.summary.warnings ?? 0,
            failed: readinessReport.summary.failed ?? 0,
          },
        }
        : {}),
      ...(license?.tenantId && license.customerName && license.expiresAt && typeof license.daysUntilExpiry === 'number'
        ? {
          license: {
            tenantId: license.tenantId,
            customerName: license.customerName,
            expiresAt: license.expiresAt,
            daysUntilExpiry: license.daysUntilExpiry,
          },
        }
        : {}),
      steps,
    };
  } catch (error) {
    steps.push({
      id: 'network',
      label: 'On-prem endpoint reachability',
      status: 'fail',
      detail: error instanceof Error ? error.message : 'unknown_network_error',
    });
    return {
      ok: false,
      generatedAt,
      baseUrl,
      durationMs: Date.now() - startedAt,
      steps,
    };
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/u, '');
}

async function getJson(
  fetchImpl: SmokeFetch,
  baseUrl: string,
  path: string,
  auditAdminToken?: string,
): Promise<SmokeResponse> {
  const response = await fetchImpl(`${baseUrl}${path}`, auditAdminToken
    ? { headers: { authorization: `Bearer ${auditAdminToken}` } }
    : undefined);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
    json: parseJson(text),
  };
}

function parseJson(text: string): unknown {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function offlineLicenseStep(response: SmokeResponse): OnPremSmokeStep {
  const body = asRecord(response.json);
  const valid = body?.valid === true;
  if (response.status === 200 && valid) {
    return {
      id: 'offline-license',
      label: 'Offline license endpoint',
      status: 'pass',
      statusCode: response.status,
      detail: 'Signed offline license is valid.',
    };
  }
  return {
    id: 'offline-license',
    label: 'Offline license endpoint',
    status: 'fail',
    statusCode: response.status,
    detail: typeof body?.error === 'string' ? body.error : 'offline_license_not_valid',
  };
}

function readinessGateStep(response: SmokeResponse): OnPremSmokeStep {
  const body = asRecord(response.json);
  if (response.status === 401 && body?.error === 'audit_admin_required') {
    return {
      id: 'readiness-admin-gate',
      label: 'Readiness admin gate',
      status: 'pass',
      statusCode: response.status,
      detail: 'Readiness endpoint rejects unauthenticated requests.',
    };
  }
  return {
    id: 'readiness-admin-gate',
    label: 'Readiness admin gate',
    status: 'fail',
    statusCode: response.status,
    detail: 'Readiness endpoint did not fail closed without an admin token.',
  };
}

function readinessStep(
  response: SmokeResponse,
  report: ReadinessReportShape | undefined,
): OnPremSmokeStep {
  if (response.status === 200 && report?.ready === true && report.mode === 'on-prem') {
    return {
      id: 'onprem-readiness',
      label: 'On-prem readiness report',
      status: 'pass',
      statusCode: response.status,
      detail: readinessSummaryDetail(report),
    };
  }
  return {
    id: 'onprem-readiness',
    label: 'On-prem readiness report',
    status: 'fail',
    statusCode: response.status,
    detail: report ? readinessSummaryDetail(report) : 'readiness_report_unavailable',
  };
}

function readinessSummaryDetail(report: ReadinessReportShape): string {
  const passed = report.summary?.passed ?? 0;
  const warnings = report.summary?.warnings ?? 0;
  const failed = report.summary?.failed ?? 0;
  return `${passed} pass, ${warnings} warn, ${failed} fail.`;
}

function secretLeakStep(responses: SmokeResponse[], secretSamples: string[]): OnPremSmokeStep {
  const payload = responses.map((response) => response.text).join('\n');
  const leakedSecret = secretSamples.find((sample) => payload.includes(sample));
  if (leakedSecret) {
    return {
      id: 'no-secret-leak',
      label: 'Response secret minimization',
      status: 'fail',
      detail: `Response includes configured secret sample length ${leakedSecret.length}.`,
    };
  }
  const sensitiveKey = payload.match(sensitiveKeyPattern)?.[0];
  if (sensitiveKey) {
    return {
      id: 'no-secret-leak',
      label: 'Response secret minimization',
      status: 'fail',
      detail: `Response includes sensitive key name ${sensitiveKey}.`,
    };
  }
  return {
    id: 'no-secret-leak',
    label: 'Response secret minimization',
    status: 'pass',
    detail: 'Smoke responses omit configured secrets and sensitive material keys.',
  };
}

function readReadinessReport(value: unknown): ReadinessReportShape | undefined {
  const record = asRecord(value);
  if (!record || typeof record.ready !== 'boolean') return undefined;
  return {
    ready: record.ready,
    mode: typeof record.mode === 'string' ? record.mode : undefined,
    summary: readSummary(record.summary),
    license: readLicense(record.license),
  };
}

function readSummary(value: unknown): ReadinessReportShape['summary'] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    passed: typeof record.passed === 'number' ? record.passed : undefined,
    warnings: typeof record.warnings === 'number' ? record.warnings : undefined,
    failed: typeof record.failed === 'number' ? record.failed : undefined,
  };
}

function readLicense(value: unknown): ReadinessReportShape['license'] | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    tenantId: typeof record.tenantId === 'string' ? record.tenantId : undefined,
    customerName: typeof record.customerName === 'string' ? record.customerName : undefined,
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : undefined,
    daysUntilExpiry: typeof record.daysUntilExpiry === 'number' ? record.daysUntilExpiry : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
