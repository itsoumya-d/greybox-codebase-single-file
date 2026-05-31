// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Character router.
//
// Exposes the cloud-side HTTP surface for AI-generated character workflows:
//
//   POST   /v1/characters/generate       -> submit a generation job
//   GET    /v1/characters/jobs/:id       -> poll a job (auto-imports on done)
//   POST   /v1/characters/import         -> import (from jobId or raw URL)
//   GET    /v1/characters                -> list a tenant's character library
//   GET    /v1/characters/:characterId   -> fetch a single Character spec
//   GET    /v1/characters/providers      -> introspect provider availability
//
// Auth + license gating is applied at the entry points (Pro tier or above
// for generate/import). The router is intentionally self-contained: it
// accepts callables for auth, license, store, registry and registrar so the
// cloud's `createGreyboxCloudServer` can wire it without spreading
// character-gen specifics through `server.ts`.

import { createHash, randomUUID } from 'node:crypto';
import {
  CharacterGenConfigError,
  CharacterGenInputError,
  CharacterGenUpstreamError,
  type CharacterGenInput,
  type CharacterGenJobStatus,
  parseCharacterGenInput,
} from '../providers/character-gen/types.js';
import {
  AssetRegistrar,
  assetStorageFromEnv,
  type AssetRegistrationResult,
  type AssetStorage,
} from '../providers/character-gen/asset-registry.js';
import {
  validateAndNormalizeGltf,
  type NormalizedSkeleton,
} from '../providers/character-gen/gltf-normalizer.js';
import {
  DefaultCharacterGenRegistry,
  type CharacterGenRegistry,
} from '../providers/character-gen/index.js';
import {
  InMemoryCharacterJobStore,
  type CharacterAnimationClip,
  type CharacterJobRecord,
  type CharacterJobStore,
  type CharacterProvenance,
  type CharacterRecord,
  type CharacterRigJoint,
} from '../stores/CharacterJobStore.js';
import type { AuthContext, PlanTier } from '../types.js';
import {
  CharacterMeteringEmitter,
  CharacterMeteringError,
  TIER_GENERATION_LIMITS,
  nextPeriodStart,
} from '../metering/characterMeteringEmitter.js';

// -- Errors ------------------------------------------------------------------

export class CharacterRouterError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'CharacterRouterError';
    this.status = status;
    this.code = code;
  }
}

// -- Service options ---------------------------------------------------------

export interface CharacterServiceOptions {
  registry?: CharacterGenRegistry;
  store?: CharacterJobStore;
  registrar?: AssetRegistrar;
  /** Plan tiers allowed to use the generate/import endpoints. */
  allowedTiers?: ReadonlyArray<PlanTier>;
  /** Optional testable clock. */
  now?: () => Date;
  /** Optional id generator (deterministic in tests). */
  idGenerator?: () => string;
  /** Optional metering emitter for quota enforcement. When omitted quota checks are skipped. */
  metering?: CharacterMeteringEmitter;
}

const DEFAULT_ALLOWED_TIERS: ReadonlyArray<PlanTier> = ['free', 'indie', 'studio', 'enterprise'];

// -- Imported character DTO --------------------------------------------------

export interface ImportedCharacterDto {
  id: string;
  name: string;
  gltfAssetUri: string;
  gltfPublicUrl?: string;
  sha256: string;
  sizeBytes: number;
  rig: { joints: CharacterRigJoint[] };
  animations: CharacterAnimationClip[];
  gameStats: Record<string, number>;
  provenance: CharacterProvenance;
  warnings: string[];
  schemaVersion: number;
  createdAt: string;
}

// -- Service -----------------------------------------------------------------

export class CharacterService {
  readonly registry: CharacterGenRegistry;
  readonly store: CharacterJobStore;
  private readonly registrar: AssetRegistrar;
  private readonly allowedTiers: ReadonlySet<PlanTier>;
  private readonly now: () => Date;
  private readonly idGenerator: () => string;
  private readonly metering: CharacterMeteringEmitter | null;

