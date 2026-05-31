// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Meshy v3 character generation provider.
//
// API surface (as of 2026-Q1, see https://docs.meshy.ai):
//
//   POST {BASE}/openapi/v1/text-to-3d
//     body: { mode: "preview"|"refine", prompt, art_style, ... }
//     headers: Authorization: Bearer ${API_KEY}
//     returns: { result: <jobId> } | { id: <jobId> }
//
//   GET {BASE}/openapi/v1/text-to-3d/{jobId}
//     returns: { id, status: "PENDING"|"IN_PROGRESS"|"SUCCEEDED"|"FAILED"|"EXPIRED",
//                progress: <0..100>, model_urls?: { glb, fbx, ... },
//                thumbnail_url?: string, task_error?: { message } }
//
// We hold the cloud-side adapter to the minimum of this surface so when
// Meshy ships v4 (or shifts field names) we only have to update this file.

import {
  CharacterGenConfigError,
  CharacterGenUpstreamError,
  type CharacterGenInput,
  type CharacterGenJobStatus,
  type CharacterGenProvider,
  type CharacterGenProviderDescriptor,
  type CharacterStyle,
  type FetchLike,
} from './types.js';

export interface MeshyV3ProviderOptions {
  apiKey: string;
  baseUrl?: string;
  /** Optional fetch override; defaults to the global `fetch`. */
  fetch?: FetchLike;
  /** Mode passed to the API: 'preview' (fast) or 'refine' (high-quality). */
  mode?: 'preview' | 'refine';
  /** Whether to request PBR materials. */
  enablePbr?: boolean;
}

const DEFAULT_BASE_URL = 'https://api.meshy.ai';

// Meshy uses different style names than our canonical set.
const styleToMeshy: Record<CharacterStyle, string> = {
  realistic: 'realistic',
  stylized: 'sculpture',
  anime: 'anime',
  'low-poly': 'voxel',
  cartoon: 'cartoon',
};

export class MeshyV3Provider implements CharacterGenProvider {
  readonly name = 'meshy-v3';
  readonly descriptor: CharacterGenProviderDescriptor = {
    name: 'meshy-v3',
    requiresApiKey: true,
    styles: ['realistic', 'stylized', 'anime', 'low-poly', 'cartoon'],
    supportsRig: true,
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly mode: 'preview' | 'refine';
  private readonly enablePbr: boolean;

  constructor(options: MeshyV3ProviderOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new CharacterGenConfigError('Meshy v3 provider requires MESHY_API_KEY');
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = stripTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    const candidate = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!candidate) {
      throw new CharacterGenConfigError('Meshy v3 provider needs fetch (no global fetch found)');
    }
    this.fetchFn = candidate;
    this.mode = options.mode ?? 'preview';
    this.enablePbr = options.enablePbr ?? true;
  }

