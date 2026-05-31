// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Tripo3D character generation provider.
//
// API surface (as of 2026-Q1):
//
//   POST {BASE}/v2/openapi/task
//     headers: Authorization: Bearer ${API_KEY}
//     body: { type: "text_to_model", prompt, model_version, style, ... }
//     returns: { code: 0, data: { task_id: string } }
//
//   GET {BASE}/v2/openapi/task/{task_id}
//     returns: {
//       code: 0,
//       data: {
//         task_id, status: "queued"|"running"|"success"|"failed"|"cancelled",
//         progress: <0..100>,
//         output?: { model?: string, model_glb?: string, rendered_image?: string },
//         create_time, end_time, license?
//       }
//     }
//
// The cloud-side adapter normalises only the fields we depend on so that
// Tripo3D shape drift over time can be absorbed in this single file.

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

export interface Tripo3DProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  /** Optional override for the model_version param. */
  modelVersion?: string;
}

const DEFAULT_BASE_URL = 'https://api.tripo3d.ai';

const styleToTripo: Record<CharacterStyle, string> = {
  realistic: 'person:realistic',
  stylized: 'object:stylized',
  anime: 'object:anime',
  'low-poly': 'object:low-poly',
  cartoon: 'object:cartoon',
};

export class Tripo3DProvider implements CharacterGenProvider {
  readonly name = 'tripo3d';
  readonly descriptor: CharacterGenProviderDescriptor = {
    name: 'tripo3d',
    requiresApiKey: true,
    styles: ['realistic', 'stylized', 'anime', 'low-poly', 'cartoon'],
    supportsRig: true,
  };

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;
  private readonly modelVersion: string;

  constructor(options: Tripo3DProviderOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new CharacterGenConfigError('Tripo3D provider requires TRIPO3D_API_KEY');
    }
    this.apiKey = options.apiKey.trim();
    this.baseUrl = stripTrailingSlash(options.baseUrl ?? DEFAULT_BASE_URL);
    const candidate = options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!candidate) {
      throw new CharacterGenConfigError('Tripo3D provider needs fetch (no global fetch found)');
    }
    this.fetchFn = candidate;
    this.modelVersion = options.modelVersion ?? 'v2.5-20250123';
  }

  async submitJob(input: CharacterGenInput): Promise<{ jobId: string }> {
    const url = `${this.baseUrl}/v2/openapi/task`;
    const body: Record<string, unknown> = {
      type: 'text_to_model',
      prompt: input.prompt,
      style: styleToTripo[input.style],
      model_version: this.modelVersion,
      face_limit: input.targetPolyCount,
      texture: true,
      pbr: true,
    };
    if (input.referenceImageUrl) {
      body.image_url = input.referenceImageUrl;
      body.type = 'image_to_model';
    }
    if (typeof input.seed === 'number') body.seed = input.seed;
    if (input.rigged) {
      body.auto_rig = true;
      body.animation = ['idle', 'walk', 'run'];
    }

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await upstreamError(response, 'tripo3d submitJob');
    }
    const json = await parseJson(response);
    const jobId = extractTripoJobId(json);
    if (!jobId) {
      throw new CharacterGenUpstreamError('tripo3d submitJob: response missing task_id');
    }
    return { jobId };
  }

  async pollJob(jobId: string): Promise<CharacterGenJobStatus> {
    if (!jobId.trim()) throw new CharacterGenUpstreamError('tripo3d pollJob: empty jobId');
    const url = `${this.baseUrl}/v2/openapi/task/${encodeURIComponent(jobId)}`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      throw await upstreamError(response, 'tripo3d pollJob');
    }
    const json = await parseJson(response);
    return parseTripoStatus(json);
  }
}

interface TripoEnvelope {
  code?: number;
  message?: string;
  data?: TripoTaskData;
}

interface TripoTaskData {
  task_id?: string;
  status?: string;
  progress?: number;
  output?: {
    model?: string;
    model_glb?: string;
    pbr_model?: string;
    rendered_image?: string;
    thumbnail?: string;
  };
  create_time?: number;
  end_time?: number;
  license?: string;
  error?: string;
  fail_reason?: string;
}

export function parseTripoStatus(raw: unknown): CharacterGenJobStatus {
  if (!raw || typeof raw !== 'object') {
    throw new CharacterGenUpstreamError('tripo3d pollJob: response is not an object');
  }
  const env = raw as TripoEnvelope;
  if (typeof env.code === 'number' && env.code !== 0) {
    throw new CharacterGenUpstreamError(
      `tripo3d pollJob: upstream code=${env.code}: ${redactMessage(env.message ?? '')}`.trim(),
    );
  }
  const data = env.data;
  if (!data || typeof data !== 'object') {
    throw new CharacterGenUpstreamError('tripo3d pollJob: missing data envelope');
  }
  const status = (data.status ?? '').toLowerCase();
  switch (status) {
    case 'queued':
    case 'pending':
    case 'banned':
    case 'waiting': {
      return {
        state: 'queued',
        queuedAt: isoTimestamp(data.create_time) ?? new Date().toISOString(),
      };
    }
    case 'running':
    case 'processing':
    case 'in_progress': {
      const percent = typeof data.progress === 'number'
        ? clampPercent(data.progress)
        : 50;
      return { state: 'processing', percent };
    }
    case 'success':
    case 'succeeded':
    case 'completed': {
      const gltfUrl = data.output?.model_glb?.trim()
        ?? data.output?.pbr_model?.trim()
        ?? data.output?.model?.trim();
      if (!gltfUrl) {
        throw new CharacterGenUpstreamError('tripo3d pollJob: success but no model_glb output');
      }
      return {
        state: 'done',
        outputs: {
          gltfUrl,
          thumbnailUrl: data.output?.rendered_image?.trim()
            ?? data.output?.thumbnail?.trim()
            ?? '',
          license: data.license?.trim() || 'Tripo3D-Generated-Commercial-Use',
        },
        completedAt: isoTimestamp(data.end_time) ?? new Date().toISOString(),
      };
    }
    case 'failed':
    case 'cancelled':
    case 'canceled':
    case 'expired': {
      const message = data.fail_reason ?? data.error ?? `tripo3d job ${status}`;
      return {
        state: 'failed',
        error: redactMessage(message),
        failedAt: isoTimestamp(data.end_time) ?? new Date().toISOString(),
      };
    }
    default: {
      return { state: 'processing', percent: 50 };
    }
  }
}

export function extractTripoJobId(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const env = raw as TripoEnvelope;
  if (typeof env.code === 'number' && env.code !== 0) return undefined;
  const taskId = env.data?.task_id;
  if (typeof taskId === 'string' && taskId.trim()) return taskId.trim();
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
    // Swallow.
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
      // fall through
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
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

function redactMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/giu, 'Bearer [redacted]')
    .replace(/(?:sk|pk)[-_][A-Za-z0-9]{16,}/gu, '[redacted-key]')
    .replace(/\s+/gu, ' ')
    .slice(0, 512);
}