  constructor(options: CharacterServiceOptions = {}) {
    this.registry = options.registry ?? defaultRegistry();
    this.store = options.store ?? new InMemoryCharacterJobStore();
    this.registrar = options.registrar ?? defaultRegistrar();
    this.allowedTiers = new Set(options.allowedTiers ?? DEFAULT_ALLOWED_TIERS);
    this.now = options.now ?? (() => new Date());
    this.idGenerator = options.idGenerator ?? (() => randomUUID());
    this.metering = options.metering ?? null;
  }

  /** Throw a 403 if the tenant is not licensed to use character generation. */
  assertLicensed(context: AuthContext): void {
    if (!this.allowedTiers.has(context.tier)) {
      throw new CharacterRouterError(
        403,
        'license_required',
        `character generation requires one of: ${[...this.allowedTiers].join(', ')}`,
      );
    }
  }

  async submitGenerate(input: {
    body: unknown;
    providerName?: string;
    context: AuthContext;
  }): Promise<{ jobId: string; providerJobId: string; providerName: string; createdAt: string; remaining?: number | null }> {
    this.assertLicensed(input.context);

    // Quota enforcement: validate before touching the provider.
    if (this.metering) {
      await this.metering.validateCanGenerate(input.context.tenantId, input.context.tier);
    }

    const parsed = parseCharacterGenInput(input.body);
    const provider = this.registry.get(input.providerName);
    const { jobId: providerJobId } = await provider.submitJob(parsed);
    const jobId = this.idGenerator();
    const created = await this.store.createJob({
      id: jobId,
      tenantId: input.context.tenantId,
      userId: input.context.userId,
      providerName: provider.name,
      providerJobId,
      input: parsed,
      state: 'queued',
      percent: 0,
    });

    // Record job start in metering (best-effort: do not fail the request if metering is down).
    let remaining: number | null | undefined;
    if (this.metering) {
      try {
        await this.metering.recordJobStart(jobId, input.context.tenantId, provider.name);
        remaining = await this.metering.getRemainingGenerations(input.context.tenantId, input.context.tier);
      } catch {
        // Metering errors are non-fatal after the job is created.
      }
    }

    return {
      jobId: created.id,
      providerJobId: created.providerJobId,
      providerName: created.providerName,
      createdAt: created.createdAt,
      ...(remaining !== undefined ? { remaining } : {}),
    };
  }

  async getJob(jobId: string, context: AuthContext): Promise<{
    job: CharacterJobRecord;
    status: CharacterGenJobStatus;
    importedCharacter?: ImportedCharacterDto;
  }> {
    this.assertLicensed(context);
    const job = await this.store.getJob(jobId, context.tenantId);
    if (!job) throw new CharacterRouterError(404, 'job_not_found', `character job ${jobId} not found`);
    // Terminal states are returned as-is; we only poll when still mutable.
    if (job.state === 'done' || job.state === 'failed') {
      const status = statusFromJob(job);
      const result: {
        job: CharacterJobRecord;
        status: CharacterGenJobStatus;
        importedCharacter?: ImportedCharacterDto;
      } = { job, status };
      if (job.importedCharacterId) {
        const character = await this.store.getCharacter(job.importedCharacterId, context.tenantId);
        if (character) result.importedCharacter = characterToDto(character);
      }
      return result;
    }
    const provider = this.registry.get(job.providerName);
    let upstream: CharacterGenJobStatus;
    try {
      upstream = await provider.pollJob(job.providerJobId);
    } catch (error) {
      if (error instanceof CharacterGenUpstreamError) {
        // Surface as a fresh "processing" rather than poisoning the job;
        // operators see the underlying status on next call. We don't write
        // the upstream error to the store unless the provider returned a
        // terminal failed status itself.
        return { job, status: statusFromJob(job) };
      }
      throw error;
    }
    const updated = await this.store.updateJobStatus(job.id, job.tenantId, upstream);
    const next = updated ?? job;

    // Record metering events for terminal provider states.
    if (this.metering) {
      if (upstream.state === 'done') {
        const cost = CharacterMeteringEmitter.defaultCostUsd(job.providerName);
        await this.metering.recordJobComplete(job.id, 0, cost).catch(() => undefined);
      } else if (upstream.state === 'failed') {
        await this.metering.recordJobFailed(job.id, upstream.error ?? 'unknown').catch(() => undefined);
      }
    }

    if (upstream.state === 'done' && !next.importedCharacterId) {
      try {
        const imported = await this.autoImport(next, upstream, context);
        return { job: imported.job, status: upstream, importedCharacter: imported.character };
      } catch (error) {
        // If auto-import fails we still report 'done' from the provider
        // but record the error so subsequent polls can retry. Importing
        // explicitly via POST /v1/characters/import remains available.
        const message = error instanceof Error ? error.message : String(error);
        await this.store.updateJobStatus(next.id, next.tenantId, {
          state: 'failed',
          error: `import failed: ${message}`,
          failedAt: this.now().toISOString(),
        });
        return {
          job: { ...next, state: 'failed', error: `import failed: ${message}` },
          status: { state: 'failed', error: `import failed: ${message}`, failedAt: this.now().toISOString() },
        };
      }
    }
    return { job: next, status: upstream };
  }

