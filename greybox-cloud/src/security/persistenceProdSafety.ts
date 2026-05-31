// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { timeBoundBreakGlassAllowed } from './timeBoundBreakGlass.js';

export type PersistenceKind = 'memory' | 'file' | 'env' | 'postgres' | 'injected' | 'durable-injected';

export interface HostedProductionPersistenceEnv {
  readonly NODE_ENV?: string;
  readonly GREYBOX_DEPLOYMENT_MODE?: string;
  readonly GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES?: string;
  readonly GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_REASON?: string;
  readonly GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_EXPIRES_AT?: string;
  readonly GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES_NOW?: string;
  readonly GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON?: string;
  readonly GREYBOX_DURABLE_INJECTED_EVIDENCE_MAX_AGE_DAYS?: string;
  readonly GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW?: string;
}

export interface PersistenceSurface {
  readonly id: string;
  readonly label: string;
  readonly persistence: PersistenceKind;
}

export interface UnsafePersistenceSurface extends PersistenceSurface {
  readonly remediation: string;
}

const durablePersistence = new Set<PersistenceKind>(['postgres', 'durable-injected']);
const ephemeralBackingStores = new Set(['memory', 'file', 'env', 'local', 'tmp']);
const sha256Hex = /^[a-f0-9]{64}$/iu;
const defaultDurableInjectedEvidenceMaxAgeDays = 30;
const maxFutureClockSkewMs = 5 * 60 * 1000;

interface DurableInjectedEvidenceEntry {
  readonly status: string;
  readonly adapter: string;
  readonly backingStore: string;
  readonly evidenceHash: string;
  readonly surfaceLabel: string;
  readonly generatedAtMs: number | undefined;
}

export class HostedProductionPersistenceError extends Error {
  readonly code = 'hosted_production_persistence_not_durable';

  constructor(readonly unsafeSurfaces: readonly UnsafePersistenceSurface[]) {
    super(formatUnsafePersistenceMessage(unsafeSurfaces));
    this.name = 'HostedProductionPersistenceError';
  }
}

export function isHostedProductionEnv(env: HostedProductionPersistenceEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const deploymentMode = (env.GREYBOX_DEPLOYMENT_MODE ?? '').trim().toLowerCase();
  return nodeEnv === 'production' && deploymentMode !== 'on-prem';
}

export function ephemeralStoresExplicitlyAllowed(env: HostedProductionPersistenceEnv = process.env): boolean {
  return timeBoundBreakGlassAllowed(env, { flagKey: 'GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES' });
}

export function hostedProductionUnsafePersistence(
  surfaces: readonly PersistenceSurface[],
  env: HostedProductionPersistenceEnv = process.env,
): UnsafePersistenceSurface[] {
  const durableInjectedEvidence = durableInjectedEvidenceFromEnv(env);
  return surfaces
    .filter((surface) => !isDurablePersistence(surface, durableInjectedEvidence, env))
    .map((surface) => ({
      ...surface,
      remediation: persistenceRemediation(surface),
    }));
}

export function assertHostedProductionPersistence(
  surfaces: readonly PersistenceSurface[],
  env: HostedProductionPersistenceEnv = process.env,
): void {
  if (!isHostedProductionEnv(env)) return;
  if (ephemeralStoresExplicitlyAllowed(env)) return;
  const unsafe = hostedProductionUnsafePersistence(surfaces, env);
  if (unsafe.length > 0) throw new HostedProductionPersistenceError(unsafe);
}

function isDurablePersistence(
  surface: PersistenceSurface,
  durableInjectedEvidence: ReadonlyMap<string, DurableInjectedEvidenceEntry>,
  env: HostedProductionPersistenceEnv,
): boolean {
  if (surface.persistence === 'postgres') return true;
  if (surface.persistence !== 'durable-injected') return false;
  const evidence = durableInjectedEvidence.get(surface.id);
  if (!evidence) return false;
  return evidence.status === 'ready'
    && Boolean(evidence.adapter)
    && normalizeComparable(evidence.surfaceLabel) === normalizeComparable(surface.label)
    && Boolean(evidence.backingStore)
    && !ephemeralBackingStores.has(evidence.backingStore)
    && sha256Hex.test(evidence.evidenceHash)
    && isFreshEvidence(evidence.generatedAtMs, env);
}

