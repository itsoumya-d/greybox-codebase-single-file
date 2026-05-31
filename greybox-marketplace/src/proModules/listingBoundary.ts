// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type {
  ProModuleListingManifest,
  ProModuleListingMetadata,
  ProModuleListingMount,
  ProModuleMountKind,
} from '../types.js';

const SAFE_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/u;
const SAFE_ENTRY_RE = /^[a-zA-Z0-9._/-]{1,240}$/u;
const SEMVERISH_RE = /^[0-9]+(?:\.[0-9]+){0,2}(?:[-+][a-zA-Z0-9.-]+)?$/u;
const SHA256_RE = /^[a-f0-9]{64}$/iu;
const FORBIDDEN_PAYLOAD_KEYS = new Set(['payload', 'encryptedPayload', 'body', 'files']);
const ALLOWED_ENTITLEMENT_TIERS = new Set(['pro', 'studio']);

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value: unknown, key: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  const clean = value.replace(/\0/g, '').trim();
  if (!clean) throw new Error(`${key} is required`);
  return clean.slice(0, maxLength);
}

function optionalString(value: unknown, key: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  return cleanString(value, key, maxLength);
}

function normalizeLicenseTier(value: string | undefined, moduleId: string): string {
  const normalized = (value ?? 'pro').trim().toLowerCase().replaceAll('_', '-');
  if (!ALLOWED_ENTITLEMENT_TIERS.has(normalized)) {
    throw new Error(`proModule.manifest.licenseTier is not allowed for ${moduleId}`);
  }
  return normalized;
}

function rejectPayloadFields(value: unknown, path = 'proModule'): void {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => rejectPayloadFields(entry, `${path}[${index}]`));
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new Error(`${path}.${key} is not allowed in marketplace Pro module listings`);
    }
    rejectPayloadFields(child, `${path}.${key}`);
  }
}

function normalizeMount(input: unknown, kind: ProModuleMountKind): ProModuleListingMount {
  if (!isRecord(input)) throw new Error(`${kind} mount must be an object`);
  const id = cleanString(input.id, `${kind}.id`, 80);
  if (!SAFE_ID_RE.test(id)) throw new Error(`${kind}.id is not safe`);
  const mountKind = cleanString(input.kind, `${kind}.kind`, 32);
  if (mountKind !== kind) throw new Error(`${kind}.kind must be ${kind}`);
  assertSafeOptionalEntry(input.entry, `${kind}.entry`);
  const digestSha256 = optionalString(input.digestSha256, `${kind}.digestSha256`, 64);
  if (digestSha256 && !SHA256_RE.test(digestSha256)) throw new Error(`${kind}.digestSha256 must be sha256 hex`);
  const title = optionalString(input.title, `${kind}.title`, 96);
  const description = optionalString(input.description, `${kind}.description`, 240);
  return {
    kind,
    id,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(digestSha256 ? { digestSha256: digestSha256.toLowerCase() } : {}),
  };
}

function normalizeMounts(value: unknown): ProModuleListingManifest['mounts'] {
  if (!isRecord(value)) throw new Error('proModule.manifest.mounts must be an object');
  const skills = value.skills === undefined ? [] : normalizeMountArray(value.skills, 'skill');
  const gameArtBibles = value.gameArtBibles === undefined ? [] : normalizeMountArray(value.gameArtBibles, 'game-art-bible');
  const engineTargets = value.engineTargets === undefined ? [] : normalizeMountArray(value.engineTargets, 'engine-target');
  if (skills.length + gameArtBibles.length + engineTargets.length === 0) {
    throw new Error('proModule.manifest.mounts must include at least one public mount');
  }
  return {
    ...(skills.length > 0 ? { skills } : {}),
    ...(gameArtBibles.length > 0 ? { gameArtBibles } : {}),
    ...(engineTargets.length > 0 ? { engineTargets } : {}),
  };
}

function normalizeMountArray(value: unknown, kind: ProModuleMountKind): ProModuleListingMount[] {
  if (!Array.isArray(value)) throw new Error(`${kind} mounts must be an array`);
  return value.map((entry) => normalizeMount(entry, kind));
}

function assertSafeOptionalEntry(value: unknown, key: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  if (!SAFE_ENTRY_RE.test(value) || value.startsWith('/') || value.includes('\\')) {
    throw new Error(`${key} is not a safe Pro module path`);
  }
  if (value.split('/').some((part) => part === '..' || part === '.' || part === '')) {
    throw new Error(`${key} is not a safe Pro module path`);
  }
}

function mountCount(mounts: ProModuleListingManifest['mounts']): number {
  return (mounts.skills?.length ?? 0)
    + (mounts.gameArtBibles?.length ?? 0)
    + (mounts.engineTargets?.length ?? 0);
}

export function publicProModuleListingMetadataFromEnvelope(input: unknown): ProModuleListingMetadata {
  rejectPayloadFields(input);
  if (!isRecord(input)) throw new Error('proModule must be an object');
  const format = cleanString(input.format, 'proModule.format', 80);
  if (format !== 'agds-pro-module-bundle/v1') throw new Error('proModule.format is not supported');
  const payloadSha256 = cleanString(input.payloadSha256, 'proModule.payloadSha256', 64);
  if (!SHA256_RE.test(payloadSha256)) throw new Error('proModule.payloadSha256 must be sha256 hex');
  if (!isRecord(input.signature)) throw new Error('proModule.signature is required');
  const algorithm = cleanString(input.signature.algorithm, 'proModule.signature.algorithm', 32);
  if (algorithm !== 'ed25519') throw new Error('proModule.signature.algorithm must be ed25519');
  const keyId = cleanString(input.signature.keyId, 'proModule.signature.keyId', 80);
  if (!SAFE_ID_RE.test(keyId)) throw new Error('proModule.signature.keyId is not safe');
  if (!isRecord(input.manifest)) throw new Error('proModule.manifest is required');

  const manifestId = cleanString(input.manifest.id, 'proModule.manifest.id', 80);
  if (!SAFE_ID_RE.test(manifestId)) throw new Error('proModule.manifest.id is not safe');
  const version = cleanString(input.manifest.version, 'proModule.manifest.version', 48);
  if (!SEMVERISH_RE.test(version)) throw new Error('proModule.manifest.version is not semver-like');
  const mounts = normalizeMounts(input.manifest.mounts);
  const description = optionalString(input.manifest.description, 'proModule.manifest.description', 280);
  const licenseTier = normalizeLicenseTier(optionalString(input.manifest.licenseTier, 'proModule.manifest.licenseTier', 48), manifestId);
  const minAgdsVersion = optionalString(input.manifest.minAgdsVersion, 'proModule.manifest.minAgdsVersion', 48);

  const manifest: ProModuleListingManifest = {
    id: manifestId,
    name: cleanString(input.manifest.name, 'proModule.manifest.name', 96),
    version,
    mounts,
    ...(description ? { description } : {}),
    licenseTier,
    ...(minAgdsVersion ? { minAgdsVersion } : {}),
  };

  return {
    format: 'agds-pro-module-bundle/v1',
    manifest,
    payloadSha256: payloadSha256.toLowerCase(),
    signature: { algorithm: 'ed25519', keyId },
    mountCount: mountCount(mounts),
    entitlement: {
      sku: `gbpro.${manifestId}`,
      licenseTier,
      grantKey: `pro-module:${manifestId}`,
    },
  };
}