  async importByJobId(input: {
    jobId: string;
    context: AuthContext;
  }): Promise<ImportedCharacterDto> {
    this.assertLicensed(input.context);
    const job = await this.store.getJob(input.jobId, input.context.tenantId);
    if (!job) {
      throw new CharacterRouterError(404, 'job_not_found', `character job ${input.jobId} not found`);
    }
    if (job.state !== 'done' || !job.outputs) {
      throw new CharacterRouterError(
        409,
        'job_not_done',
        `cannot import character job in state=${job.state}`,
      );
    }
    if (job.importedCharacterId) {
      const existing = await this.store.getCharacter(job.importedCharacterId, input.context.tenantId);
      if (existing) return characterToDto(existing);
    }
    const status: CharacterGenJobStatus = {
      state: 'done',
      outputs: job.outputs,
      completedAt: job.updatedAt,
    };
    const result = await this.autoImport(job, status, input.context);
    return result.character;
  }

  async importByUrl(input: {
    gltfUrl: string;
    providerProvenance?: Partial<CharacterProvenance>;
    name?: string;
    context: AuthContext;
  }): Promise<ImportedCharacterDto> {
    this.assertLicensed(input.context);
    if (!input.gltfUrl || typeof input.gltfUrl !== 'string') {
      throw new CharacterRouterError(400, 'gltf_url_required', 'gltfUrl is required');
    }
    try {
      const parsed = new URL(input.gltfUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && !parsed.protocol.startsWith('greybox-mock')) {
        throw new CharacterRouterError(400, 'invalid_gltf_url', 'gltfUrl must be an http(s) URL');
      }
    } catch (error) {
      if (error instanceof CharacterRouterError) throw error;
      throw new CharacterRouterError(400, 'invalid_gltf_url', 'gltfUrl must be a valid URL');
    }
    const characterId = this.idGenerator();
    const registration = await this.registrar.register({
      tenantId: input.context.tenantId,
      characterId,
      sourceUrl: input.gltfUrl,
    });
    const character = await this.persistCharacter({
      characterId,
      tenantId: input.context.tenantId,
      registration,
      name: input.name?.trim() || 'Imported character',
      provenance: {
        genProvider: input.providerProvenance?.genProvider ?? 'manual-import',
        ...(input.providerProvenance?.prompt !== undefined ? { prompt: input.providerProvenance.prompt } : {}),
        ...(input.providerProvenance?.seed !== undefined ? { seed: input.providerProvenance.seed } : {}),
        license: input.providerProvenance?.license ?? 'unknown',
        ...(input.providerProvenance?.modelVersion !== undefined ? { modelVersion: input.providerProvenance.modelVersion } : {}),
      },
    });
    return character;
  }