function persistenceRemediation(surface: PersistenceSurface): string {
  if (surface.persistence === 'injected') {
    return `${surface.label} was injected without durable-store proof; set persistence to postgres or durable-injected only after the adapter is backed by production storage.`;
  }
  if (surface.persistence === 'durable-injected') {
    return `${surface.label} is marked durable-injected but lacks a ready GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON entry with matching surfaceLabel, adapter, durable backingStore, SHA-256 evidenceHash, and fresh generatedAt timestamp.`;
  }
  return `${surface.label} must use Postgres or durable-injected storage before hosted production boot.`;
}

function durableInjectedEvidenceFromEnv(env: HostedProductionPersistenceEnv): ReadonlyMap<string, DurableInjectedEvidenceEntry> {
  const raw = env.GREYBOX_DURABLE_INJECTED_EVIDENCE_JSON;
  if (!raw?.trim()) return new Map();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Map(durableInjectedEvidenceEntries(parsed));
  } catch {
    return new Map();
  }
}

function durableInjectedEvidenceEntries(parsed: unknown): Array<[string, DurableInjectedEvidenceEntry]> {
  if (Array.isArray(parsed)) return parsed.flatMap((item) => durableInjectedEvidenceEntry(item));
  if (isRecord(parsed) && Array.isArray(parsed.surfaces)) {
    return parsed.surfaces.flatMap((item) => durableInjectedEvidenceEntry(item));
  }
  if (isRecord(parsed)) {
    return Object.entries(parsed).flatMap(([surfaceId, item]) => durableInjectedEvidenceEntry({
      ...(isRecord(item) ? item : {}),
      surfaceId,
    }));
  }
  return [];
}

function durableInjectedEvidenceEntry(item: unknown): Array<[string, DurableInjectedEvidenceEntry]> {
  if (!isRecord(item)) return [];
  const surfaceId = stringField(item.surfaceId ?? item.id);
  if (!surfaceId) return [];
  return [[surfaceId, {
    status: stringField(item.status).toLowerCase(),
    adapter: stringField(item.adapter),
    backingStore: stringField(item.backingStore).toLowerCase(),
    evidenceHash: stringField(item.evidenceHash),
    surfaceLabel: stringField(item.surfaceLabel ?? item.label),
    generatedAtMs: timestampField(item.generatedAt ?? item.verifiedAt),
  }]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, ' ');
}

function timestampField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isFreshEvidence(generatedAtMs: number | undefined, env: HostedProductionPersistenceEnv): boolean {
  if (generatedAtMs === undefined) return false;
  const now = evidenceNowMs(env);
  if (generatedAtMs > now + maxFutureClockSkewMs) return false;
  const maxAgeMs = durableInjectedEvidenceMaxAgeDays(env) * 24 * 60 * 60 * 1000;
  return now - generatedAtMs <= maxAgeMs;
}

function evidenceNowMs(env: HostedProductionPersistenceEnv): number {
  const value = env.GREYBOX_DURABLE_INJECTED_EVIDENCE_NOW;
  const parsed = timestampField(value);
  return parsed ?? Date.now();
}

function durableInjectedEvidenceMaxAgeDays(env: HostedProductionPersistenceEnv): number {
  const parsed = Number(env.GREYBOX_DURABLE_INJECTED_EVIDENCE_MAX_AGE_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultDurableInjectedEvidenceMaxAgeDays;
}

function formatUnsafePersistenceMessage(unsafeSurfaces: readonly UnsafePersistenceSurface[]): string {
  const details = unsafeSurfaces
    .map((surface) => `${surface.id}=${surface.persistence}`)
    .join(', ');
  return [
    'Hosted production requires durable control stores.',
    `Unsafe persistence: ${details}.`,
    'Configure the matching *_PG_URL variables, attach durable-injected evidence, set GREYBOX_DEPLOYMENT_MODE=on-prem for an offline bundle, or use a time-bound GREYBOX_CLOUD_ALLOW_EPHEMERAL_STORES break-glass with reason and expiry.',
  ].join(' ');
}
