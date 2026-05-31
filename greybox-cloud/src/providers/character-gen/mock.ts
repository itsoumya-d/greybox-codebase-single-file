// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

// Deterministic mock character generation provider.
//
// Two roles:
//
//   1. Powers the offline test suite (no network, no API keys, predictable
//      lifecycle so the character-flow integration test can assert on
//      every state transition).
//   2. Powers development environments where Meshy/Tripo3D keys are absent,
//      so the page-by-page editor and the prototype runner can exercise
//      the full submit -> poll -> done -> import path against a real
//      fixture glTF without burning external credits.
//
// Determinism comes from the input `seed`. Same prompt + seed produces the
// same simulated duration, the same fixture glTF, and the same job ids.

import { createHash } from 'node:crypto';
import {
  CharacterGenConfigError,
  CharacterGenInputError,
  parseCharacterGenInput,
  type CharacterGenInput,
  type CharacterGenJobStatus,
  type CharacterGenProvider,
  type CharacterGenProviderDescriptor,
  type CharacterStyle,
} from './types.js';

export interface MockCharacterGenProviderOptions {
  /**
   * URL of the fixture glTF the provider returns as the "done" output. If
   * unset, `GREYBOX_CHARACTER_MOCK_FIXTURE_URL` is read from process.env;
   * if that is also unset, a default in-repo fixture URL is used.
   */
  fixtureUrl?: string;
  /**
   * URL of a fixture thumbnail. Falls back to a deterministic data URI.
   */
  thumbnailUrl?: string;
  /**
   * Total simulated duration, in milliseconds. Defaults to 10_000 (10s) as
   * required by the stream spec. Lowered to a few milliseconds in tests so
   * the integration test runs fast.
   */
  totalDurationMs?: number;
  /**
   * Testable clock; defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * License string baked into the "done" outputs. Defaults to CC-BY-4.0.
   */
  license?: string;
}

const DEFAULT_FIXTURE_URL = 'https://greybox-fixtures.s3.amazonaws.com/character-gen/mock-character.glb';
const DEFAULT_THUMBNAIL_URL = 'https://greybox-fixtures.s3.amazonaws.com/character-gen/mock-character.png';
const DEFAULT_DURATION_MS = 10_000;
const DEFAULT_LICENSE = 'CC-BY-4.0';

interface MockJob {
  startedAt: number;
  durationMs: number;
  input: CharacterGenInput;
  /** If non-undefined, the job is forced into this terminal state. */
  forcedFailure?: string;
}

/**
 * Mock provider; see file header for rationale. The provider keeps its own
 * in-memory job map keyed by jobId. The map is *not* the canonical store —
 * the `CharacterJobStore` is — but it lets the mock report progress
 * proportional to elapsed time across polls.
 */
export class MockCharacterGenProvider implements CharacterGenProvider {
  readonly name = 'mock';
  readonly descriptor: CharacterGenProviderDescriptor = {
    name: 'mock',
    requiresApiKey: false,
    styles: ['realistic', 'stylized', 'anime', 'low-poly', 'cartoon'],
    supportsRig: true,
  };

  private readonly jobs = new Map<string, MockJob>();
  private readonly fixtureUrl: string;
  private readonly thumbnailUrl: string;
  private readonly totalDurationMs: number;
  private readonly now: () => number;
  private readonly license: string;

  constructor(options: MockCharacterGenProviderOptions = {}) {
    this.fixtureUrl = options.fixtureUrl
      ?? process.env.GREYBOX_CHARACTER_MOCK_FIXTURE_URL
      ?? DEFAULT_FIXTURE_URL;
    this.thumbnailUrl = options.thumbnailUrl
      ?? process.env.GREYBOX_CHARACTER_MOCK_THUMBNAIL_URL
      ?? DEFAULT_THUMBNAIL_URL;
    const envDuration = process.env.GREYBOX_CHARACTER_MOCK_DURATION_MS;
    const parsedEnvDuration = envDuration ? Number.parseInt(envDuration, 10) : NaN;
    this.totalDurationMs = options.totalDurationMs
      ?? (Number.isFinite(parsedEnvDuration) && parsedEnvDuration > 0
        ? parsedEnvDuration
        : DEFAULT_DURATION_MS);
    this.now = options.now ?? Date.now;
    this.license = options.license ?? DEFAULT_LICENSE;
  }

