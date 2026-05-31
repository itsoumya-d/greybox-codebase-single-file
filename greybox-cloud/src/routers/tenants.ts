// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DataResidencyRegion, PlanTier, TenantConfig } from '../types.js';

const includedTokens: Record<PlanTier, Pick<TenantConfig, 'monthlyInputTokensIncluded' | 'monthlyOutputTokensIncluded'>> = {
  free: { monthlyInputTokensIncluded: 0, monthlyOutputTokensIncluded: 0 },
  indie: { monthlyInputTokensIncluded: 1_000_000, monthlyOutputTokensIncluded: 200_000 },
  studio: { monthlyInputTokensIncluded: 5_000_000, monthlyOutputTokensIncluded: 1_000_000 },
  enterprise: { monthlyInputTokensIncluded: 50_000_000, monthlyOutputTokensIncluded: 10_000_000 },
};

export const DATA_RESIDENCY_REGIONS = ['us', 'eu', 'in'] as const;

const regionAliases: Record<string, DataResidencyRegion> = {
  us: 'us',
  usa: 'us',
  'united-states': 'us',
  'united_states': 'us',
  eu: 'eu',
  eea: 'eu',
  europe: 'eu',
  'european-union': 'eu',
  'european_union': 'eu',
  in: 'in',
  india: 'in',
};

export interface TenantCreateOptions {
  region?: DataResidencyRegion;
}

export function normalizeDataResidencyRegion(
  value: unknown,
  fallback: DataResidencyRegion = 'us',
): DataResidencyRegion {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return regionAliases[normalized] ?? fallback;
}

export function defaultDataResidencyRegion(): DataResidencyRegion {
  return normalizeDataResidencyRegion(process.env.GREYBOX_DEFAULT_REGION, 'us');
}

export interface TenantSnapshot {
  version: 1;
  tenants: TenantConfig[];
  organizationTenantIds: Array<[string, string]>;
  seal?: TenantSnapshotSeal;
}

export interface TenantSnapshotSealOptions {
  keyId: string;
  secret: string;
}

interface TenantSnapshotSeal {
  algorithm: 'hmac-sha256';
  keyId: string;
  signature: string;
}

export interface TenantStoreOptions {
  rootDir?: string;
  filename?: string;
  seal?: TenantSnapshotSealOptions;
  /**
   * Optional pluggable persister. When provided, takes precedence over the
   * file-based persister derived from rootDir. Used to wire a Postgres-backed
   * snapshot store in production while keeping the file-based default for
   * single-node deployments and tests.
   */
  persister?: TenantSnapshotPersister;
}

/**
 * Storage adapter for {@link TenantStore}. Implementations are read on boot
 * and before sync reads/mutations (loadSync), so the store's in-memory map can
 * answer inference/auth requests while still seeing durable updates from other
 * in-process store instances; writes flush a complete snapshot.
 *
 * Why complete snapshots: tenants change orders-of-magnitude less often than
 * inference requests do, and the snapshot keeps both maps (tenants by id +
 * organization to tenant id) consistent atomically. We trade write amplification
 * for read latency.
 */
export interface TenantSnapshotPersister {
  /** Load the current snapshot from the persister's local cache or durable file. */
  loadSync(): TenantSnapshot | undefined;
  /** Persist the full snapshot atomically. Called on every mutation. */
  saveSync(snapshot: TenantSnapshot): void;
  /** Refresh any internal cache from durable storage before a request path reads. */
  refresh?(): Promise<void>;
}

export class TenantStore {
  private readonly tenants = new Map<string, TenantConfig>();
  private readonly organizationTenantIds = new Map<string, string>();
  private readonly seal: TenantSnapshotSealOptions | undefined;
  private readonly persister: TenantSnapshotPersister | undefined;

  constructor(options: TenantStoreOptions = {}) {
    this.seal = options.seal ?? tenantSnapshotSealOptionsFromEnv();
    this.persister = options.persister
      ?? (options.rootDir
        ? new FileTenantSnapshotPersister({
            rootDir: options.rootDir,
            filename: options.filename ?? 'tenants.json',
          })
        : undefined);
    if (this.persister) {
      this.loadFromPersister();
    }
  }

  getOrCreate(
    id: string,
    tier: PlanTier = 'indie',
    options: TenantCreateOptions = {},
  ): TenantConfig {
    this.reloadFromPersister();
    const existing = this.tenants.get(id);
    if (existing) return existing;
    const tenant: TenantConfig = {
      id,
      tier,
      region: options.region ?? defaultDataResidencyRegion(),
      ssoEnabled: tier === 'enterprise',
      ...includedTokens[tier],
    };
    this.tenants.set(id, tenant);
    this.persist();
    return tenant;
  }

  getOrCreateForOrganization(
    organizationId: string,
    tier: PlanTier = 'studio',
    options: TenantCreateOptions = {},
  ): TenantConfig {
    this.reloadFromPersister();
    const existingTenantId = this.organizationTenantIds.get(organizationId);
    if (existingTenantId) return this.getOrCreate(existingTenantId, tier, options);
    const tenantId = `workos:${organizationId}`;
    const tenant = {
      ...this.getOrCreate(tenantId, tier, options),
      organizationId,
      ssoEnabled: true,
    };
    this.tenants.set(tenantId, tenant);
    this.organizationTenantIds.set(organizationId, tenantId);
    this.persist();
    return tenant;
  }

