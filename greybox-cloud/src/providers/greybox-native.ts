// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import type { AuthContext, InferenceRequest, InferenceResult, ProviderCandidate, ProviderClient } from '../types.js';
import { estimateUsage } from '../metering/tokenCounter.js';
import { ProviderHttpError } from './errors.js';

export interface GreyboxNativeProviderOptions {
  endpointUrl?: string;
  apiKey?: string;
  model?: string;
  modelCard?: unknown;
  fetchFn?: typeof fetch;
}

export class GreyboxNativeProvider implements ProviderClient {
  readonly candidate: ProviderCandidate;
  private readonly endpointUrl?: string;
  private readonly apiKey?: string;
  private readonly modelCardAssessment: GreyboxNativeModelCardAssessment;
  private readonly fetchFn: typeof fetch;

  constructor(options: GreyboxNativeProviderOptions = {}) {
    this.endpointUrl = cleanEndpointUrl(options.endpointUrl ?? process.env.GREYBOX_NATIVE_INFERENCE_URL);
    this.apiKey = options.apiKey ?? process.env.GREYBOX_NATIVE_API_KEY;
    this.modelCardAssessment = assessGreyboxNativeModelCard(
      options.modelCard ?? greyboxNativeModelCardFromEnv(process.env),
      options.model ?? process.env.GREYBOX_NATIVE_MODEL ?? 'greybox-native-7b',
    );
    this.fetchFn = options.fetchFn ?? fetch;
    this.candidate = {
      provider: 'greybox-native',
      model: options.model ?? process.env.GREYBOX_NATIVE_MODEL ?? 'greybox-native-7b',
      inputCostPer1K: 0.0006,
      outputCostPer1K: 0.0018,
      supports: ['design', 'cheap-chat', 'playtest'],
      slaMs: 700,
      available: Boolean(this.endpointUrl && this.apiKey && this.modelCardAssessment.ready),
    };
  }

  async complete(request: InferenceRequest, context: AuthContext): Promise<InferenceResult> {
    if (!this.endpointUrl || !this.apiKey) {
      throw new Error('Greybox Native inference endpoint is not configured');
    }
    if (!this.modelCardAssessment.ready) {
      throw new Error(`Greybox Native model card is not approved: ${this.modelCardAssessment.failedChecks.join(',')}`);
    }
    const model = request.model ?? this.candidate.model;
    const response = await this.fetchFn(this.endpointUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        projectId: request.projectId,
        task: request.task ?? 'design',
        tenantId: context.tenantId,
        modelCardId: this.modelCardAssessment.modelCardId,
        corpusSha256: this.modelCardAssessment.corpusSha256,
        messages: request.messages,
        metadata: request.metadata ?? {},
      }),
    });
    if (!response.ok) {
      throw new ProviderHttpError('greybox-native', response.status, `Greybox Native ${response.status}`);
    }
    const body = await response.json() as GreyboxNativeResponse;
    const text = responseText(body);
    const usage = estimateUsage(request.messages, text);
    return {
      provider: 'greybox-native',
      model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : model,
      text,
      usage: {
        inputTokens: numberOr(body.usage?.inputTokens, body.usage?.prompt_tokens, body.inputTokens, usage.inputTokens),
        outputTokens: numberOr(body.usage?.outputTokens, body.usage?.completion_tokens, body.outputTokens, usage.outputTokens),
      },
      redactedLog: {},
    };
  }
}

export interface GreyboxNativeModelCard {
  id?: unknown;
  modelId?: unknown;
  corpusSha256?: unknown;
  readinessReportStatus?: unknown;
  consentedProjects?: unknown;
  eligibleArtifacts?: unknown;
  missingConsentDefault?: unknown;
  revokedConsentExcluded?: unknown;
  rawPayloadExcluded?: unknown;
  piiSweepPassed?: unknown;
  humanReviewGatePassed?: unknown;
  allowedUses?: unknown;
  trainingProviderDpa?: unknown;
  generatedAt?: unknown;
}

export interface GreyboxNativeModelCardAssessment {
  ready: boolean;
  modelCardId?: string;
  corpusSha256?: string;
  failedChecks: string[];
}

interface GreyboxNativeResponse {
  model?: unknown;
  text?: unknown;
  output?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  usage?: {
    inputTokens?: unknown;
    outputTokens?: unknown;
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
  };
  choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
}

const MINIMUM_CONSENTED_PROJECTS = 10_000;
const MINIMUM_ELIGIBLE_ARTIFACTS = 50_000;

export function greyboxNativeModelCardFromEnv(
  env: Record<string, string | undefined> = process.env,
): unknown {
  const raw = env.GREYBOX_NATIVE_MODEL_CARD_JSON;
  if (!raw?.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function assessGreyboxNativeModelCard(input: unknown, expectedModel: string): GreyboxNativeModelCardAssessment {
  const card = isRecord(input) ? input as GreyboxNativeModelCard : undefined;
  const failedChecks: string[] = [];
  if (!card) {
    return { ready: false, failedChecks: ['model_card_missing'] };
  }
  const modelCardId = cleanToken(card.id);
  const modelId = typeof card.modelId === 'string' ? card.modelId.trim() : '';
  const corpusSha256 = typeof card.corpusSha256 === 'string' && /^[a-f0-9]{64}$/u.test(card.corpusSha256.trim().toLowerCase())
    ? card.corpusSha256.trim().toLowerCase()
    : undefined;
  if (!modelCardId) failedChecks.push('model_card_id_missing');
  if (modelId !== expectedModel) failedChecks.push('model_id_mismatch');
  if (!corpusSha256) failedChecks.push('corpus_hash_missing');
  if (card.readinessReportStatus !== 'pass') failedChecks.push('readiness_report_not_passed');
  if (numberValue(card.consentedProjects) < MINIMUM_CONSENTED_PROJECTS) failedChecks.push('consented_project_threshold');
  if (numberValue(card.eligibleArtifacts) < MINIMUM_ELIGIBLE_ARTIFACTS) failedChecks.push('eligible_artifact_threshold');
  if (card.missingConsentDefault !== 'opted-out') failedChecks.push('missing_consent_not_opted_out');
  if (card.revokedConsentExcluded !== true) failedChecks.push('revoked_consent_not_excluded');
  if (card.rawPayloadExcluded !== true) failedChecks.push('raw_payload_not_excluded');
  if (card.piiSweepPassed !== true) failedChecks.push('pii_sweep_not_passed');
  if (card.humanReviewGatePassed !== true) failedChecks.push('human_review_gate_not_passed');
  if (!Array.isArray(card.allowedUses) || !card.allowedUses.includes('greybox-native-training')) {
    failedChecks.push('native_training_use_missing');
  }
  if (card.trainingProviderDpa !== true) failedChecks.push('training_provider_dpa_missing');
  return {
    ready: failedChecks.length === 0,
    ...(modelCardId ? { modelCardId } : {}),
    ...(corpusSha256 ? { corpusSha256 } : {}),
    failedChecks,
  };
}

function responseText(body: GreyboxNativeResponse): string {
  if (typeof body.text === 'string') return body.text;
  if (typeof body.output === 'string') return body.output;
  return body.choices
    ?.map((choice) => typeof choice.message?.content === 'string'
      ? choice.message.content
      : typeof choice.text === 'string'
        ? choice.text
        : '')
    .join('') ?? '';
}

function numberOr(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return 0;
}

function cleanToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  return /^[A-Za-z0-9:._-]{1,160}$/u.test(clean) ? clean : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanEndpointUrl(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}