  async submitJob(input: CharacterGenInput): Promise<{ jobId: string }> {
    // Re-parse defensively so tests calling submitJob directly still get
    // the same shape guarantees as the router path.
    parseCharacterGenInput({
      prompt: input.prompt,
      style: input.style,
      rigged: input.rigged,
      targetPolyCount: input.targetPolyCount,
      ...(input.referenceImageUrl !== undefined ? { referenceImageUrl: input.referenceImageUrl } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    });
    const jobId = mockJobId(input);
    // Deterministic per-seed duration jitter: stays within ±25% of total.
    const seed = input.seed ?? hashToSeed(input.prompt);
    const jitter = (seed % 1000) / 1000 - 0.5; // -0.5..0.5
    const durationMs = Math.max(1, Math.round(this.totalDurationMs * (1 + jitter * 0.5)));
    // Failure injection: prompts containing "FAIL" force a terminal failure.
    const forcedFailure = /\bFAIL\b/u.test(input.prompt)
      ? 'mock provider forced failure (prompt contained FAIL)'
      : undefined;
    this.jobs.set(jobId, {
      startedAt: this.now(),
      durationMs,
      input,
      ...(forcedFailure ? { forcedFailure } : {}),
    });
    return { jobId };
  }

  async pollJob(jobId: string): Promise<CharacterGenJobStatus> {
    const job = this.jobs.get(jobId);
    if (!job) throw new CharacterGenConfigError(`mock provider has no record of job ${jobId}`);
    const elapsed = this.now() - job.startedAt;
    if (job.forcedFailure && elapsed >= job.durationMs / 3) {
      return {
        state: 'failed',
        error: job.forcedFailure,
        failedAt: new Date(job.startedAt + Math.round(job.durationMs / 3)).toISOString(),
      };
    }
    if (elapsed < 0) {
      return { state: 'queued', queuedAt: new Date(job.startedAt).toISOString() };
    }
    if (elapsed < job.durationMs / 10) {
      return { state: 'queued', queuedAt: new Date(job.startedAt).toISOString() };
    }
    if (elapsed < job.durationMs) {
      const percent = Math.min(99, Math.max(1, Math.round((elapsed / job.durationMs) * 100)));
      return { state: 'processing', percent };
    }
    return {
      state: 'done',
      outputs: {
        gltfUrl: this.fixtureUrl,
        thumbnailUrl: this.thumbnailUrl,
        license: this.license,
      },
      completedAt: new Date(job.startedAt + job.durationMs).toISOString(),
    };
  }

  /**
   * Test helper: fast-forward the clock for a job. Not part of the public
   * provider interface.
   */
  advanceForTesting(jobId: string, deltaMs: number): void {
    const job = this.jobs.get(jobId);
    if (!job) throw new CharacterGenInputError(`unknown job ${jobId}`);
    job.startedAt -= deltaMs;
  }
}

/**
 * Stable hash from prompt/style/seed -> jobId. Determinism is the whole
 * point of the mock so we use SHA-256 not a random id.
 */
export function mockJobId(input: CharacterGenInput): string {
  const fingerprint = [
    input.prompt,
    input.style,
    String(input.rigged),
    String(input.targetPolyCount),
    input.referenceImageUrl ?? '',
    input.seed === undefined ? 'auto' : String(input.seed),
  ].join('\n');
  return `mock_${createHash('sha256').update(fingerprint).digest('hex').slice(0, 24)}`;
}

function hashToSeed(value: string): number {
  let acc = 0;
  for (let i = 0; i < value.length; i++) {
    acc = (acc * 31 + value.charCodeAt(i)) >>> 0;
  }
  return acc;
}

/** Re-exported style enum for tests. */
export type { CharacterStyle };
