// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

export type PlanTier = 'free' | 'indie' | 'studio' | 'enterprise';

export type BillingProvider = 'stripe' | 'razorpay' | 'dodo' | 'lemonsqueezy' | 'none';

export type DataResidencyRegion = 'us' | 'eu' | 'in';

export type ProviderName = 'anthropic' | 'openai' | 'bedrock' | 'greybox-native';

export type InferenceTask = 'design' | 'cheap-chat' | 'playtest' | 'code' | 'vision';

export interface AuthContext {
  tenantId: string;
  userId: string;
  tier: PlanTier;
  tokenHash: string;
  roles: string[];
  requestId?: string;
  dataResidencyRegion?: DataResidencyRegion;
  authProvider?: 'dev' | 'managed-token' | 'workos';
  organizationId?: string;
  email?: string;
  scopes?: string[];
}

export interface TenantConfig {
  id: string;
  tier: PlanTier;
  organizationId?: string;
  billing?: TenantBillingConfig;
  preferredProvider?: ProviderName;
  allowedProviders?: ProviderName[];
  blockedProviders?: ProviderName[];
  region: DataResidencyRegion;
  monthlyInputTokensIncluded: number;
  monthlyOutputTokensIncluded: number;
  ssoEnabled: boolean;
}

export interface TenantBillingConfig {
  stripeCustomerId?: string;
  stripeMeterPayload?: {
    customerKey?: string;
    valueKey?: string;
  };
  billingProvider?: BillingProvider;
  billingRegion?: 'in' | 'global';
  razorpaySubscriptionId?: string;
  dodoSubscriptionId?: string;
  lemonsqueezySubscriptionId?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface InferenceRequest {
  projectId: string;
  task?: InferenceTask;
  preferredProvider?: ProviderName;
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  metadata?: Record<string, string>;
}

export interface InferenceChunk {
  type: 'message_start' | 'content_delta' | 'message_stop' | 'error';
  text?: string;
  error?: string;
  provider?: ProviderName;
  model?: string;
  usage?: TokenUsage;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface InferenceResult {
  provider: ProviderName;
  model: string;
  text: string;
  usage: TokenUsage;
  redactedLog: Record<string, unknown>;
}

export interface ProviderCandidate {
  provider: ProviderName;
  model: string;
  inputCostPer1K: number;
  outputCostPer1K: number;
  supports: InferenceTask[];
  slaMs: number;
  available: boolean;
}

export interface ProviderClient {
  readonly candidate: ProviderCandidate;
  complete(request: InferenceRequest, context: AuthContext): Promise<InferenceResult>;
}

export interface UsageEvent {
  id: string;
  requestId?: string;
  tenantId: string;
  userId: string;
  projectId: string;
  provider: ProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  includedInputTokensApplied?: number;
  includedOutputTokensApplied?: number;
  billableInputTokens?: number;
  billableOutputTokens?: number;
  createdAt: string;
}
