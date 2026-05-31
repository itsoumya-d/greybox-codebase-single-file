// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { FileBillingLedger, FileUsageSink } from '../src/metering/billingLedger.js';
import { estimateUsage } from '../src/metering/tokenCounter.js';
import { MemoryUsageSink, StripeMeteredBillingSink, UsageEmitter, type UsageSink } from '../src/metering/usageEmitter.js';
import { LangfuseBridge } from '../src/observability/langfuse.js';
import { MetricsRegistry } from '../src/observability/metrics.js';
import { ProviderHttpError } from '../src/providers/errors.js';
import { providerPolicyFromEnv } from '../src/providers/selector.js';
import { InferenceService, encodeSse, toSseChunks } from '../src/routers/inference.js';
import { TenantStore, type TenantSnapshot } from '../src/routers/tenants.js';
import type { AuthContext, InferenceRequest, InferenceResult, ProviderCandidate, ProviderClient } from '../src/types.js';

class MockProvider implements ProviderClient {
  readonly candidate: ProviderCandidate;
  lastRequest?: InferenceRequest;

  constructor(candidate: ProviderCandidate, private readonly behavior: 'fail' | 'succeed') {
    this.candidate = candidate;
  }

  async complete(request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    this.lastRequest = request;
    if (this.behavior === 'fail') throw new Error(`${this.candidate.provider} unavailable`);
    const text = 'Tighten the jump arc, mark the checkpoint, and export the HUD scale override.';
    return {
      provider: this.candidate.provider,
      model: this.candidate.model,
      text,
      usage: estimateUsage(request.messages, text),
      redactedLog: {},
    };
  }
}

type ProviderStep = 'succeed' | Error;

class SequenceProvider implements ProviderClient {
  readonly candidate: ProviderCandidate;
  calls = 0;

  constructor(candidate: ProviderCandidate, private readonly steps: ProviderStep[]) {
    this.candidate = candidate;
  }

  async complete(request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    const step = this.steps[Math.min(this.calls, this.steps.length - 1)] ?? 'succeed';
    this.calls += 1;
    if (step instanceof Error) throw step;
    const text = `Provider ${this.candidate.provider} completed attempt ${this.calls}.`;
    return {
      provider: this.candidate.provider,
      model: this.candidate.model,
      text,
      usage: estimateUsage(request.messages, text),
      redactedLog: {},
    };
  }
}

class FixedUsageProvider implements ProviderClient {
  readonly candidate: ProviderCandidate;

  constructor(candidate: ProviderCandidate, private readonly usage: { inputTokens: number; outputTokens: number }) {
    this.candidate = candidate;
  }

  async complete(_request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    return {
      provider: this.candidate.provider,
      model: this.candidate.model,
      text: 'fixed usage response',
      usage: this.usage,
      redactedLog: {},
    };
  }
}

class MalformedResultProvider implements ProviderClient {
  readonly candidate: ProviderCandidate;
  calls = 0;

  constructor(
    candidate: ProviderCandidate,
    private readonly result: Partial<InferenceResult> & { usage?: unknown },
  ) {
    this.candidate = candidate;
  }

  async complete(_request: InferenceRequest, _context: AuthContext): Promise<InferenceResult> {
    this.calls += 1;
    return {
      provider: this.candidate.provider,
      model: this.candidate.model,
      text: 'malformed provider response',
      redactedLog: {},
      usage: { inputTokens: 1, outputTokens: 1 },
      ...this.result,
    } as InferenceResult;
  }
}

class FailingUsageSink implements UsageSink {
  calls = 0;

  async emit(): Promise<void> {
    this.calls += 1;
    throw new Error('usage ledger unavailable for lead@example.com');
  }
}

class FailingLangfuseBridge extends LangfuseBridge {
  calls = 0;

  async trace(): Promise<never> {
    this.calls += 1;
    throw new Error('Langfuse unavailable for lead@example.com');
  }
}

const context: AuthContext = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  tier: 'studio',
  tokenHash: 'hash',
  roles: ['designer'],
};

const request: InferenceRequest = {
  projectId: 'project-a',
  task: 'design',
  metadata: { contact: 'lead@example.com', 'owner@example.com': 'producer metadata key' },
  messages: [{ role: 'user', content: 'Tune this 2D platformer. Email lead@example.com if stuck.' }],
};

