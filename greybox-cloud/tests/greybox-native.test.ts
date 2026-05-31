// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessGreyboxNativeModelCard,
  GreyboxNativeProvider,
  greyboxNativeModelCardFromEnv,
} from '../src/providers/greybox-native.js';
import type { AuthContext, InferenceRequest } from '../src/types.js';

const context: AuthContext = {
  tenantId: 'tenant-native',
  userId: 'designer-native',
  tier: 'studio',
  tokenHash: 'token-hash',
  roles: ['designer'],
};

const request: InferenceRequest = {
  projectId: 'project-native',
  task: 'design',
  messages: [{ role: 'user', content: 'Tighten the platformer jump feel.' }],
  metadata: { artifactType: 'gameview' },
};

function validModelCard(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'native-card-2026-05',
    modelId: 'greybox-native-7b-test',
    corpusSha256: 'a'.repeat(64),
    readinessReportStatus: 'pass',
    consentedProjects: 10_000,
    eligibleArtifacts: 50_000,
    missingConsentDefault: 'opted-out',
    revokedConsentExcluded: true,
    rawPayloadExcluded: true,
    piiSweepPassed: true,
    humanReviewGatePassed: true,
    allowedUses: ['greybox-native-training'],
    trainingProviderDpa: true,
    ...overrides,
  };
}

test('Greybox Native provider fails closed until endpoint, token, and model card are configured', async () => {
  const provider = new GreyboxNativeProvider({
    endpointUrl: 'https://native.greybox.studio/v1/inference',
    apiKey: 'native-secret',
    model: 'greybox-native-7b-test',
  });
  assert.equal(provider.candidate.provider, 'greybox-native');
  assert.equal(provider.candidate.available, false);
  await assert.rejects(
    () => provider.complete(request, context),
    /Greybox Native model card is not approved: model_card_missing/u,
  );
});

test('Greybox Native provider calls the configured hosted endpoint without leaking secrets', async () => {
  let observedUrl = '';
  let observedAuthorization = '';
  let observedBody: Record<string, unknown> = {};
  const provider = new GreyboxNativeProvider({
    endpointUrl: 'https://native.greybox.studio/v1/inference',
    apiKey: 'native-secret',
    model: 'greybox-native-7b-test',
    modelCard: validModelCard(),
    fetchFn: async (url, init) => {
      observedUrl = String(url);
      observedAuthorization = new Headers(init?.headers).get('authorization') ?? '';
      observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        model: 'greybox-native-7b-test',
        text: 'Reduce enemy HP, widen the safe jump window, and re-export the level board.',
        usage: { inputTokens: 42, outputTokens: 18 },
      });
    },
  });

  assert.equal(provider.candidate.available, true);
  assert.deepEqual(provider.candidate.supports, ['design', 'cheap-chat', 'playtest']);
  const result = await provider.complete(request, context);

  assert.equal(observedUrl, 'https://native.greybox.studio/v1/inference');
  assert.equal(observedAuthorization, 'Bearer native-secret');
  assert.equal(observedBody.model, 'greybox-native-7b-test');
  assert.equal(observedBody.projectId, 'project-native');
  assert.equal(observedBody.tenantId, 'tenant-native');
  assert.equal(observedBody.modelCardId, 'native-card-2026-05');
  assert.equal(observedBody.corpusSha256, 'a'.repeat(64));
  assert.deepEqual(observedBody.messages, request.messages);
  assert.equal(result.provider, 'greybox-native');
  assert.equal(result.model, 'greybox-native-7b-test');
  assert.equal(result.usage.inputTokens, 42);
  assert.equal(result.usage.outputTokens, 18);
  assert.doesNotMatch(JSON.stringify(result), /native-secret/u);
});

test('Greybox Native provider rejects non-local insecure endpoints', () => {
  assert.equal(new GreyboxNativeProvider({
    endpointUrl: 'http://native.greybox.studio/v1/inference',
    apiKey: 'native-secret',
    model: 'greybox-native-7b-test',
    modelCard: validModelCard(),
  }).candidate.available, false);
  assert.equal(new GreyboxNativeProvider({
    endpointUrl: 'http://127.0.0.1:8081/v1/inference',
    apiKey: 'native-secret',
    model: 'greybox-native-7b-test',
    modelCard: validModelCard(),
  }).candidate.available, true);
});

test('Greybox Native model card gate enforces consented corpus provenance', () => {
  const good = assessGreyboxNativeModelCard(validModelCard(), 'greybox-native-7b-test');
  assert.equal(good.ready, true);
  assert.equal(good.modelCardId, 'native-card-2026-05');

  const bad = assessGreyboxNativeModelCard({
    ...validModelCard({
      modelId: 'wrong-model',
      consentedProjects: 9_999,
      rawPayloadExcluded: false,
      piiSweepPassed: false,
    }),
    notes: 'secret project boss arena',
  }, 'greybox-native-7b-test');
  assert.equal(bad.ready, false);
  assert.deepEqual(bad.failedChecks, [
    'model_id_mismatch',
    'consented_project_threshold',
    'raw_payload_not_excluded',
    'pii_sweep_not_passed',
  ]);
  assert.doesNotMatch(JSON.stringify(bad), /secret project/u);
});

test('Greybox Native model card env parser ignores malformed JSON', () => {
  assert.equal(greyboxNativeModelCardFromEnv({ GREYBOX_NATIVE_MODEL_CARD_JSON: '{nope' }), undefined);
  assert.deepEqual(
    greyboxNativeModelCardFromEnv({ GREYBOX_NATIVE_MODEL_CARD_JSON: JSON.stringify(validModelCard()) }),
    validModelCard(),
  );
});
