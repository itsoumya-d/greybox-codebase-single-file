# Greybox Model-Training Consent

Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

Greybox does not train models on customer game content by default. Future
Greybox Native training jobs may only consume project or artifact data when an
authenticated user has recorded a separate explicit opt-in.

## Product Surface

Set `GREYBOX_MODEL_TRAINING_CONSENT_DIR` to enable the durable consent ledger.
Authenticated users use:

- `GET /v1/model-training-consent?projectId=<id>&artifactId=<optional-id>`
- `POST /v1/model-training-consent`

Admins use:

- `GET /v1/model-training/native-readiness?format=markdown`

The default state is `opted-out`. The product rejects `opted-in` records unless
the request includes both `separateCheckboxAccepted: true` and consent text that
explicitly mentions model training or Greybox Native. Opt-outs and revocations
can be recorded without a checkbox.

The readiness route is a gate, not a training export. It accepts only sanitized
candidate metadata from `GREYBOX_NATIVE_TRAINING_CANDIDATES_JSON`: project id,
optional artifact id, artifact type, content SHA-256, quality score, human
review flag, PII flag, and data-category labels. It fails closed on raw prompt,
output, HTML, markdown, artifact bodies, game-IP fields, PII, missing consent,
revoked consent, low quality scores, or missing human review.

Greybox Native inference also requires `GREYBOX_NATIVE_MODEL_CARD_JSON`. The
provider remains unavailable unless the model card points at the approved model,
has a corpus SHA-256, records a passing readiness report, clears the consent and
PII/human-review gates, and confirms training-provider DPA coverage.

## Audit Boundary

Consent recording writes `model_training.consent_recorded` to the hash-chained
audit log when audit logging is enabled. The audit entry stores status, source,
project, optional artifact id, allowed-use labels, data-category counts, and a
SHA-256 hash of the consent text. It does not store raw consent text, artifact
content, prompt content, game IP, API keys, or pasted secrets.

## Operating Rules

1. Treat missing consent records as `opted-out`.
2. Keep opt-in copy as a separate checkbox from terms acceptance, analytics,
   privacy requests, billing, or product updates.
3. Honor the latest record for the same tenant, user, project, and artifact.
4. Exclude revoked and opted-out projects from training exports.
5. Keep consent exports available for enterprise audit and privacy fulfillment.
6. Run the Native readiness gate before any fine-tuning job and keep the report
   free of customer artifact content.
7. Do not serve a Greybox Native model until its model-card gate passes.
