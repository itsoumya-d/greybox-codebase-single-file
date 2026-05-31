// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadOfflineLicenseStatus, type OfflineLicenseLoadOptions } from './offlineLicense.js';

export type OnPremReadinessStatus = 'pass' | 'warn' | 'fail';

export interface OnPremReadinessCheck {
  id: string;
  label: string;
  status: OnPremReadinessStatus;
  detail: string;
  remediation?: string;
}

export interface OnPremReadinessReport {
  ready: boolean;
  generatedAt: string;
  mode: 'on-prem';
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
  license?: {
    licenseId: string;
    tenantId: string;
    customerName: string;
    seats: number;
    features: string[];
    regions: string[];
    expiresAt: string;
    daysUntilExpiry: number;
  };
  checks: OnPremReadinessCheck[];
}

export interface OnPremReadinessOptions extends OfflineLicenseLoadOptions {
  env?: Record<string, string | undefined>;
  probeWrites?: boolean;
}

interface SecretCheckConfig {
  key: string;
  label: string;
}

interface DirectoryCheckConfig {
  key: string;
  label: string;
}

const requiredSecrets: SecretCheckConfig[] = [
  { key: 'GREYBOX_BILLING_ADMIN_TOKEN', label: 'Billing admin token' },
  { key: 'GREYBOX_AUDIT_ADMIN_TOKEN', label: 'Audit admin token' },
  { key: 'GREYBOX_AUDIT_SEAL_KEY', label: 'Audit seal key' },
  { key: 'GREYBOX_SCIM_TOKEN', label: 'SCIM bearer token' },
];

const durableDirectories: DirectoryCheckConfig[] = [
  { key: 'GREYBOX_BILLING_LEDGER_DIR', label: 'Billing ledger store' },
  { key: 'GREYBOX_AUDIT_LOG_DIR', label: 'Audit log store' },
  { key: 'GREYBOX_SCIM_STORE_DIR', label: 'SCIM directory store' },
  { key: 'GREYBOX_PRIVACY_REQUEST_DIR', label: 'Privacy request store' },
  { key: 'GREYBOX_SECURITY_INCIDENT_DIR', label: 'Security incident store' },
  { key: 'GREYBOX_MODEL_TRAINING_CONSENT_DIR', label: 'Model-training consent store' },
  { key: 'GREYBOX_LEGAL_HOLD_DIR', label: 'Legal hold store' },
];

const placeholderPattern = /(?:replace|changeme|example|sample|dummy|random-token|secret|token)$/iu;

export async function assessOnPremReadiness(options: OnPremReadinessOptions = {}): Promise<OnPremReadinessReport> {
  const env = options.env ?? process.env;
  const generatedAt = (options.now ?? new Date()).toISOString();
  const checks: OnPremReadinessCheck[] = [
    await offlineLicenseCheck({
      licensePath: options.licensePath ?? env.GREYBOX_OFFLINE_LICENSE_FILE,
      publicKeyPem: options.publicKeyPem,
      publicKeyPath: options.publicKeyPath ?? env.GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY_FILE,
      now: options.now,
    }),
    ...requiredSecrets.map((config) => secretCheck(config, env)),
    ...await Promise.all(durableDirectories.map((config) => directoryCheck(config, env, options.probeWrites ?? true))),
    deploymentModeCheck(env),
    dpoAppointmentCheck(env),
    providerEgressCheck(env),
  ];
  const passed = checks.filter((check) => check.status === 'pass').length;
  const warnings = checks.filter((check) => check.status === 'warn').length;
  const failed = checks.filter((check) => check.status === 'fail').length;
  const licenseStatus = await loadOfflineLicenseStatus({
    licensePath: options.licensePath ?? env.GREYBOX_OFFLINE_LICENSE_FILE,
    publicKeyPem: options.publicKeyPem,
    publicKeyPath: options.publicKeyPath ?? env.GREYBOX_OFFLINE_LICENSE_PUBLIC_KEY_FILE,
    now: options.now,
  });

  return {
    ready: failed === 0,
    generatedAt,
    mode: 'on-prem',
    summary: { passed, warnings, failed },
    ...(licenseStatus.valid && licenseStatus.license
      ? {
        license: {
          licenseId: licenseStatus.license.licenseId,
          tenantId: licenseStatus.license.tenantId,
          customerName: licenseStatus.license.customerName,
          seats: licenseStatus.license.seats,
          features: [...licenseStatus.license.features],
          regions: [...licenseStatus.license.regions],
          expiresAt: licenseStatus.license.expiresAt,
          daysUntilExpiry: licenseStatus.license.daysUntilExpiry,
        },
      }
      : {}),
    checks,
  };
}

async function offlineLicenseCheck(options: OfflineLicenseLoadOptions): Promise<OnPremReadinessCheck> {
  const status = await loadOfflineLicenseStatus(options);
  if (status.valid && status.license) {
    const warnSoon = status.license.daysUntilExpiry <= 30;
    return {
      id: 'offline-license',
      label: 'Offline enterprise license',
      status: warnSoon ? 'warn' : 'pass',
      detail: warnSoon
        ? `Valid license expires in ${status.license.daysUntilExpiry} days.`
        : `Valid license for ${status.license.customerName}.`,
      ...(warnSoon ? { remediation: 'Renew or rotate the offline license before it expires.' } : {}),
    };
  }
  return {
    id: 'offline-license',
    label: 'Offline enterprise license',
    status: 'fail',
    detail: status.error ?? 'offline_license_invalid',
    remediation: 'Mount license.greybox.json and greybox-license-public.pem into the on-prem bundle.',
  };
}

