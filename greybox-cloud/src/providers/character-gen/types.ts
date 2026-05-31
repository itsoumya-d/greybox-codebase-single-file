// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Character generation provider interface.
//
// External vendors (Meshy v3, Tripo3D, deterministic mock for tests) each
// implement this interface so the character router can swap them at runtime
// without leaking vendor-specific request/response shapes into the rest of
// the cloud. All providers return a discriminated union for job status so
// callers can pattern-match on `state` without optional chaining.

/**
 * Canonical art styles we accept on the inbound side. Each provider maps
 * these onto its own enum.
 */
export type CharacterStyle = 'realistic' | 'stylized' | 'anime' | 'low-poly' | 'cartoon';

/**
 * Input to {@link CharacterGenProvider.submitJob}. The cloud-side router
 * validates this shape from JSON before forwarding to a provider.
 *
 * Mirrors `Character`/`CharacterProvenance` from
 * `open-design/packages/schema/src/character.ts`. Keep in sync when the
 * schema package evolves.
 */
export interface CharacterGenInput {
  /** Natural language prompt describing the character. */
  prompt: string;
  /** Canonical art style; mapped to provider-specific enums by each provider. */
  style: CharacterStyle;
  /** Whether to request a rigged + animated character. */
  rigged: boolean;
  /** Target triangle / polygon budget; providers may quantize this. */
  targetPolyCount: number;
  /** Optional reference image URL to condition the generator. */
  referenceImageUrl?: string;
  /** Deterministic seed; mock provider uses this for reproducible delays. */
  seed?: number;
}

/**
 * Discriminated union describing the lifecycle of a generation job.
 *
 *   - `queued`: provider accepted the job but has not started processing
 *   - `processing`: in-progress; `percent` is the provider's progress estimate
 *   - `done`: finished; `outputs` carries the produced glTF/thumbnail/license
 *   - `failed`: terminal failure; `error` is a short, redacted reason
 */
export type CharacterGenJobStatus =
  | {
    state: 'queued';
    queuedAt: string;
  }
  | {
    state: 'processing';
    /** 0..100; clamped by callers. */
    percent: number;
  }
  | {
    state: 'done';
    outputs: {
      /** Public or signed URL to a binary glTF (.glb) file. */
      gltfUrl: string;
      /** Public or signed URL to a PNG/JPG thumbnail. */
      thumbnailUrl: string;
      /** SPDX identifier or free-form license string. */
      license: string;
    };
    completedAt: string;
  }
  | {
    state: 'failed';
    /** Short, redacted error reason. Never includes credentials or PII. */
    error: string;
    failedAt: string;
  };

/**
 * Capability descriptor for a provider. Used by the registry to surface
 * provider metadata on /v1/characters/providers without instantiating them.
 */
export interface CharacterGenProviderDescriptor {
  name: string;
  /** Whether the provider needs an API key to function. */
  requiresApiKey: boolean;
  /** Supported art styles. */
  styles: readonly CharacterStyle[];
  /** Whether the provider can produce rigged characters. */
  supportsRig: boolean;
}

/**
 * Provider interface.
 *
 * Implementations must be stateless across calls except for the provider's
 * own HTTP client and (optionally) a private fixture cache for the mock.
 * No provider may hold a job map locally — that belongs to the
 * `CharacterJobStore`.
 */
export interface CharacterGenProvider {
  /** Stable provider name; appears in job records and analytics. */
  readonly name: string;
  /** Descriptor returned by /v1/characters/providers. */
  readonly descriptor: CharacterGenProviderDescriptor;
  /** Submit a job; returns the provider's own jobId for later polling. */
  submitJob(input: CharacterGenInput): Promise<{ jobId: string }>;
  /** Poll a previously-submitted job for its current status. */
  pollJob(jobId: string): Promise<CharacterGenJobStatus>;
}

/**
 * Error type thrown by providers when input is invalid. Mapped to 400 by
 * the router; messages must already be redacted of secrets.
 */
export class CharacterGenInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'CharacterGenInputError';
  }
}

/**
 * Error type for provider misconfiguration (e.g. missing API key). Mapped
 * to 500 by the router; the router logs and reports without exposing the
 * underlying secret to the client.
 */
export class CharacterGenConfigError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = 'CharacterGenConfigError';
  }
}

/**
 * Error type for provider/upstream failures. Mapped to 502.
 */
export class CharacterGenUpstreamError extends Error {
  readonly status = 502;
  readonly upstreamStatus?: number;
  constructor(message: string, upstreamStatus?: number) {
    super(message);
    this.name = 'CharacterGenUpstreamError';
    if (upstreamStatus !== undefined) this.upstreamStatus = upstreamStatus;
  }
}

/**
 * Minimal fetch shape the providers depend on. Allows tests to inject a
 * fake without pulling in the entire Node fetch global.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
  json?(): Promise<unknown>;
}>;

/**
 * Coerce a raw JSON body into a {@link CharacterGenInput}, throwing
 * {@link CharacterGenInputError} on any shape problem. Pure (no provider
 * dependencies) so the router can call it before picking a provider.
 */
export function parseCharacterGenInput(value: unknown): CharacterGenInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CharacterGenInputError('body must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  if (!prompt) throw new CharacterGenInputError('prompt must be a non-empty string');
  if (prompt.length > 4000) throw new CharacterGenInputError('prompt must be at most 4000 chars');
  const style = parseCharacterStyle(record.style);
  if (!style) throw new CharacterGenInputError('style must be realistic | stylized | anime | low-poly | cartoon');
  if (typeof record.rigged !== 'boolean') throw new CharacterGenInputError('rigged must be a boolean');
  const targetPolyCount = record.targetPolyCount;
  if (
    typeof targetPolyCount !== 'number'
    || !Number.isInteger(targetPolyCount)
    || targetPolyCount < 100
    || targetPolyCount > 1_000_000
  ) {
    throw new CharacterGenInputError('targetPolyCount must be an integer between 100 and 1,000,000');
  }
  const referenceImageUrl = record.referenceImageUrl;
  if (referenceImageUrl !== undefined) {
    if (typeof referenceImageUrl !== 'string' || referenceImageUrl.trim() === '') {
      throw new CharacterGenInputError('referenceImageUrl must be a non-empty string when present');
    }
    if (referenceImageUrl.length > 2048) {
      throw new CharacterGenInputError('referenceImageUrl must be at most 2048 chars');
    }
    try {
      const parsed = new URL(referenceImageUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new CharacterGenInputError('referenceImageUrl must be an http(s) URL');
      }
    } catch (error) {
      if (error instanceof CharacterGenInputError) throw error;
      throw new CharacterGenInputError('referenceImageUrl must be a valid URL');
    }
  }
  const seed = record.seed;
  if (seed !== undefined) {
    if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 4_294_967_295) {
      throw new CharacterGenInputError('seed must be a 32-bit unsigned integer when present');
    }
  }
  return {
    prompt,
    style,
    rigged: record.rigged,
    targetPolyCount,
    ...(typeof referenceImageUrl === 'string' ? { referenceImageUrl } : {}),
    ...(typeof seed === 'number' ? { seed } : {}),
  };
}

const STYLE_VALUES: readonly CharacterStyle[] = [
  'realistic',
  'stylized',
  'anime',
  'low-poly',
  'cartoon',
];

export function parseCharacterStyle(value: unknown): CharacterStyle | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  return STYLE_VALUES.find((style) => style === normalized);
}