  get(id: string): TenantConfig | undefined {
    this.reloadFromPersister();
    return this.tenants.get(id);
  }

  async refreshFromPersister(): Promise<void> {
    if (!this.persister) return;
    await this.persister.refresh?.();
    this.loadFromPersister();
  }

  upsert(tenant: TenantConfig): void {
    this.reloadFromPersister();
    this.tenants.set(tenant.id, tenant);
    if (tenant.organizationId) this.organizationTenantIds.set(tenant.organizationId, tenant.id);
    this.persist();
  }

  private reloadFromPersister(): void {
    if (!this.persister) return;
    this.loadFromPersister();
  }

  private loadFromPersister(): void {
    if (!this.persister) return;
    const snapshot = this.persister.loadSync();
    if (!snapshot || snapshot.version !== 1) return;
    assertTenantSnapshotSeal(snapshot, this.seal);
    this.tenants.clear();
    this.organizationTenantIds.clear();
    for (const tenant of snapshot.tenants ?? []) {
      if (tenant && typeof tenant.id === 'string') this.tenants.set(tenant.id, tenant);
    }
    for (const [orgId, tenantId] of snapshot.organizationTenantIds ?? []) {
      if (typeof orgId === 'string' && typeof tenantId === 'string') {
        this.organizationTenantIds.set(orgId, tenantId);
      }
    }
  }

  private persist(): void {
    if (!this.persister) return;
    const snapshot: TenantSnapshot = {
      version: 1,
      tenants: Array.from(this.tenants.values()),
      organizationTenantIds: Array.from(this.organizationTenantIds.entries()),
    };
    const sealedSnapshot = this.seal ? sealTenantSnapshot(snapshot, this.seal) : snapshot;
    this.persister.saveSync(sealedSnapshot);
  }
}

/** File-based persister: writes an atomic, optionally-sealed JSON snapshot. */
export class FileTenantSnapshotPersister implements TenantSnapshotPersister {
  private readonly rootDir: string;
  private readonly filename: string;

  constructor(options: { rootDir: string; filename?: string }) {
    this.rootDir = options.rootDir;
    this.filename = options.filename ?? 'tenants.json';
  }

  private get filePath(): string {
    return path.join(this.rootDir, this.filename);
  }

  loadSync(): TenantSnapshot | undefined {
    let text: string;
    try {
      text = readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    return JSON.parse(text) as TenantSnapshot;
  }

  saveSync(snapshot: TenantSnapshot): void {
    mkdirSync(this.rootDir, { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    writeFileSync(tempPath, JSON.stringify(snapshot, null, 2), 'utf8');
    renameSync(tempPath, this.filePath);
  }
}

export function tenantSnapshotSealOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
): TenantSnapshotSealOptions | undefined {
  const secret = env.GREYBOX_TENANT_STORE_SEAL_KEY?.trim();
  if (!secret) return undefined;
  const keyId = env.GREYBOX_TENANT_STORE_SEAL_KEY_ID?.trim() || 'default';
  if (!/^[A-Za-z0-9._:/-]{1,160}$/u.test(keyId)) return undefined;
  return { keyId, secret };
}

function sealTenantSnapshot(snapshot: TenantSnapshot, seal: TenantSnapshotSealOptions): TenantSnapshot {
  const unsigned = unsignedTenantSnapshot(snapshot);
  return {
    ...unsigned,
    seal: {
      algorithm: 'hmac-sha256',
      keyId: seal.keyId,
      signature: signTenantSnapshot(unsigned, seal),
    },
  };
}

function assertTenantSnapshotSeal(snapshot: TenantSnapshot, seal: TenantSnapshotSealOptions | undefined): void {
  if (!seal) return;
  if (snapshot.seal?.algorithm !== 'hmac-sha256' || snapshot.seal.keyId !== seal.keyId || !snapshot.seal.signature) {
    throw new Error('tenant snapshot seal is missing or uses the wrong key');
  }
  const expected = signTenantSnapshot(unsignedTenantSnapshot(snapshot), seal);
  if (!constantTimeHexEqual(snapshot.seal.signature, expected)) {
    throw new Error('tenant snapshot seal is invalid');
  }
}

function signTenantSnapshot(snapshot: TenantSnapshot, seal: TenantSnapshotSealOptions): string {
  return createHmac('sha256', seal.secret)
    .update(`${seal.keyId}.${stableJson(unsignedTenantSnapshot(snapshot))}`)
    .digest('hex');
}

function unsignedTenantSnapshot(snapshot: TenantSnapshot): TenantSnapshot {
  return {
    version: 1,
    tenants: snapshot.tenants ?? [],
    organizationTenantIds: snapshot.organizationTenantIds ?? [],
  };
}

function constantTimeHexEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