function secretCheck(config: SecretCheckConfig, env: Record<string, string | undefined>): OnPremReadinessCheck {
  const value = env[config.key]?.trim() ?? '';
  if (!value) {
    return {
      id: config.key.toLowerCase(),
      label: config.label,
      status: 'fail',
      detail: 'Not configured.',
      remediation: `Set ${config.key} to a customer-specific random value.`,
    };
  }
  if (value.length < 24 || placeholderPattern.test(value)) {
    return {
      id: config.key.toLowerCase(),
      label: config.label,
      status: 'fail',
      detail: 'Configured value is too short or still looks like a placeholder.',
      remediation: `Rotate ${config.key} to a high-entropy value before customer handoff.`,
    };
  }
  return {
    id: config.key.toLowerCase(),
    label: config.label,
    status: 'pass',
    detail: 'Configured with a non-placeholder value.',
  };
}

async function directoryCheck(
  config: DirectoryCheckConfig,
  env: Record<string, string | undefined>,
  probeWrites: boolean,
): Promise<OnPremReadinessCheck> {
  const directory = env[config.key]?.trim();
  if (!directory) {
    return {
      id: config.key.toLowerCase(),
      label: config.label,
      status: 'fail',
      detail: 'Not configured.',
      remediation: `Set ${config.key} to a persistent mounted directory.`,
    };
  }
  if (!probeWrites) {
    return {
      id: config.key.toLowerCase(),
      label: config.label,
      status: 'pass',
      detail: 'Configured; write probe skipped.',
    };
  }
  try {
    await mkdir(directory, { recursive: true });
    const probePath = path.join(directory, `.greybox-readiness-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(probePath, 'ok', { encoding: 'utf8', flag: 'wx' });
    await rm(probePath, { force: true });
    return {
      id: config.key.toLowerCase(),
      label: config.label,
      status: 'pass',
      detail: 'Persistent store is writable.',
    };
  } catch (error) {
    return {
      id: config.key.toLowerCase(),
      label: config.label,
      status: 'fail',
      detail: error instanceof Error ? error.message : 'write_probe_failed',
      remediation: `Mount ${config.key} on durable storage with write access for the container user.`,
    };
  }
}

function deploymentModeCheck(env: Record<string, string | undefined>): OnPremReadinessCheck {
  const mode = env.GREYBOX_DEPLOYMENT_MODE?.trim().toLowerCase();
  if (mode === 'on-prem') {
    return {
      id: 'greybox_deployment_mode',
      label: 'Deployment mode',
      status: 'pass',
      detail: 'On-prem mode is explicit.',
    };
  }
  return {
    id: 'greybox_deployment_mode',
    label: 'Deployment mode',
    status: 'warn',
    detail: 'GREYBOX_DEPLOYMENT_MODE is not set to on-prem.',
    remediation: 'Set GREYBOX_DEPLOYMENT_MODE=on-prem in the customer environment file.',
  };
}

function providerEgressCheck(env: Record<string, string | undefined>): OnPremReadinessCheck {
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY?.trim());
  const hasOpenAi = Boolean(env.OPENAI_API_KEY?.trim());
  const hasBedrock = Boolean(
    (env.AWS_REGION?.trim() || env.AWS_DEFAULT_REGION?.trim())
    && env.AWS_ACCESS_KEY_ID?.trim()
    && env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
  if (hasAnthropic || hasOpenAi || hasBedrock) {
    return {
      id: 'managed_inference_egress',
      label: 'Managed inference egress',
      status: 'pass',
      detail: 'At least one managed inference provider is configured.',
    };
  }
  return {
    id: 'managed_inference_egress',
    label: 'Managed inference egress',
    status: 'warn',
    detail: 'No managed inference provider is configured; BYOK/offline-only mode must be used.',
    remediation: 'Configure Anthropic, OpenAI, or Bedrock credentials if this on-prem tenant purchased managed inference.',
  };
}

function dpoAppointmentCheck(env: Record<string, string | undefined>): OnPremReadinessCheck {
  const name = env.GREYBOX_DPO_NAME?.trim();
  const email = env.GREYBOX_DPO_EMAIL?.trim();
  const appointedAt = env.GREYBOX_DPO_APPOINTED_AT?.trim();
  if (name && email && appointedAt) {
    return {
      id: 'greybox_dpo_appointment',
      label: 'DPO appointment evidence',
      status: 'pass',
      detail: 'DPO name, contact, and appointment date are configured.',
    };
  }
  return {
    id: 'greybox_dpo_appointment',
    label: 'DPO appointment evidence',
    status: 'warn',
    detail: 'DPO appointment evidence is incomplete.',
    remediation: 'Set GREYBOX_DPO_NAME, GREYBOX_DPO_EMAIL, and GREYBOX_DPO_APPOINTED_AT after counsel appoints the DPO.',
  };
}