  async listCharacters(context: AuthContext, limit?: number): Promise<ImportedCharacterDto[]> {
    this.assertLicensed(context);
    const records = await this.store.listCharactersForTenant(context.tenantId, limit ?? 100);
    return records.map((record) => characterToDto(record));
  }

  async getCharacter(id: string, context: AuthContext): Promise<ImportedCharacterDto> {
    this.assertLicensed(context);
    const record = await this.store.getCharacter(id, context.tenantId);
    if (!record) {
      throw new CharacterRouterError(404, 'character_not_found', `character ${id} not found`);
    }
    return characterToDto(record);
  }

  // -- Internals -------------------------------------------------------------

  private async autoImport(
    job: CharacterJobRecord,
    status: Extract<CharacterGenJobStatus, { state: 'done' }>,
    context: AuthContext,
  ): Promise<{ job: CharacterJobRecord; character: ImportedCharacterDto }> {
    const characterId = this.idGenerator();
    const registration = await this.registrar.register({
      tenantId: context.tenantId,
      characterId,
      sourceUrl: status.outputs.gltfUrl,
    });
    const provenance: CharacterProvenance = {
      genProvider: job.providerName,
      prompt: job.input.prompt,
      ...(typeof job.input.seed === 'number' ? { seed: job.input.seed } : {}),
      license: status.outputs.license,
    };
    const character = await this.persistCharacter({
      characterId,
      tenantId: context.tenantId,
      registration,
      name: deriveCharacterName(job.input),
      provenance,
    });
    const updatedJob = await this.store.setJobImportedCharacter(job.id, job.tenantId, character.id);
    return { job: updatedJob ?? job, character };
  }

  private async persistCharacter(input: {
    characterId: string;
    tenantId: string;
    registration: AssetRegistrationResult;
    name: string;
    provenance: CharacterProvenance;
  }): Promise<ImportedCharacterDto> {
    let skeleton: NormalizedSkeleton;
    const warnings: string[] = [];
    try {
      const inspection = validateAndNormalizeGltf(input.registration.bytes);
      skeleton = inspection.skeleton;
      warnings.push(...inspection.validation.warnings, ...skeleton.warnings);
    } catch (error) {
      if (error instanceof CharacterGenUpstreamError) {
        warnings.push(error.message);
        skeleton = { joints: [], unmappedJoints: [], animations: [], warnings: [error.message] };
      } else {
        throw error;
      }
    }

    const animations: CharacterAnimationClip[] = skeleton.animations.map((clip, index) => ({
      id: `${input.characterId}-clip-${index}`,
      name: clip.canonicalLabel ?? clip.sourceName,
      clipRef: input.registration.uri,
      duration: typeof clip.duration === 'number' && clip.duration > 0 ? clip.duration : 0,
      loop: clip.loop,
    }));

    const record: CharacterRecord = {
      id: input.characterId,
      tenantId: input.tenantId,
      name: input.name,
      gltfAssetUri: input.registration.uri,
      sha256: input.registration.sha256,
      sizeBytes: input.registration.sizeBytes,
      rig: {
        joints: skeleton.joints.map((joint) => ({
          name: joint.mixamoName ?? joint.sourceName,
          parent: joint.parent,
        })),
      },
      animations,
      gameStats: defaultGameStats(),
      provenance: input.provenance,
      schemaVersion: 1,
      warnings,
      createdAt: this.now().toISOString(),
    };
    const stored = await this.store.saveCharacter(record);
    return characterToDto(stored, input.registration.publicUrl);
  }
}

// -- HTTP router (matches server.ts conventions) -----------------------------

/**
 * Pure HTTP router. Returns `undefined` when no route matched so the
 * top-level server.ts can continue its switch. This deliberately mirrors
 * the existing per-router pattern (e.g. `routers/inference.ts`).
 */