const anthropicDesignCandidate: ProviderCandidate = {
  provider: 'anthropic',
  model: 'claude-sonnet-4.5',
  inputCostPer1K: 0.012,
  outputCostPer1K: 0.04,
  supports: ['design', 'cheap-chat'],
  slaMs: 200,
  available: true,
};

const openAiDesignCandidate: ProviderCandidate = {
  provider: 'openai',
  model: 'gpt-4.1-mini',
  inputCostPer1K: 0.003,
  outputCostPer1K: 0.012,
  supports: ['design', 'cheap-chat'],
  slaMs: 150,
  available: true,
};

const bedrockDesignCandidate: ProviderCandidate = {
  provider: 'bedrock',
  model: 'anthropic.claude-3-5-sonnet',
  inputCostPer1K: 0.01,
  outputCostPer1K: 0.035,
  supports: ['design', 'cheap-chat'],
  slaMs: 300,
  available: true,
};

test('inference fails over and emits audited usage with redacted logs', async () => {
  const usageSink = new MemoryUsageSink();
  const langfuse = new LangfuseBridge();
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [
      new MockProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4.5',
        inputCostPer1K: 0.012,
        outputCostPer1K: 0.04,
        supports: ['design'],
        slaMs: 100,
        available: true,
      }, 'fail'),
      new MockProvider({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.012,
        supports: ['design'],
        slaMs: 200,
        available: true,
      }, 'succeed'),
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse,
    metrics,
  });

  const result = await service.run(request, context);
  assert.equal(result.provider, 'openai');
  assert.equal(usageSink.events.length, 1);
  assert.equal(usageSink.events[0].tenantId, 'tenant-a');
  assert.equal(langfuse.traces.length, 1);
  assert.deepEqual(metrics.snapshot()['inference.success.openai'], 1);
  assert.deepEqual(metrics.snapshot()['inference.failover.anthropic'], 1);
  const openAiLatency = metrics.snapshot()['inference.latency_ms.openai'] as { count?: number };
  const allLatency = metrics.snapshot()['inference.latency_ms.all'] as { count?: number };
  const openAiCost = metrics.snapshot()['inference.cost_cents.openai'] as { count?: number; sum?: number };
  assert.equal(openAiLatency.count, 1);
  assert.equal(allLatency.count, 1);
  assert.equal(openAiCost.count, 1);
  assert.ok((openAiCost.sum ?? 0) > 0);
  assert.ok(!JSON.stringify(result.redactedLog).includes('lead@example.com'));
  assert.ok(!JSON.stringify(result.redactedLog).includes('owner@example.com'));
  assert.ok(!JSON.stringify(langfuse.traces[0]).includes('owner@example.com'));
  assert.ok(JSON.stringify(result.redactedLog).includes('[REDACTED_EMAIL]'));
});

test('managed inference redacts PII before provider calls, billing, and traces', async () => {
  const usageSink = new MemoryUsageSink();
  const langfuse = new LangfuseBridge();
  const provider = new MockProvider(openAiDesignCandidate, 'succeed');
  const service = new InferenceService({
    providers: [provider],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse,
    metrics: new MetricsRegistry(),
  });
  const piiRequest: InferenceRequest = {
    ...request,
    projectId: 'project-lead@example.com',
    metadata: {
      'owner@example.com': 'Call +1 (415) 555-0100 before billing 4111 1111 1111 1111.',
    },
    messages: [
      { role: 'user', content: 'Email lead@example.com from 2001:db8::1 if the HUD pass is blocked.' },
    ],
  };

  const result = await service.run(piiRequest, context);
  const providerPayload = JSON.stringify(provider.lastRequest);
  const emittedUsage = JSON.stringify(usageSink.events);
  const tracePayload = JSON.stringify(langfuse.traces);

  for (const payload of [providerPayload, emittedUsage, tracePayload, JSON.stringify(result.redactedLog)]) {
    assert.ok(!payload.includes('lead@example.com'));
    assert.ok(!payload.includes('owner@example.com'));
    assert.ok(!payload.includes('+1 (415) 555-0100'));
    assert.ok(!payload.includes('4111 1111 1111 1111'));
    assert.ok(!payload.includes('2001:db8::1'));
  }
  assert.ok(providerPayload.includes('[REDACTED_EMAIL]'));
  assert.ok(providerPayload.includes('[REDACTED_PHONE]'));
  assert.ok(providerPayload.includes('[REDACTED_CARD]'));
  assert.ok(providerPayload.includes('[REDACTED_IP]'));
  assert.deepEqual(result.redactedLog.pii, {
    redacted: true,
    types: ['email', 'phone', 'ip', 'card'],
    counts: { email: 3, phone: 1, ip: 1, card: 1 },
  });
});