  async submitJob(input: CharacterGenInput): Promise<{ jobId: string }> {
    const url = `${this.baseUrl}/openapi/v1/text-to-3d`;
    const body: Record<string, unknown> = {
      mode: this.mode,
      prompt: input.prompt,
      art_style: styleToMeshy[input.style],
      negative_prompt: 'low quality, lowres, ugly, blurry, watermark',
      enable_pbr: this.enablePbr,
      target_polycount: input.targetPolyCount,
    };
    if (input.referenceImageUrl) body.reference_image_url = input.referenceImageUrl;
    if (typeof input.seed === 'number') body.seed = input.seed;
    if (input.rigged) body.should_rig = true;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await upstreamError(response, 'meshy submitJob');
    }
    const json = await parseJson(response);
    const jobId = extractMeshyJobId(json);
    if (!jobId) {
      throw new CharacterGenUpstreamError('meshy submitJob: response missing job id');
    }
    return { jobId };
  }

  async pollJob(jobId: string): Promise<CharacterGenJobStatus> {
    if (!jobId.trim()) throw new CharacterGenUpstreamError('meshy pollJob: empty jobId');
    const url = `${this.baseUrl}/openapi/v1/text-to-3d/${encodeURIComponent(jobId)}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await upstreamError(response, 'meshy pollJob');
    }
    const json = await parseJson(response);
    return parseMeshyStatus(json);
  }
}

interface MeshyStatusRaw {
  status?: string;
  state?: string;
  progress?: number;
  created_at?: string | number;
  finished_at?: string | number;
  model_urls?: { glb?: string; fbx?: string };
  thumbnail_url?: string;
  task_error?: { message?: string };
  error?: { message?: string } | string;
  license?: string;
}

export function parseMeshyStatus(raw: unknown): CharacterGenJobStatus {
  if (!raw || typeof raw !== 'object') {
    throw new CharacterGenUpstreamError('meshy pollJob: response is not an object');
  }
  const r = raw as MeshyStatusRaw;
  const state = (r.status ?? r.state ?? '').toUpperCase();
  switch (state) {
    case 'PENDING':
    case 'QUEUED': {
      return {
        state: 'queued',
        queuedAt: isoTimestamp(r.created_at) ?? new Date().toISOString(),
      };
    }
    case 'IN_PROGRESS':
    case 'PROCESSING':
    case 'RUNNING': {
      const percent = typeof r.progress === 'number'
        ? clampPercent(r.progress)
        : 50;
      return { state: 'processing', percent };
    }
    case 'SUCCEEDED':
    case 'SUCCESS':
    case 'COMPLETED': {
      const gltfUrl = r.model_urls?.glb?.trim();
      if (!gltfUrl) {
        throw new CharacterGenUpstreamError('meshy pollJob: SUCCEEDED but no model_urls.glb');
      }
      return {
        state: 'done',
        outputs: {
          gltfUrl,
          thumbnailUrl: r.thumbnail_url?.trim() ?? '',
          license: r.license?.trim() || 'Meshy-Generated-Commercial-Use',
        },
        completedAt: isoTimestamp(r.finished_at) ?? new Date().toISOString(),
      };
    }
    case 'FAILED':
    case 'EXPIRED':
    case 'CANCELED':
    case 'CANCELLED': {
      const message = r.task_error?.message
        ?? (typeof r.error === 'string' ? r.error : r.error?.message)
        ?? `meshy job ${state.toLowerCase()}`;
      return {
        state: 'failed',
        error: redactMessage(message),
        failedAt: isoTimestamp(r.finished_at) ?? new Date().toISOString(),
      };
    }
    default: {
      // Unknown states are treated as processing with 50% progress so we
      // don't false-fail a job over a transient API enum change.
      return { state: 'processing', percent: 50 };
    }
  }
}

export function extractMeshyJobId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const candidate = r.result ?? r.id ?? r.task_id ?? r.taskId;
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  return undefined;
}

async function upstreamError(
  response: { status: number; statusText?: string; text(): Promise<string> },
  prefix: string,
): Promise<CharacterGenUpstreamError> {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 256);
  } catch {
    // Swallow — body unreadable. The status code is enough.
  }
  return new CharacterGenUpstreamError(
    `${prefix} failed: HTTP ${response.status} ${response.statusText ?? ''} ${redactMessage(detail)}`.trim(),
    response.status,
  );
}

async function parseJson(response: { json?(): Promise<unknown>; text(): Promise<string> }): Promise<unknown> {
  if (typeof response.json === 'function') {
    try {
      return await response.json();
    } catch {
      // fall through to text-based parse
    }
  }
  const text = await response.text();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new CharacterGenUpstreamError('upstream returned non-JSON body');
  }
}

function isoTimestamp(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Meshy uses unix seconds, but some endpoints return ms; detect.
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  return undefined;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 99;
  return Math.round(value);
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

// Strip likely-credential substrings and collapse whitespace before we
// surface an upstream error back to the API caller.
function redactMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/giu, 'Bearer [redacted]')
    .replace(/(?:sk|pk)[-_][A-Za-z0-9]{16,}/gu, '[redacted-key]')
    .replace(/\s+/gu, ' ')
    .slice(0, 512);
}