export async function handleCharacterRoute(
  request: {
    method: string;
    url: URL;
    headers: Headers;
    readJson(): Promise<unknown>;
  },
  service: CharacterService,
  resolveAuth: (headers: Headers) => Promise<AuthContext>,
): Promise<{ status: number; body: unknown } | undefined> {
  const method = request.method.toUpperCase();
  const { pathname } = request.url;

  if (method === 'GET' && pathname === '/v1/characters/providers') {
    const context = await resolveAuth(request.headers);
    return {
      status: 200,
      body: {
        providers: service.registry.list(),
        defaultProvider: service.registry.has('default')
          ? 'default'
          : service.registry.list()[0]?.name,
        canUse: tryAllowed(service, context),
      },
    };
  }

  if (method === 'POST' && pathname === '/v1/characters/generate') {
    const context = await resolveAuth(request.headers);
    const body = await request.readJson();
    const providerName = request.url.searchParams.get('provider') ?? undefined;
    try {
      const result = await service.submitGenerate({ body, providerName, context });
      return { status: 202, body: result };
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET' && pathname === '/v1/characters') {
    const context = await resolveAuth(request.headers);
    try {
      const limit = parseLimit(request.url.searchParams.get('limit'));
      const list = await service.listCharacters(context, limit);
      return { status: 200, body: { characters: list } };
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'POST' && pathname === '/v1/characters/import') {
    const context = await resolveAuth(request.headers);
    const body = await request.readJson();
    try {
      const record = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
      if (typeof record.jobId === 'string' && record.jobId.trim()) {
        const character = await service.importByJobId({ jobId: record.jobId, context });
        return { status: 200, body: character };
      }
      if (typeof record.gltfUrl === 'string' && record.gltfUrl.trim()) {
        const provenanceRaw = record.providerProvenance;
        const provenance = parseImportProvenance(provenanceRaw);
        const character = await service.importByUrl({
          gltfUrl: record.gltfUrl.trim(),
          ...(provenance ? { providerProvenance: provenance } : {}),
          ...(typeof record.name === 'string' && record.name.trim() ? { name: record.name.trim() } : {}),
          context,
        });
        return { status: 200, body: character };
      }
      throw new CharacterRouterError(
        400,
        'invalid_import_body',
        'import body must contain jobId or gltfUrl',
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (method === 'GET') {
    const jobMatch = pathname.match(/^\/v1\/characters\/jobs\/([A-Za-z0-9_-]{1,128})$/u);
    if (jobMatch) {
      const context = await resolveAuth(request.headers);
      try {
        const result = await service.getJob(jobMatch[1] ?? '', context);
        return {
          status: 200,
          body: {
            jobId: result.job.id,
            providerName: result.job.providerName,
            providerJobId: result.job.providerJobId,
            state: result.status.state,
            ...(result.status.state === 'queued' ? { queuedAt: result.status.queuedAt } : {}),
            ...(result.status.state === 'processing' ? { percent: result.status.percent } : {}),
            ...(result.status.state === 'done'
              ? { completedAt: result.status.completedAt, outputs: result.status.outputs }
              : {}),
            ...(result.status.state === 'failed'
              ? { failedAt: result.status.failedAt, error: result.status.error }
              : {}),
            ...(result.importedCharacter ? { importedCharacter: result.importedCharacter } : {}),
            createdAt: result.job.createdAt,
            updatedAt: result.job.updatedAt,
          },
        };
      } catch (error) {
        return errorResponse(error);
      }
    }
    const characterMatch = pathname.match(/^\/v1\/characters\/([A-Za-z0-9_-]{1,128})$/u);
    if (characterMatch && !pathname.startsWith('/v1/characters/jobs/')) {
      const context = await resolveAuth(request.headers);
      try {
        const character = await service.getCharacter(characterMatch[1] ?? '', context);
        return { status: 200, body: character };
      } catch (error) {
        return errorResponse(error);
      }
    }
  }

  return undefined;
}

// -- Helpers -----------------------------------------------------------------

function tryAllowed(service: CharacterService, context: AuthContext): boolean {
  try {
    service.assertLicensed(context);
    return true;
  } catch {
    return false;
  }
}

function parseLimit(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(500, parsed));
}

function parseImportProvenance(value: unknown): Partial<CharacterProvenance> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const out: Partial<CharacterProvenance> = {};
  if (typeof record.genProvider === 'string') out.genProvider = record.genProvider.trim();
  if (typeof record.prompt === 'string') out.prompt = record.prompt;
  if (typeof record.seed === 'number' && Number.isFinite(record.seed)) out.seed = record.seed;
  if (typeof record.license === 'string') out.license = record.license.trim();
  if (typeof record.modelVersion === 'string') out.modelVersion = record.modelVersion.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

function statusFromJob(job: CharacterJobRecord): CharacterGenJobStatus {
  switch (job.state) {
    case 'queued':
      return { state: 'queued', queuedAt: job.createdAt };
    case 'processing':
      return { state: 'processing', percent: job.percent };
    case 'done':
      if (job.outputs) {
        return { state: 'done', outputs: job.outputs, completedAt: job.updatedAt };
      }
      return {
        state: 'failed',
        error: 'job marked done but outputs missing',
        failedAt: job.updatedAt,
      };
    case 'failed':
      return {
        state: 'failed',
        error: job.error ?? 'unknown failure',
        failedAt: job.updatedAt,
      };
  }
}

function characterToDto(record: CharacterRecord, publicUrl?: string): ImportedCharacterDto {
  return {
    id: record.id,
    name: record.name,
    gltfAssetUri: record.gltfAssetUri,
    ...(publicUrl ? { gltfPublicUrl: publicUrl } : {}),
    sha256: record.sha256,
    sizeBytes: record.sizeBytes,
    rig: { joints: record.rig.joints.map((joint) => ({ ...joint })) },
    animations: record.animations.map((clip) => ({ ...clip })),
    gameStats: { ...record.gameStats },
    provenance: { ...record.provenance },
    warnings: [...record.warnings],
    schemaVersion: record.schemaVersion,
    createdAt: record.createdAt,
  };
}

function deriveCharacterName(input: CharacterGenInput): string {
  const trimmed = input.prompt.trim().slice(0, 64).replace(/\s+/gu, ' ');
  return trimmed || 'Generated character';
}

function defaultGameStats(): Record<string, number> {
  // Sensible defaults so the imported character satisfies the schema's
  // hp/speed/damage/defense invariant immediately. The page-by-page editor
  // can overwrite via its own UI.
  return {
    hp: 100,
    speed: 5,
    damage: 10,
    defense: 5,
  };
}

function errorResponse(error: unknown): { status: number; body: unknown } {
  if (error instanceof CharacterMeteringError) {
    return {
      status: error.status,
      body: {
        error: error.code,
        message: error.message,
        upgrade_url: '/billing',
        ...error.detail,
      },
    };
  }
  if (error instanceof CharacterRouterError) {
    return { status: error.status, body: { error: error.code, message: error.message } };
  }
  if (error instanceof CharacterGenInputError) {
    return { status: 400, body: { error: 'invalid_input', message: error.message } };
  }
  if (error instanceof CharacterGenConfigError) {
    return { status: 500, body: { error: 'provider_misconfigured', message: error.message } };
  }
  if (error instanceof CharacterGenUpstreamError) {
    return {
      status: 502,
      body: { error: 'provider_upstream_error', message: error.message },
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 500, body: { error: 'internal_error', message } };
}

function defaultRegistry(): CharacterGenRegistry {
  return new DefaultCharacterGenRegistry({
    providers: [],
    defaultProviderName: 'mock',
  });
}

function defaultRegistrar(): AssetRegistrar {
  return new AssetRegistrar({
    storage: assetStorageFromEnv().storage,
  });
}

/** Stable, low-cardinality fingerprint of an Input used in tests. */
export function fingerprintInput(input: CharacterGenInput): string {
  return createHash('sha256')
    .update([input.prompt, input.style, String(input.rigged), String(input.targetPolyCount), String(input.seed ?? 'auto')].join('\n'))
    .digest('hex')
    .slice(0, 16);
}