test('managed inference propagates request IDs into usage, traces, and redacted logs', async () => {
  const usageSink = new MemoryUsageSink();
  const langfuse = new LangfuseBridge();
  const service = new InferenceService({
    providers: [new MockProvider(openAiDesignCandidate, 'succeed')],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse,
    metrics: new MetricsRegistry(),
  });

  const result = await service.run(request, {
    ...context,
    requestId: 'req_cloud_inference_trace_123',
  });

  assert.equal(result.redactedLog.requestId, 'req_cloud_inference_trace_123');
  assert.equal(usageSink.events[0]?.requestId, 'req_cloud_inference_trace_123');
  assert.equal(langfuse.traces[0]?.metadata.requestId, 'req_cloud_inference_trace_123');
});

test('free tier cannot use managed inference', async () => {
  const service = new InferenceService({
    providers: [
      new MockProvider({
        provider: 'openai',
        model: 'gpt-4.1-mini',
        inputCostPer1K: 0.003,
        outputCostPer1K: 0.012,
        supports: ['design'],
        slaMs: 200,
        available: true,
      }, 'succeed'),
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  await assert.rejects(
    () => service.run(request, { ...context, tier: 'free' }),
    /Managed inference is not available/u,
  );
});

test('managed inference refreshes durable tenant snapshots before provider selection', async () => {
  let refreshed = false;
  const snapshot: TenantSnapshot = {
    version: 1,
    tenants: [{
      id: 'tenant-durable',
      tier: 'enterprise',
      region: 'us',
      ssoEnabled: true,
      monthlyInputTokensIncluded: 50_000_000,
      monthlyOutputTokensIncluded: 10_000_000,
    }],
    organizationTenantIds: [],
  };
  const tenants = new TenantStore({
    persister: {
      loadSync: () => refreshed ? snapshot : undefined,
      saveSync: () => undefined,
      refresh: async () => {
        refreshed = true;
      },
    },
  });
  const service = new InferenceService({
    providers: [new MockProvider(openAiDesignCandidate, 'succeed')],
    tenants,
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  const result = await service.run(request, {
    ...context,
    tenantId: 'tenant-durable',
    tier: 'free',
  });

  assert.equal(refreshed, true);
  assert.equal(result.provider, 'openai');
});

test('provider routing uses task defaults unless tenant or request preferences override', async () => {
  const tenants = new TenantStore();
  const usageSink = new MemoryUsageSink();
  const service = new InferenceService({
    providers: [
      new MockProvider(anthropicDesignCandidate, 'succeed'),
      new MockProvider(openAiDesignCandidate, 'succeed'),
    ],
    tenants,
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  const design = await service.run(request, { ...context, tier: 'indie' });
  assert.equal(design.provider, 'anthropic');

  const cheapChat = await service.run({ ...request, task: 'cheap-chat' }, context);
  assert.equal(cheapChat.provider, 'openai');

  tenants.upsert({
    ...tenants.getOrCreate('tenant-pref', 'studio'),
    preferredProvider: 'openai',
  });
  const tenantPreferred = await service.run(request, { ...context, tenantId: 'tenant-pref' });
  assert.equal(tenantPreferred.provider, 'openai');

  const requestPreferred = await service.run({ ...request, preferredProvider: 'openai' }, context);
  assert.equal(requestPreferred.provider, 'openai');
  assert.equal(usageSink.events.length, 4);
});

test('provider policy enforces region and tenant approved provider lists', async () => {
  const tenants = new TenantStore();
  tenants.upsert({
    ...tenants.getOrCreate('tenant-block-openai', 'enterprise', { region: 'us' }),
    blockedProviders: ['openai'],
  });
  const service = new InferenceService({
    providers: [
      new MockProvider(anthropicDesignCandidate, 'succeed'),
      new MockProvider(openAiDesignCandidate, 'succeed'),
      new MockProvider(bedrockDesignCandidate, 'succeed'),
    ],
    providerPolicy: {
      regionAllowedProviders: {
        eu: ['bedrock'],
      },
    },
    tenants,
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  const euResult = await service.run(
    { ...request, preferredProvider: 'openai' },
    { ...context, tenantId: 'tenant-eu', tier: 'enterprise', dataResidencyRegion: 'eu' },
  );
  assert.equal(euResult.provider, 'bedrock');

  const blockedTenantResult = await service.run(
    { ...request, preferredProvider: 'openai' },
    { ...context, tenantId: 'tenant-block-openai', tier: 'enterprise', dataResidencyRegion: 'us' },
  );
  assert.equal(blockedTenantResult.provider, 'anthropic');
});

test('provider policy fails closed when all providers are disallowed', async () => {
  const service = new InferenceService({
    providers: [
      new MockProvider(anthropicDesignCandidate, 'succeed'),
      new MockProvider(openAiDesignCandidate, 'succeed'),
    ],
    providerPolicy: {
      allowedProviders: ['bedrock'],
    },
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  await assert.rejects(
    () => service.run(request, context),
    /Managed inference is not available/u,
  );
});

test('provider error messages are PII-redacted before surfacing', async () => {
  const service = new InferenceService({
    providers: [
      new SequenceProvider(openAiDesignCandidate, [
        new Error('Provider echo leaked lead@example.com and +1 (415) 555-0100.'),
      ]),
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  await assert.rejects(
    () => service.run(request, context),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes('lead@example.com'), false);
      assert.equal(error.message.includes('+1 (415) 555-0100'), false);
      assert.match(error.message, /\[REDACTED_EMAIL\]/u);
      assert.match(error.message, /\[REDACTED_PHONE\]/u);
      return true;
    },
  );
});

test('provider policy env parser normalizes approved providers and regions', () => {
  assert.deepEqual(providerPolicyFromEnv({ GREYBOX_PROVIDER_POLICY_JSON: 'not-json' }), {});
  assert.deepEqual(providerPolicyFromEnv({
    GREYBOX_PROVIDER_POLICY_JSON: JSON.stringify({
      allowedProviders: ['openai', 'bad-provider', 'anthropic'],
      blockedProviders: ['greybox-native'],
      regionAllowedProviders: { eu: ['bedrock'], in: ['greybox-native', 'nope'] },
      tenants: {
        'tenant-custom': { allowedProviders: ['openai'] },
      },
    }),
  }), {
    allowedProviders: ['openai', 'anthropic'],
    blockedProviders: ['greybox-native'],
    regionAllowedProviders: {
      eu: ['bedrock'],
      in: ['greybox-native'],
    },
    tenants: {
      'tenant-custom': { allowedProviders: ['openai'] },
    },
  });
});

test('transient provider errors retry once before failover', async () => {
  const anthropic = new SequenceProvider(anthropicDesignCandidate, [
    new ProviderHttpError('anthropic', 503),
    'succeed',
  ]);
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [
      anthropic,
      new SequenceProvider(openAiDesignCandidate, ['succeed']),
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics,
  });

  const result = await service.run(request, context);
  assert.equal(result.provider, 'anthropic');
  assert.equal(anthropic.calls, 2);
  assert.deepEqual(metrics.snapshot()['inference.retry.anthropic'], 1);
  assert.equal(metrics.snapshot()['inference.failover.anthropic'], undefined);
});

test('usage events classify included monthly tokens and overage before invoicing', async () => {
  const tenants = new TenantStore();
  const tinyTenant = tenants.getOrCreate('tenant-quota', 'studio');
  tenants.upsert({
    ...tinyTenant,
    monthlyInputTokensIncluded: 100,
    monthlyOutputTokensIncluded: 50,
  });
  const usageSink = new MemoryUsageSink();
  const service = new InferenceService({
    providers: [
      new FixedUsageProvider(openAiDesignCandidate, { inputTokens: 80, outputTokens: 40 }),
    ],
    tenants,
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  await service.run(request, { ...context, tenantId: 'tenant-quota' });
  await service.run(request, { ...context, tenantId: 'tenant-quota' });

  assert.equal(usageSink.events.length, 2);
  assert.deepEqual(usageSink.events.map((event) => ({
    includedInputTokensApplied: event.includedInputTokensApplied,
    includedOutputTokensApplied: event.includedOutputTokensApplied,
    billableInputTokens: event.billableInputTokens,
    billableOutputTokens: event.billableOutputTokens,
  })), [
    {
      includedInputTokensApplied: 80,
      includedOutputTokensApplied: 40,
      billableInputTokens: 0,
      billableOutputTokens: 0,
    },
    {
      includedInputTokensApplied: 20,
      includedOutputTokensApplied: 10,
      billableInputTokens: 60,
      billableOutputTokens: 30,
    },
  ]);
  assert.match(usageSink.events[0]?.billingPeriodStart ?? '', /^20\d\d-\d\d-01T00:00:00\.000Z$/u);
});

test('ledger-backed usage metering does not reapply included quota after emitter restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-usage-ledger-'));
  try {
    const tenants = new TenantStore();
    const tinyTenant = tenants.getOrCreate('tenant-ledger-quota', 'studio');
    tenants.upsert({
      ...tinyTenant,
      monthlyInputTokensIncluded: 100,
      monthlyOutputTokensIncluded: 50,
    });
    const ledger = new FileBillingLedger(dir);
    const firstSink = new MemoryUsageSink();
    const firstService = new InferenceService({
      providers: [
        new FixedUsageProvider(openAiDesignCandidate, { inputTokens: 80, outputTokens: 40 }),
      ],
      tenants,
      usageEmitter: new UsageEmitter([firstSink, new FileUsageSink(ledger)]),
      langfuse: new LangfuseBridge(),
      metrics: new MetricsRegistry(),
    });

    await firstService.run(request, { ...context, tenantId: 'tenant-ledger-quota' });

    const restartedSink = new MemoryUsageSink();
    const restartedService = new InferenceService({
      providers: [
        new FixedUsageProvider(openAiDesignCandidate, { inputTokens: 80, outputTokens: 40 }),
      ],
      tenants,
      usageEmitter: new UsageEmitter([restartedSink, new FileUsageSink(ledger)]),
      langfuse: new LangfuseBridge(),
      metrics: new MetricsRegistry(),
    });

    await restartedService.run(request, { ...context, tenantId: 'tenant-ledger-quota' });

    assert.deepEqual(firstSink.events.map((event) => ({
      includedInputTokensApplied: event.includedInputTokensApplied,
      includedOutputTokensApplied: event.includedOutputTokensApplied,
      billableInputTokens: event.billableInputTokens,
      billableOutputTokens: event.billableOutputTokens,
    })), [{
      includedInputTokensApplied: 80,
      includedOutputTokensApplied: 40,
      billableInputTokens: 0,
      billableOutputTokens: 0,
    }]);
    assert.deepEqual(restartedSink.events.map((event) => ({
      includedInputTokensApplied: event.includedInputTokensApplied,
      includedOutputTokensApplied: event.includedOutputTokensApplied,
      billableInputTokens: event.billableInputTokens,
      billableOutputTokens: event.billableOutputTokens,
    })), [{
      includedInputTokensApplied: 20,
      includedOutputTokensApplied: 10,
      billableInputTokens: 60,
      billableOutputTokens: 30,
    }]);
    assert.equal((await ledger.readUsageEvents()).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('file-backed usage sinks do not claim exact multi-replica reservation support', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'greybox-usage-ledger-'));
  try {
    const sink = new FileUsageSink(new FileBillingLedger(dir));
    assert.equal(typeof sink.reserveMonthlyUsage, 'undefined');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Stripe usage sink fails closed instead of silently pretending to meter inference', async () => {
  const sink = new StripeMeteredBillingSink('sk_test_metering');
  const usageSink = new MemoryUsageSink();
  const service = new InferenceService({
    providers: [new FixedUsageProvider(openAiDesignCandidate, { inputTokens: 120, outputTokens: 60 })],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink, sink]),
    langfuse: new LangfuseBridge(),
    metrics: new MetricsRegistry(),
  });

  await assert.rejects(
    () => service.run(request, context),
    /billing invoice job/u,
  );
  assert.equal(usageSink.events.length, 1);
});

test('usage metering failures do not retry or fail over after provider completion', async () => {
  const usageSink = new FailingUsageSink();
  const firstProvider = new SequenceProvider(anthropicDesignCandidate, ['succeed']);
  const secondProvider = new SequenceProvider(openAiDesignCandidate, ['succeed']);
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [
      firstProvider,
      secondProvider,
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse: new LangfuseBridge(),
    metrics,
  });

  await assert.rejects(
    () => service.run(request, context),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Usage metering failed after provider completion/u);
      assert.equal(error.message.includes('lead@example.com'), false);
      assert.match(error.message, /\[REDACTED_EMAIL\]/u);
      return true;
    },
  );

  assert.equal(firstProvider.calls, 1);
  assert.equal(secondProvider.calls, 0);
  assert.equal(usageSink.calls, 1);
  assert.deepEqual(metrics.snapshot()['inference.usage_emit_failed'], 1);
  assert.equal(metrics.snapshot()['inference.failover.anthropic'], undefined);
  assert.equal(metrics.snapshot()['inference.success.anthropic'], undefined);
});

test('managed inference rejects malformed provider usage before metering or success metrics', async () => {
  const malformed = new MalformedResultProvider(openAiDesignCandidate, {
    usage: { inputTokens: -1, outputTokens: Number.NaN },
  });
  const fallback = new SequenceProvider(anthropicDesignCandidate, ['succeed']);
  const usageSink = new MemoryUsageSink();
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [
      malformed,
      fallback,
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse: new LangfuseBridge(),
    metrics,
  });

  const result = await service.run({ ...request, preferredProvider: 'openai' }, context);

  assert.equal(result.provider, 'anthropic');
  assert.equal(malformed.calls, 1);
  assert.equal(fallback.calls, 1);
  assert.equal(usageSink.events.length, 1);
  assert.equal(usageSink.events[0]?.provider, 'anthropic');
  assert.deepEqual(metrics.snapshot()['inference.failover.openai'], 1);
  assert.equal(metrics.snapshot()['inference.success.openai'], undefined);
});

test('managed inference rejects provider identity drift before billing', async () => {
  const malformed = new MalformedResultProvider(openAiDesignCandidate, {
    provider: 'anthropic',
  });
  const usageSink = new MemoryUsageSink();
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [malformed],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse: new LangfuseBridge(),
    metrics,
  });

  await assert.rejects(
    () => service.run({ ...request, preferredProvider: 'openai' }, context),
    /mismatched provider identity/u,
  );
  assert.equal(usageSink.events.length, 0);
  assert.deepEqual(metrics.snapshot()['inference.failover.openai'], 1);
  assert.equal(metrics.snapshot()['inference.success.anthropic'], undefined);
});

test('observability failures are best-effort after usage metering succeeds', async () => {
  const usageSink = new MemoryUsageSink();
  const firstProvider = new SequenceProvider(anthropicDesignCandidate, ['succeed']);
  const secondProvider = new SequenceProvider(openAiDesignCandidate, ['succeed']);
  const langfuse = new FailingLangfuseBridge();
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [
      firstProvider,
      secondProvider,
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([usageSink]),
    langfuse,
    metrics,
  });

  const result = await service.run(request, context);

  assert.equal(result.provider, 'anthropic');
  assert.equal(firstProvider.calls, 1);
  assert.equal(secondProvider.calls, 0);
  assert.equal(usageSink.events.length, 1);
  assert.equal(langfuse.calls, 1);
  assert.deepEqual(metrics.snapshot()['inference.trace_failed'], 1);
  assert.deepEqual(metrics.snapshot()['inference.success.anthropic'], 1);
  assert.equal(metrics.snapshot()['inference.failover.anthropic'], undefined);
});

test('non-transient provider errors fail over without retrying', async () => {
  const anthropic = new SequenceProvider(anthropicDesignCandidate, [
    new ProviderHttpError('anthropic', 401),
    'succeed',
  ]);
  const metrics = new MetricsRegistry();
  const service = new InferenceService({
    providers: [
      anthropic,
      new SequenceProvider(openAiDesignCandidate, ['succeed']),
    ],
    tenants: new TenantStore(),
    usageEmitter: new UsageEmitter([new MemoryUsageSink()]),
    langfuse: new LangfuseBridge(),
    metrics,
  });

  const result = await service.run(request, context);
  assert.equal(result.provider, 'openai');
  assert.equal(anthropic.calls, 1);
  assert.deepEqual(metrics.snapshot()['inference.failover.anthropic'], 1);
  assert.equal(metrics.snapshot()['inference.retry.anthropic'], undefined);
});

test('SSE encoding matches event stream shape expected by the web proxy', () => {
  const result: InferenceResult = {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    text: 'Ship the artifact.',
    usage: { inputTokens: 12, outputTokens: 4 },
    redactedLog: {},
  };
  const sse = encodeSse(toSseChunks(result));
  assert.match(sse, /event: message_start/u);
  assert.match(sse, /event: content_delta/u);
  assert.match(sse, /event: message_stop/u);
  assert.match(sse, /"outputTokens":4/u);
});
